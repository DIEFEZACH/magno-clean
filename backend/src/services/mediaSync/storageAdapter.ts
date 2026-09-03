import { createHash } from "node:crypto";
import { assertSafeStoragePath } from "../storageObjectPath";

export type MediaStorageInspection =
  | { status: "missing" }
  | { status: "object"; bytes: Buffer; mimeType: string };

export type MediaStorageUploadResult = { status: "uploaded" } | { status: "existing" };

export interface MediaStorageAdapter {
  inspect(storagePath: string): Promise<MediaStorageInspection>;
  upload(storagePath: string, bytes: Buffer): Promise<MediaStorageUploadResult>;
}

export interface SupabaseMediaStorageConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  bucket: string;
  maxAttempts?: number;
  requestTimeoutMs?: number;
  retryBaseDelayMs?: number;
}

export interface SupabaseMediaStorageDependencies {
  request?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

export type MediaStorageOperation = "inspect" | "upload";

export class MediaStorageRequestError extends Error {
  readonly operation: MediaStorageOperation;
  readonly statusCode?: number;
  readonly retryable: boolean;

  constructor(operation: MediaStorageOperation, statusCode?: number, retryable = false) {
    const suffix = statusCode === undefined ? "network or timeout error" : `HTTP ${statusCode}`;
    super(`Storage ${operation} failed (${suffix})`);
    this.name = "MediaStorageRequestError";
    this.operation = operation;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export class MediaStorageConflictError extends Error {
  readonly operation = "upload" as const;
  readonly code = "REMOTE_OBJECT_CONFLICT" as const;

  constructor() {
    super("Storage upload conflict (remote object content differs)");
    this.name = "MediaStorageConflictError";
  }
}

const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ALLOWED_ATTEMPTS = 5;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const MAX_REMOTE_OBJECT_BYTES = 10 * 1024 * 1024;

function normalizedBaseUrl(rawValue: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error("A valid Supabase URL is required");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("A valid HTTPS Supabase URL is required");
  }
  return parsed.toString().replace(/\/$/, "");
}

function positiveInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer`);
  return value;
}

function encodeStoragePath(storagePath: string) {
  return storagePath.split("/").map(encodeURIComponent).join("/");
}

function isRetryableStatus(status: number) {
  return status === 429 || status >= 500;
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function discardResponseBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    // Response cleanup is best effort and must never expose a remote error body.
  }
}

async function readResponseBodyLimited(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REMOTE_OBJECT_BYTES) {
    await discardResponseBody(response);
    throw new MediaStorageRequestError("inspect", undefined, false);
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REMOTE_OBJECT_BYTES) {
        await reader.cancel();
        throw new MediaStorageRequestError("inspect", undefined, false);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export function createSupabaseMediaStorageAdapter(
  config: SupabaseMediaStorageConfig,
  dependencies: SupabaseMediaStorageDependencies = {},
): MediaStorageAdapter {
  const baseUrl = normalizedBaseUrl(config.supabaseUrl);
  if (!config.serviceRoleKey) throw new Error("Storage credentials are required");
  if (config.bucket !== "product-media") throw new Error("Storage bucket must be product-media");

  const maxAttempts = positiveInteger(config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, "maxAttempts");
  if (maxAttempts > MAX_ALLOWED_ATTEMPTS) throw new Error(`maxAttempts cannot exceed ${MAX_ALLOWED_ATTEMPTS}`);
  const requestTimeoutMs = positiveInteger(config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS, "requestTimeoutMs");
  const retryBaseDelayMs = config.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  if (!Number.isSafeInteger(retryBaseDelayMs) || retryBaseDelayMs < 0) {
    throw new Error("retryBaseDelayMs must be a non-negative integer");
  }

  const request = dependencies.request ?? fetch;
  const sleep = dependencies.sleep ?? wait;
  const storageBaseUrl = `${baseUrl}/storage/v1`;
  const encodedBucket = encodeURIComponent(config.bucket);
  const authorizationHeaders = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
  };

  async function requestOnce(
    operation: MediaStorageOperation,
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      return await request(url, { ...init, redirect: "manual", signal: controller.signal });
    } catch {
      throw new MediaStorageRequestError(operation, undefined, true);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function inspectWithRetry(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await requestOnce("inspect", url, init);
        if (!isRetryableStatus(response.status) || attempt === maxAttempts) return response;
        await discardResponseBody(response);
      } catch (error) {
        if (attempt === maxAttempts) throw error;
      }
      await sleep(retryBaseDelayMs * 2 ** (attempt - 1));
    }
    throw new MediaStorageRequestError("inspect", undefined, true);
  }

  const adapter: MediaStorageAdapter = {
    async inspect(storagePath) {
      assertSafeStoragePath(storagePath);
      const response = await inspectWithRetry(
        `${storageBaseUrl}/object/authenticated/${encodedBucket}/${encodeStoragePath(storagePath)}`,
        { method: "GET", headers: authorizationHeaders },
      );

      // Supabase Storage can report a missing authenticated object as either
      // 400 or 404, depending on its deployed API version.
      if (response.status === 400 || response.status === 404) {
        await discardResponseBody(response);
        return { status: "missing" };
      }
      if (!response.ok) {
        const status = response.status;
        await discardResponseBody(response);
        throw new MediaStorageRequestError("inspect", status, isRetryableStatus(status));
      }

      const mimeType = (response.headers.get("content-type") ?? "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      const bytes = await readResponseBodyLimited(response);
      return { status: "object", bytes, mimeType };
    },

    async upload(storagePath, bytes) {
      assertSafeStoragePath(storagePath);
      const body = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const uploadUrl = `${storageBaseUrl}/object/${encodedBucket}/${encodeStoragePath(storagePath)}`;
      const uploadInit: RequestInit = {
        method: "POST",
        headers: {
          ...authorizationHeaders,
          "Content-Type": "image/webp",
          "x-upsert": "false",
          "cache-control": "public, max-age=31536000, immutable",
        },
        body: body as unknown as BodyInit,
      };

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let failure: MediaStorageRequestError | undefined;
        try {
          const response = await requestOnce("upload", uploadUrl, uploadInit);
          if (response.ok) {
            await discardResponseBody(response);
            return { status: "uploaded" };
          }
          const status = response.status;
          await discardResponseBody(response);
          // Supabase may return 400 (Asset Already Exists) or 409 when a
          // concurrent creator wins the immutable path race. Reconcile both;
          // any other non-transient 4xx is final and must not be retried.
          if (!isRetryableStatus(status) && status !== 400 && status !== 409) {
            throw new MediaStorageRequestError("upload", status, false);
          }
          failure = new MediaStorageRequestError("upload", status, isRetryableStatus(status));
        } catch (error) {
          if (!(error instanceof MediaStorageRequestError) || !error.retryable) throw error;
          failure = error;
        }

        // A transient upload failure is ambiguous: the server may have stored
        // the bytes before the response was lost. Never issue another POST
        // until an authenticated GET proves the destination is still absent.
        const remote = await adapter.inspect(storagePath);
        if (remote.status === "object") {
          if (remote.mimeType === "image/webp" && sha256(remote.bytes) === sha256(bytes)) {
            return { status: "existing" };
          }
          throw new MediaStorageConflictError();
        }

        if (!failure.retryable || attempt === maxAttempts) throw failure;
        await sleep(retryBaseDelayMs * 2 ** (attempt - 1));
      }
      throw new MediaStorageRequestError("upload", undefined, true);
    },
  };

  return adapter;
}
