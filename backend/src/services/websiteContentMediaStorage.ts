import { createHash } from "node:crypto";
import { env } from "../config/env";
import { AppError } from "../errors/AppError";

const endpoint = `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1`;
const storageHeaders = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
};
export const WEBSITE_CONTENT_MEDIA_MAX_BYTES = 10 * 1024 * 1024;

export function assertSafeStoragePath(storagePath: string) {
  if (storagePath.length > 512 || storagePath.startsWith("/") || storagePath.endsWith("/")) {
    throw new AppError(400, "Ruta de Storage inválida");
  }
  const segments = storagePath.split("/");
  if (segments.length < 2 || segments.some((segment) => !/^[a-z0-9][a-z0-9._-]*$/.test(segment) || segment === "." || segment === "..")) {
    throw new AppError(400, "Ruta de Storage inválida");
  }
  if (!storagePath.endsWith(".webp")) throw new AppError(400, "El medio debe ser un archivo WebP");
}

function encodedPath(storagePath: string) {
  return storagePath.split("/").map(encodeURIComponent).join("/");
}

export function publicWebsiteContentMediaUrl(bucket: string, storagePath: string) {
  return `${endpoint}/object/public/${encodeURIComponent(bucket)}/${encodedPath(storagePath)}`;
}

export function readWebpDimensions(buffer: Buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    throw new AppError(400, "El objeto no contiene un WebP válido");
  }
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (data + size > buffer.length) break;
    if (type === "VP8X" && size >= 10) {
      return { width: 1 + buffer.readUIntLE(data + 4, 3), height: 1 + buffer.readUIntLE(data + 7, 3) };
    }
    if (type === "VP8 " && size >= 10 && buffer[data + 3] === 0x9d && buffer[data + 4] === 0x01 && buffer[data + 5] === 0x2a) {
      return { width: buffer.readUInt16LE(data + 6) & 0x3fff, height: buffer.readUInt16LE(data + 8) & 0x3fff };
    }
    if (type === "VP8L" && size >= 5 && buffer[data] === 0x2f) {
      const bits = buffer.readUInt32LE(data + 1);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
    }
    offset = data + size + (size % 2);
  }
  throw new AppError(400, "No fue posible leer las dimensiones del WebP");
}

export async function inspectWebsiteContentMedia(
  bucket: string,
  storagePath: string,
  expectedSha256: string,
  request: typeof fetch = fetch,
) {
  if (bucket !== env.SUPABASE_PRODUCT_MEDIA_BUCKET) throw new AppError(400, "Bucket editorial no permitido");
  assertSafeStoragePath(storagePath);
  const response = await request(`${endpoint}/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath(storagePath)}`, {
    headers: storageHeaders,
  });
  // Supabase Storage currently returns 400 for an authenticated GET when the
  // object is absent, while other compatible Storage versions may use 404.
  if (response.status === 400 || response.status === 404) throw new AppError(400, "El objeto indicado no existe en Storage");
  if (!response.ok) throw new AppError(502, "No fue posible verificar el objeto en Storage");
  const contentType = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "image/webp") throw new AppError(400, "El objeto debe tener Content-Type image/webp");
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > WEBSITE_CONTENT_MEDIA_MAX_BYTES) throw new AppError(400, "El objeto supera el límite de 10 MB");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > WEBSITE_CONTENT_MEDIA_MAX_BYTES) throw new AppError(400, "El tamaño del objeto no es válido");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== expectedSha256) throw new AppError(400, "El SHA-256 no coincide con el objeto de Storage");
  const { width, height } = readWebpDimensions(bytes);
  if (width > 10_000 || height > 10_000) throw new AppError(400, "Las dimensiones del medio exceden el límite permitido");
  return { width, height, byteSize: bytes.length, mimeType: contentType, sha256 };
}
