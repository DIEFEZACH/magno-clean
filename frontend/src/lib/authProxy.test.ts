// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSetCookies, onRequest, resolveAuthDeployment, sameOriginCookie, type AuthEnvironment } from "../../functions/api/auth/[[path]]";

const origin = "https://demo.magno-clean-staging.pages.dev";
const upstream = "https://magno-clean-api-staging.onrender.com";
const fixtureCookie = `magno_refresh=${"a".repeat(64)}`;
const env: AuthEnvironment = {
  AUTH_DEPLOYMENT_ENVIRONMENT: "staging",
  AUTH_UPSTREAM_URL: upstream,
  AUTH_ALLOWED_FRONTEND_ORIGINS: JSON.stringify(["https://magno-clean-staging.pages.dev", origin]),
};
const productionOrigins = ["https://www.magnoclean.com.mx", "https://magno-clean.pages.dev"];
const productionEnv: AuthEnvironment = {
  AUTH_DEPLOYMENT_ENVIRONMENT: "production",
  AUTH_UPSTREAM_URL: "https://magno-clean-api.onrender.com",
  AUTH_ALLOWED_FRONTEND_ORIGINS: JSON.stringify(productionOrigins),
};
const invalidCsrfHeaders: Record<string, string>[] = [{ Origin: "https://evil.invalid" }, { Origin: "null" }, { Origin: "" }, { "X-Magno-Auth": "" }];
function request(path = "/api/auth/refresh", options: RequestInit = {}, frontendOrigin = origin) {
  const headers = new Headers({ Origin: frontendOrigin, "Content-Type": "application/json", "X-Magno-Auth": "1", Cookie: fixtureCookie });
  new Headers(options.headers).forEach((value, key) => headers.set(key, value));
  const method = options.method || "POST";
  return new Request(`${frontendOrigin}${path}`, { ...options, method, headers, ...(method === "POST" ? { body: options.body ?? "{}" } : {}) });
}
afterEach(() => vi.unstubAllGlobals());

describe("strict same-origin auth proxy", () => {
  it.each(["/api/auth", "/api/auth/unknown", "/api/auth/%2e%2e%2flogin", "/api/auth/login/extra", "/api/auth/refresh?upstream=https://invalid.test"]) ("rejects unknown or unsafe auth route %s as JSON without upstream", async (path) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request(path), env });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["GET", "PUT", "DELETE", "OPTIONS"])("rejects unexpected %s", async (method) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request("/api/auth/login", { method }), env });
    expect(response.status).toBe(405); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([undefined, "https://api.invalid", `${upstream}/`, "http://magno-clean-api-staging.onrender.com", "https://magno-clean-api.onrender.com"])("fails closed on invalid upstream binding %s", async (value) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request(), env: { ...env, AUTH_UPSTREAM_URL: value } });
    expect(response.status).toBe(503); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(invalidCsrfHeaders)("rejects missing/foreign origin and missing non-simple CSRF header", async (headers) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request(undefined, { headers }), env });
    expect(response.status).toBe(403); expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects non-JSON, invalid JSON and oversized content", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    for (const [options, status] of [
      [{ headers: { "Content-Type": "text/plain" } }, 415],
      [{ body: "{invalid" }, 400],
      [{ body: "a".repeat(16385) }, 413],
    ] as const) {
      const response = await onRequest({ request: request(undefined, options), env });
      expect(response.status).toBe(status);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("forwards only fixed route, minimal headers and exact public origin", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ message: "ok" })); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request(undefined, { headers: {
      Cookie: `other=private; ${fixtureCookie}`, "X-Forwarded-Host": "evil.invalid", "X-Upstream": "https://evil.invalid", Authorization: "Bearer should-not-forward",
    } }), env });
    expect(response.status).toBe(200);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe(`${upstream}/api/auth/refresh`);
    expect(options.redirect).toBe("manual");
    expect(options.headers.get("origin")).toBe(origin);
    expect(options.headers.get("cookie")).toBe(fixtureCookie);
    expect(options.headers.has("authorization")).toBe(false);
    expect(options.headers.has("x-forwarded-host")).toBe(false);
    expect(options.headers.has("x-upstream")).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });
  it("preserves all independent refresh Set-Cookie headers with secure host-only scope and lifetime", async () => {
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append("Set-Cookie", "magno_refresh=first; Expires=Wed, 09 Sep 2026 10:00:00 GMT; Domain=onrender.com; Path=/; SameSite=None");
    headers.append("Set-Cookie", "magno_refresh=second; Max-Age=100; Path=/api/auth; HttpOnly");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { headers })));
    const response = await onRequest({ request: request(), env });
    const cookies = getSetCookies(response.headers);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain("Expires=Wed, 09 Sep 2026 10:00:00 GMT");
    expect(cookies[1]).toContain("Max-Age=100");
    for (const cookie of cookies) {
      expect(cookie).toContain("Path=/api/auth; HttpOnly; Secure; SameSite=Strict");
      expect(cookie).not.toContain("Domain=");
      expect(cookie).not.toContain("SameSite=None");
    }
  });
  it("preserves deletion attributes and ignores unrelated cookies", () => {
    expect(sameOriginCookie("unrelated=fixture")).toBeNull();
    expect(sameOriginCookie("magno_refresh=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/"))
      .toBe("magno_refresh=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/api/auth; HttpOnly; Secure; SameSite=Strict");
  });
  it("GET me forwards bearer to existing authority", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ user: { id: "fixture" } })); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request("/api/auth/me", { method: "GET", headers: { Authorization: "Bearer fixture.jwt.value" } }), env });
    expect(response.status).toBe(200);
    expect(fetch.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer fixture.jwt.value");
  });
  it.each([301, 302, 307, 308])("does not follow upstream redirect %s", async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status, headers: { Location: "https://evil.invalid" } })); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request(), env });
    expect(response.status).toBe(502); expect(fetch).toHaveBeenCalledTimes(1);
    expect(response.headers.has("Location")).toBe(false);
  });
  it("retains 401 versus infrastructure errors, sanitizes transport errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "Sesión inválida" }, { status: 401 })));
    expect((await onRequest({ request: request(), env })).status).toBe(401);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("internal connection details")));
    const response = await onRequest({ request: request(), env });
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("internal connection details");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
  it("preserves a text/plain upstream 429 as sanitized JSON with Retry-After and no-store", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream internal limiter text", {
      status: 429, headers: { "Content-Type": "text/plain", "Retry-After": "123" },
    })));
    const response = await onRequest({ request: request(), env });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("123");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toContain("application/json");
    const body = await response.json();
    expect(body.message).toContain("Demasiados intentos");
    expect(JSON.stringify(body)).not.toContain("internal limiter text");
    expect(body.requestId).toBeTruthy();
  });
  it.each(["", "magno_refresh=", "magno_refresh=short", `magno_refresh=${"!".repeat(64)}`])("rejects absent/malformed refresh locally without consuming upstream limiter", async (cookie) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request(undefined, { headers: { Cookie: cookie } }), env });
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("trusted deployment binding and exact cross-environment isolation", () => {
  it.each([
    undefined, "", "preview", "Production", "development", "PRODUCTION",
  ])("requires an explicit supported runtime deployment environment: %s", async (environment) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request(), env: { ...env, AUTH_DEPLOYMENT_ENVIRONMENT: environment } });
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never infers destination from NODE_ENV, VITE flags or a Pages environment label", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ message: "fixture" })); vi.stubGlobal("fetch", fetch);
    const misleading = { ...env, NODE_ENV: "production", VITE_DEMO_PREVIEW: "false", CF_PAGES_ENVIRONMENT: "Production" };
    const response = await onRequest({ request: request(), env: misleading });
    expect(response.status).toBe(200);
    expect(fetch.mock.calls[0][0]).toBe(`${upstream}/api/auth/refresh`);
    fetch.mockClear();
    expect((await onRequest({ request: request(), env: { ...misleading, AUTH_DEPLOYMENT_ENVIRONMENT: undefined } })).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["staging", "https://magno-clean-api.onrender.com"],
    ["production", "https://magno-clean-api-staging.onrender.com"],
  ])("rejects the cross-environment pairing %s / %s before forwarding credentials", async (environment, url) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const config = environment === "production" ? productionEnv : env;
    const frontendOrigin = environment === "production" ? productionOrigins[0] : origin;
    const response = await onRequest({ request: request("/api/auth/login", { body: JSON.stringify({ email: "fixture@example.invalid", password: "fixture-only" }) }, frontendOrigin), env: { ...config, AUTH_UPSTREAM_URL: url } });
    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    `${upstream}:443`, `${upstream}:444`, `${upstream}/`, `${upstream}/api/auth`, `${upstream}?`, `${upstream}?target=x`, `${upstream}#`, `${upstream}#fragment`,
    "https://user:password@magno-clean-api-staging.onrender.com", "https://@magno-clean-api-staging.onrender.com", "https://MAGNO-CLEAN-API-STAGING.onrender.com",
    "https://magno-clean-api-staging.onrender.com.evil.invalid", "https://magno-clean-api-staging.onrender.com@evil.invalid", "http://magno-clean-api-staging.onrender.com", "https://127.0.0.1", ` ${upstream}`, `${upstream}\n`,
  ])("rejects a noncanonical or unsafe upstream origin %s", async (url) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request(), env: { ...env, AUTH_UPSTREAM_URL: url } });
    expect(response.status).toBe(503); expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    undefined, "", "not-json", "null", "{}", "[]", JSON.stringify(origin),
    JSON.stringify([origin, origin]), JSON.stringify([origin, 1]), JSON.stringify(Array.from({ length: 65 }, (_, index) => `https://preview-${index}.magno-clean-staging.pages.dev`)),
  ])("rejects invalid or ambiguous exact-origin lists", async (origins) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request(), env: { ...env, AUTH_ALLOWED_FRONTEND_ORIGINS: origins } });
    expect(response.status).toBe(503); expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    "*", "https://*.pages.dev", "https://*.magno-clean-staging.pages.dev", "https://other-project.pages.dev", "https://demo.magno-clean.pages.dev",
    "https://nested.demo.magno-clean-staging.pages.dev", "https://-demo.magno-clean-staging.pages.dev", "https://demo-.magno-clean-staging.pages.dev", "https://demo.magno-clean-staging.pages.dev.evil.invalid",
    "https://www.magnoclean.com.mx", "https://magno-clean.pages.dev", "http://demo.magno-clean-staging.pages.dev", `${origin}:443`, `${origin}:8443`, `${origin}/`, `${origin}/path`, `${origin}?x=1`, `${origin}#x`,
    "https://user:password@demo.magno-clean-staging.pages.dev", "https://DEMO.magno-clean-staging.pages.dev", "https://127.0.0.1", "https://localhost",
  ])("rejects foreign, wildcard or noncanonical configured staging frontend %s", async (value) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request(), env: { ...env, AUTH_ALLOWED_FRONTEND_ORIGINS: JSON.stringify([value]) } });
    expect(response.status).toBe(503); expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    "https://unlisted.magno-clean-staging.pages.dev", "https://other-project.pages.dev", "https://www.magnoclean.com.mx", "https://magno-clean.pages.dev", `${origin}:8443`,
  ])("rejects incoming frontend %s unless explicitly allowed in the correct runtime environment", async (frontendOrigin) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request("/api/auth/login", {}, frontendOrigin), env });
    expect(response.status).toBe(403); expect(fetch).not.toHaveBeenCalled();
  });

  it("requires the request origin itself to be listed, not a spoofed Origin or forwarded-host header", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request("/api/auth/me", { method: "GET", headers: {
      Origin: origin, "X-Forwarded-Host": "demo.magno-clean-staging.pages.dev", Authorization: "Bearer fixture.jwt.value",
    } }, "https://unlisted.magno-clean-staging.pages.dev"), env });
    expect(response.status).toBe(403); expect(fetch).not.toHaveBeenCalled();
  });

  it("allows the explicitly configured stable staging origin without changing upstream", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ message: "fixture" })); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request("/api/auth/login", {}, "https://magno-clean-staging.pages.dev"), env });
    expect(response.status).toBe(200);
    expect(fetch.mock.calls[0][0]).toBe(`${upstream}/api/auth/login`);
  });

  // Every production case is a unit test with fetch replaced. No production
  // network connection, account, credential or deployment is used by this suite.
  it.each(productionOrigins.flatMap((frontendOrigin) => [
    [frontendOrigin, "/api/auth/login", "POST"], [frontendOrigin, "/api/auth/refresh", "POST"],
    [frontendOrigin, "/api/auth/logout", "POST"], [frontendOrigin, "/api/auth/me", "GET"],
  ]))("mock-only production transport allows exact frontend %s and %s", async (frontendOrigin, pathname, method) => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ message: "fixture" })); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request(pathname, { method, headers: { Authorization: "Bearer fixture.jwt.value" } }, frontendOrigin), env: productionEnv });
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(`https://magno-clean-api.onrender.com${pathname}`);
    expect(fetch.mock.calls[0][1].redirect).toBe("manual");
    expect(fetch.mock.calls[0][1].headers.get("Origin")).toBe(frontendOrigin);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each([origin, "https://magno-clean-staging.pages.dev", "https://preview.magno-clean.pages.dev", "https://magnoclean.com.mx", "https://evil.invalid"])("mock-only production config rejects foreign frontend %s", async (frontendOrigin) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request("/api/auth/login", {}, productionOrigins[0]), env: {
      ...productionEnv, AUTH_ALLOWED_FRONTEND_ORIGINS: JSON.stringify([...productionOrigins, frontendOrigin]),
    } });
    expect(response.status).toBe(503); expect(fetch).not.toHaveBeenCalled();
  });

  it("does not grant implicit production origins omitted from the configured list", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const config = { ...productionEnv, AUTH_ALLOWED_FRONTEND_ORIGINS: JSON.stringify([productionOrigins[0]]) };
    const response = await onRequest({ request: request("/api/auth/me", { method: "GET" }, productionOrigins[1]), env: config });
    expect(response.status).toBe(403); expect(fetch).not.toHaveBeenCalled();
    expect([...resolveAuthDeployment(config)!.origins]).toEqual([productionOrigins[0]]);
  });

  it("rejects an explicitly foreign Origin even for bearer-only me", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await onRequest({ request: request("/api/auth/me", { method: "GET", headers: { Origin: "https://evil.invalid", Authorization: "Bearer fixture.jwt.value" } }), env });
    expect(response.status).toBe(403); expect(fetch).not.toHaveBeenCalled();
  });
});
