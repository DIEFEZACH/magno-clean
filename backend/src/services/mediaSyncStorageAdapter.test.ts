import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupabaseMediaStorageAdapter,
  MediaStorageConflictError,
  MediaStorageRequestError,
  SupabaseMediaStorageConfig,
} from "./mediaSync/storageAdapter";

const secret = "service-role-secret-that-must-not-leak";
const config: SupabaseMediaStorageConfig = {
  supabaseUrl: "https://staging-ref.supabase.co",
  serviceRoleKey: secret,
  bucket: "product-media",
  maxAttempts: 3,
  requestTimeoutMs: 100,
  retryBaseDelayMs: 10,
};

test("inspect devuelve missing para respuestas 400/404 sin reintentar", async () => {
  for (const missingStatus of [400, 404]) {
    let requests = 0;
    const adapter = createSupabaseMediaStorageAdapter(config, {
      request: async () => {
        requests += 1;
        return new Response(null, { status: missingStatus });
      },
    });
    assert.deepEqual(await adapter.inspect("citrical/hero/hero-01.webp"), { status: "missing" });
    assert.equal(requests, 1);
  }
});

test("inspect usa GET autenticado, redirect manual y devuelve bytes y MIME", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  const adapter = createSupabaseMediaStorageAdapter(config, {
    request: async (url, init) => {
      requestedUrl = String(url);
      requestedInit = init;
      return new Response(Uint8Array.from([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/webp; charset=binary" },
      });
    },
  });

  const result = await adapter.inspect("citrical/hero/hero-01.webp");
  assert.equal(requestedUrl, "https://staging-ref.supabase.co/storage/v1/object/authenticated/product-media/citrical/hero/hero-01.webp");
  assert.equal(requestedInit?.method, "GET");
  assert.equal(requestedInit?.redirect, "manual");
  const headers = new Headers(requestedInit?.headers);
  assert.equal(headers.get("apikey"), secret);
  assert.equal(headers.get("authorization"), `Bearer ${secret}`);
  assert.equal(result.status, "object");
  if (result.status === "object") {
    assert.deepEqual(result.bytes, Buffer.from([1, 2, 3]));
    assert.equal(result.mimeType, "image/webp");
  }
});

test("inspect rechaza objetos remotos mayores de 10 MB antes de descargarlos", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() { cancelled = true; },
  });
  const adapter = createSupabaseMediaStorageAdapter(config, {
    request: async () => new Response(body, {
      status: 200,
      headers: {
        "content-type": "image/webp",
        "content-length": String(10 * 1024 * 1024 + 1),
      },
    }),
  });

  await assert.rejects(
    adapter.inspect("citrical/hero/hero-01.webp"),
    (error: unknown) => error instanceof MediaStorageRequestError && error.retryable === false,
  );
  assert.equal(cancelled, true);
});

test("upload usa POST no-upsert, caché immutable y bytes WebP", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  const adapter = createSupabaseMediaStorageAdapter(config, {
    request: async (url, init) => {
      requestedUrl = String(url);
      requestedInit = init;
      return new Response(null, { status: 201 });
    },
  });
  const bytes = Buffer.from([82, 73, 70, 70]);

  assert.deepEqual(await adapter.upload("citrical/hero/hero-01.webp", bytes), { status: "uploaded" });
  assert.equal(requestedUrl, "https://staging-ref.supabase.co/storage/v1/object/product-media/citrical/hero/hero-01.webp");
  assert.equal(requestedInit?.method, "POST");
  assert.equal(requestedInit?.redirect, "manual");
  const headers = new Headers(requestedInit?.headers);
  assert.equal(headers.get("content-type"), "image/webp");
  assert.equal(headers.get("x-upsert"), "false");
  assert.equal(headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.deepEqual(Buffer.from(requestedInit?.body as Uint8Array), bytes);
});

test("upload reconcilia un fallo transitorio antes de reintentar y acepta contenido idéntico", async () => {
  const bytes = Buffer.from("same-webp-bytes");
  const methods: string[] = [];
  const adapter = createSupabaseMediaStorageAdapter(config, {
    request: async (_url, init) => {
      methods.push(init?.method ?? "GET");
      if (init?.method === "POST") return new Response(null, { status: 503 });
      return new Response(bytes, { status: 200, headers: { "content-type": "image/webp" } });
    },
    sleep: async () => undefined,
  });

  assert.deepEqual(await adapter.upload("citrical/hero/hero-01.webp", bytes), { status: "existing" });
  assert.deepEqual(methods, ["POST", "GET"]);
});

test("upload falla con conflicto tipado si la reconciliación encuentra otros bytes", async () => {
  const methods: string[] = [];
  const adapter = createSupabaseMediaStorageAdapter(config, {
    request: async (_url, init) => {
      methods.push(init?.method ?? "GET");
      if (init?.method === "POST") return new Response(null, { status: 503 });
      return new Response("different", { status: 200, headers: { "content-type": "image/webp" } });
    },
    sleep: async () => undefined,
  });

  await assert.rejects(
    adapter.upload("citrical/hero/hero-01.webp", Buffer.from("expected")),
    (error: unknown) => error instanceof MediaStorageConflictError && error.code === "REMOTE_OBJECT_CONFLICT",
  );
  assert.deepEqual(methods, ["POST", "GET"]);
});

test("upload repite POST sólo después de confirmar que el path sigue ausente", async () => {
  const methods: string[] = [];
  const delays: number[] = [];
  let postCount = 0;
  const adapter = createSupabaseMediaStorageAdapter(config, {
    request: async (_url, init) => {
      const method = init?.method ?? "GET";
      methods.push(method);
      if (method === "GET") return new Response(null, { status: 404 });
      postCount += 1;
      return new Response(null, { status: postCount === 1 ? 503 : 201 });
    },
    sleep: async (milliseconds) => { delays.push(milliseconds); },
  });

  assert.deepEqual(
    await adapter.upload("citrical/hero/hero-01.webp", Buffer.from("expected")),
    { status: "uploaded" },
  );
  assert.deepEqual(methods, ["POST", "GET", "POST"]);
  assert.deepEqual(delays, [10]);
});

test("upload reconcilia respuestas 400/409 por carrera sin sobrescribir", async () => {
  for (const collisionStatus of [400, 409]) {
    const bytes = Buffer.from("already-there");
    const methods: string[] = [];
    const adapter = createSupabaseMediaStorageAdapter(config, {
      request: async (_url, init) => {
        methods.push(init?.method ?? "GET");
        if (init?.method === "POST") return new Response(null, { status: collisionStatus });
        return new Response(bytes, { status: 200, headers: { "content-type": "image/webp" } });
      },
    });

    assert.deepEqual(await adapter.upload("citrical/hero/hero-01.webp", bytes), { status: "existing" });
    assert.deepEqual(methods, ["POST", "GET"]);
  }
});

test("reintenta únicamente 429 y 5xx con backoff limitado", async () => {
  const statuses = [429, 503, 200];
  const delays: number[] = [];
  const adapter = createSupabaseMediaStorageAdapter(config, {
    request: async () => new Response(Uint8Array.from([1]), {
      status: statuses.shift()!,
      headers: { "content-type": "image/webp" },
    }),
    sleep: async (milliseconds) => { delays.push(milliseconds); },
  });

  const result = await adapter.inspect("citrical/hero/hero-01.webp");
  assert.equal(result.status, "object");
  assert.deepEqual(delays, [10, 20]);
});

test("no reintenta errores HTTP no transitorios ni sigue redirects", async () => {
  for (const status of [401, 403, 302]) {
    let requests = 0;
    const adapter = createSupabaseMediaStorageAdapter(config, {
      request: async () => {
        requests += 1;
        return new Response(`remote body containing ${secret}`, { status });
      },
    });
    await assert.rejects(
      adapter.upload("citrical/hero/hero-01.webp", Buffer.from([1])),
      (error: unknown) => {
        assert.ok(error instanceof MediaStorageRequestError);
        assert.equal(error.statusCode, status);
        assert.equal(error.retryable, false);
        assert.doesNotMatch(error.message, new RegExp(secret));
        assert.doesNotMatch(error.message, /remote body/);
        assert.doesNotMatch(error.message, /supabase\.co/);
        return true;
      },
    );
    assert.equal(requests, 1);
  }
});

test("reintenta errores de red y sanitiza el error final", async () => {
  let requests = 0;
  const adapter = createSupabaseMediaStorageAdapter(config, {
    request: async () => {
      requests += 1;
      throw new Error(`network failure with ${secret}`);
    },
    sleep: async () => undefined,
  });

  await assert.rejects(
    adapter.inspect("citrical/hero/hero-01.webp"),
    (error: unknown) => {
      assert.ok(error instanceof MediaStorageRequestError);
      assert.equal(error.statusCode, undefined);
      assert.equal(error.retryable, true);
      assert.doesNotMatch(error.message, new RegExp(secret));
      assert.doesNotMatch(error.message, /network failure/);
      return true;
    },
  );
  assert.equal(requests, 3);
});

test("aborta timeouts y limita el total de intentos", async () => {
  let requests = 0;
  const adapter = createSupabaseMediaStorageAdapter(
    { ...config, maxAttempts: 2, requestTimeoutMs: 5, retryBaseDelayMs: 0 },
    {
      request: async (_url, init) => {
        requests += 1;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        });
      },
      sleep: async () => undefined,
    },
  );

  await assert.rejects(
    adapter.inspect("citrical/hero/hero-01.webp"),
    (error: unknown) => error instanceof MediaStorageRequestError && error.retryable,
  );
  assert.equal(requests, 2);
});

test("rechaza rutas inseguras antes de cualquier request", async () => {
  let requests = 0;
  const adapter = createSupabaseMediaStorageAdapter(config, {
    request: async () => {
      requests += 1;
      return new Response(null, { status: 200 });
    },
  });

  await assert.rejects(adapter.inspect("citrical/../secret.webp"), /Ruta de Storage inválida/);
  assert.equal(requests, 0);
});

test("limita intentos configurables y no importa la configuración global", () => {
  assert.throws(
    () => createSupabaseMediaStorageAdapter({ ...config, maxAttempts: 6 }),
    /maxAttempts cannot exceed 5/,
  );
  assert.throws(
    () => createSupabaseMediaStorageAdapter({ ...config, bucket: "product-images" }),
    /Storage bucket must be product-media/,
  );
});
