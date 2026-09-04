export class CatalogUnavailableError extends Error {}

// One shared deadline for every page, response body and backoff. Cold starts may
// recover without allowing a build to wait indefinitely or publish partial data.
export const CATALOG_FETCH_LIMITS = Object.freeze({
  totalMs: 90_000,
  attemptMs: 20_000,
  attemptsPerPage: 4,
  initialBackoffMs: 2_000,
  maxBackoffMs: 8_000,
});

const defaultRuntime = {
  now: () => performance.now(),
  wallNow: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (timer) => clearTimeout(timer),
  sleep: (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
};

class TransientFailure extends Error {
  constructor(reason, retryAfterMs = 0) {
    super(reason);
    this.retryAfterMs = retryAfterMs;
  }
}

function retryAfter(value, wallNow) {
  if (typeof value !== "string" || !value.trim()) return 0;
  if (/^\d+$/.test(value.trim())) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - wallNow) : 0;
}

export function createCatalogRequestBudget({ runtime = defaultRuntime, logger = console } = {}) {
  return { runtime, logger, deadline: runtime.now() + CATALOG_FETCH_LIMITS.totalMs };
}

function unavailable(page, reason) {
  return new CatalogUnavailableError(`Catálogo no disponible: página ${page}, ${reason}; límite total ${CATALOG_FETCH_LIMITS.totalMs} ms. No se generó un catálogo parcial.`);
}

async function attempt(url, fetchImplementation, timeoutMs, runtime) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = runtime.setTimeout(() => {
      controller.abort();
      reject(new TransientFailure("timeout"));
    }, timeoutMs);
  });
  const request = async () => {
    let response;
    try {
      response = await fetchImplementation(url, { signal: controller.signal });
    } catch {
      // Do not log native exceptions: they can include URLs or upstream content.
      throw new TransientFailure(controller.signal.aborted ? "timeout" : "desconexión");
    }
    if (!response.ok) {
      // Preserve the received status: cleanup must never hang and turn a 403
      // into a retryable timeout (or make that response eligible for fallback).
      const delay = retryAfter(response.headers?.get("retry-after"), runtime.wallNow());
      controller.abort();
      if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
        throw new TransientFailure(`HTTP ${response.status}`, delay);
      }
      throw new Error(`La API del catálogo rechazó la consulta (HTTP ${response.status}).`);
    }
    try {
      return await response.json();
    } catch (error) {
      // Body disconnects/timeouts are transient; malformed JSON is not.
      if (controller.signal.aborted || ["AbortError", "TimeoutError", "TypeError"].includes(error?.name)) {
        throw new TransientFailure(controller.signal.aborted ? "timeout" : "desconexión del cuerpo");
      }
      throw new Error("Respuesta JSON del catálogo inválida.");
    }
  };
  try {
    return await Promise.race([request(), timeout]);
  } finally {
    runtime.clearTimeout(timer);
  }
}

export async function requestCatalogPage(url, page, fetchImplementation, budget) {
  const { runtime, logger, deadline } = budget;
  for (let number = 1; number <= CATALOG_FETCH_LIMITS.attemptsPerPage; number += 1) {
    const remaining = deadline - runtime.now();
    if (remaining <= 0) throw unavailable(page, "presupuesto agotado");
    try {
      const data = await attempt(url, fetchImplementation, Math.min(CATALOG_FETCH_LIMITS.attemptMs, remaining), runtime);
      if (runtime.now() >= deadline) throw unavailable(page, "presupuesto agotado");
      return data;
    } catch (error) {
      if (!(error instanceof TransientFailure)) throw error;
      if (number === CATALOG_FETCH_LIMITS.attemptsPerPage) throw unavailable(page, `${number} intentos agotados (${error.message})`);
      const backoff = Math.min(CATALOG_FETCH_LIMITS.initialBackoffMs * 2 ** (number - 1), CATALOG_FETCH_LIMITS.maxBackoffMs);
      const delay = Math.max(backoff, error.retryAfterMs);
      // Never retry earlier than Retry-After, nor sleep beyond the deadline.
      if (delay >= deadline - runtime.now()) throw unavailable(page, `presupuesto insuficiente para reintento (${error.message})`);
      logger.warn(`Sitemap: página ${page}, intento ${number}/${CATALOG_FETCH_LIMITS.attemptsPerPage}, ${error.message}; reintento en ${delay} ms.`);
      await runtime.sleep(delay);
    }
  }
}
