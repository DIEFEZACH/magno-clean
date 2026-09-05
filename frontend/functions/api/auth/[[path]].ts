type AuthEnvironment = { AUTH_UPSTREAM_URL?: string };
type AuthContext = { request: Request; env: AuthEnvironment };

const ALLOWED_UPSTREAM = "https://magno-clean-api-staging.onrender.com";
const ROUTES: Record<string, string> = {
  "/api/auth/login": "POST",
  "/api/auth/refresh": "POST",
  "/api/auth/logout": "POST",
  "/api/auth/me": "GET",
};
const COOKIE_NAME = "magno_refresh";

function jsonError(status: number, message: string, requestId: string) {
  return Response.json({ message, requestId }, { status, headers: {
    "Cache-Control": "no-store", "X-Request-Id": requestId, "X-Content-Type-Options": "nosniff",
  } });
}

function refreshCookie(request: Request) {
  const cookies = (request.headers.get("Cookie") || "").split(";");
  return cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
}

// Set-Cookie is not a comma-list: Expires itself contains a comma.
export function getSetCookies(headers: Headers): string[] {
  const cookieHeaders = headers as Headers & { getSetCookie?: () => string[]; getAll?: (name: string) => string[] };
  if (cookieHeaders.getSetCookie) return cookieHeaders.getSetCookie();
  if (cookieHeaders.getAll) return cookieHeaders.getAll("Set-Cookie");
  const value = headers.get("Set-Cookie");
  return value ? value.split(/,(?=\s*[^;,=\s]+\s*=)/) : [];
}

export function sameOriginCookie(cookie: string): string | null {
  const [value, ...attributes] = cookie.split(";").map((part) => part.trim());
  if (!value.startsWith(`${COOKIE_NAME}=`)) return null;
  const lifetime = attributes.filter((attribute) => /^(?:Expires|Max-Age)=/i.test(attribute));
  // Never share a refresh cookie with another preview or expose it to JavaScript.
  return [value, ...lifetime, "Path=/api/auth", "HttpOnly", "Secure", "SameSite=Strict"].join("; ");
}

export async function onRequest({ request, env }: AuthContext): Promise<Response> {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  const method = ROUTES[url.pathname];
  if (!method || url.search || /%|\\/.test(url.pathname)) return jsonError(404, "Ruta de autenticación no disponible", requestId);
  if (request.method !== method) return jsonError(405, "Método no permitido", requestId);
  if (url.protocol !== "https:") return jsonError(400, "La autenticación requiere HTTPS", requestId);
  if (env.AUTH_UPSTREAM_URL !== ALLOWED_UPSTREAM) return jsonError(503, "Autenticación temporalmente no disponible", requestId);

  if (method === "POST") {
    // SameSite is defense in depth; it does not replace explicit origin/JSON checks.
    if (request.headers.get("Origin") !== url.origin || request.headers.get("X-Magno-Auth") !== "1") {
      return jsonError(403, "Origen de autenticación no permitido", requestId);
    }
    if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return jsonError(415, "Se requiere una solicitud JSON", requestId);
    }
  }

  const cookie = refreshCookie(request);
  if (url.pathname === "/api/auth/refresh" && (!cookie || !/^magno_refresh=[A-Za-z0-9_-]{64}$/.test(cookie))) {
    // Anonymous public-page initialization should not consume the shared upstream
    // login/refresh limiter. Valid sessions still go to Express for verification.
    return jsonError(401, "Sesión inválida o expirada", requestId);
  }

  const headers = new Headers({ "Accept": "application/json", "X-Request-Id": requestId });
  // The browser cannot override the destination, forwarded host or forwarding headers.
  headers.set("Origin", url.origin);
  if (url.pathname !== "/api/auth/login") {
    if (cookie) headers.set("Cookie", cookie);
  }
  if (url.pathname === "/api/auth/me") {
    const authorization = request.headers.get("Authorization");
    if (authorization && /^Bearer [A-Za-z0-9_.-]{1,4096}$/.test(authorization)) headers.set("Authorization", authorization);
  }

  let body: string | undefined;
  if (method === "POST") {
    if (Number(request.headers.get("Content-Length") || 0) > 16384) return jsonError(413, "Solicitud demasiado grande", requestId);
    // Bound streamed bodies as well: never buffer unbounded credentials/payloads.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) { await reader.cancel(); return jsonError(413, "Solicitud demasiado grande", requestId); }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try {
      body = new TextDecoder("utf-8", { fatal: true }).decode(bytes) || "{}";
      JSON.parse(body);
    } catch { return jsonError(400, "JSON inválido", requestId); }
    headers.set("Content-Type", "application/json");
  }

  try {
    const upstream = await fetch(`${env.AUTH_UPSTREAM_URL}${url.pathname}`, {
      method, headers, body, redirect: "manual", signal: AbortSignal.timeout(15000),
    });
    // Express's rate limiter may return text/plain. Preserve its rate-limit
    // semantics without exposing its body or turning a normal 429 into a 502.
    if (upstream.status === 429) {
      const response = jsonError(429, "Demasiados intentos. Espera antes de intentar de nuevo.", requestId);
      const retryAfter = upstream.headers.get("Retry-After");
      if (retryAfter && /^\d+$/.test(retryAfter)) response.headers.set("Retry-After", retryAfter);
      return response;
    }
    if (upstream.status >= 300 && upstream.status < 400) return jsonError(502, "Respuesta de autenticación no válida", requestId);
    if (!upstream.headers.get("Content-Type")?.includes("application/json")) return jsonError(502, "Respuesta de autenticación no válida", requestId);
    const responseHeaders = new Headers({
      "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
      "X-Request-Id": requestId, "X-Content-Type-Options": "nosniff",
    });
    const retryAfter = upstream.headers.get("Retry-After");
    if (retryAfter && /^\d+$/.test(retryAfter)) responseHeaders.set("Retry-After", retryAfter);
    for (const cookie of getSetCookies(upstream.headers)) {
      const safeCookie = sameOriginCookie(cookie);
      if (safeCookie) responseHeaders.append("Set-Cookie", safeCookie);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    return jsonError(timeout ? 504 : 502, "No fue posible conectar con autenticación. Intenta nuevamente.", requestId);
  }
}
