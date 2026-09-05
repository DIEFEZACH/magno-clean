import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "admin-fixture", name: "Fixture", email: "fixture@example.invalid", role: "ADMIN", active: true };
const auth = () => Response.json({ accessToken: "fixture.access.token", user });
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("BroadcastChannel", undefined);
  vi.stubEnv("VITE_AUTH_PROXY_ENABLED", "true");
  vi.stubEnv("VITE_API_URL", "https://api.example.invalid");
  Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("auth session in-memory coordination", () => {
  it("uses only same-origin auth endpoints, credentials, JSON CSRF header, no-store", async () => {
    const fetch = vi.fn().mockResolvedValue(auth()); vi.stubGlobal("fetch", fetch);
    const { useAuthStore } = await import("./authStore");
    expect(await useAuthStore.getState().login("fixture@example.invalid", "fixture-only")).toBe(true);
    expect(fetch.mock.calls[0][0]).toBe("/api/auth/login");
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "include", cache: "no-store", headers: { "X-Magno-Auth": "1", "Content-Type": "application/json" } });
    expect(useAuthStore.getState().user?.id).toBe(user.id);
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it("coalesces parallel refresh and initialize calls", async () => {
    const fetch = vi.fn().mockImplementation(async () => auth()); vi.stubGlobal("fetch", fetch);
    const { useAuthStore } = await import("./authStore");
    await Promise.all([useAuthStore.getState().initialize(), useAuthStore.getState().initialize(), useAuthStore.getState().refresh()]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
  it("uses cross-tab Web Lock for cookie mutation", async () => {
    const lock = vi.fn((_name, callback) => callback());
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request: lock } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(auth()));
    const { useAuthStore } = await import("./authStore");
    await useAuthStore.getState().refresh();
    expect(lock).toHaveBeenCalledWith("magno-auth-cookie", expect.any(Function));
  });
  it.each([401, 500])("refresh HTTP %s fails closed and completes initialization", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "failure" }, { status })));
    const { useAuthStore } = await import("./authStore");
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({ initialized: true, isAuthenticated: false, accessToken: null });
    expect(useAuthStore.getState().lastError === null).toBe(status === 401);
  });
  it("refresh network failure does not leave infinite initialization", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fixture transport error")));
    const { useAuthStore } = await import("./authStore");
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().initialized).toBe(true);
    expect(useAuthStore.getState().lastError).toContain("restaurar");
  });
  it("logout waits for pending rotation and prevents late refresh from restoring auth", async () => {
    let finishRefresh!: (response: Response) => void;
    const fetch = vi.fn().mockImplementation((url) => url.endsWith("/refresh") ? new Promise<Response>((resolve) => { finishRefresh = resolve; }) : Promise.resolve(Response.json({ message: "closed" })));
    vi.stubGlobal("fetch", fetch);
    const { useAuthStore } = await import("./authStore");
    const refreshing = useAuthStore.getState().refresh();
    await vi.waitFor(() => expect(finishRefresh).toBeTypeOf("function"));
    const loggingOut = useAuthStore.getState().logout();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    finishRefresh(auth());
    expect(await refreshing).toBe(false);
    await loggingOut;
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/auth/refresh", "/api/auth/logout"]);
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, accessToken: null, user: null });
    expect(await useAuthStore.getState().refresh()).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("logout broadcast clears another tab without sending any token", async () => {
    const messages: unknown[] = [];
    const channels: Array<{ onmessage: ((event: { data: unknown }) => void) | null }> = [];
    class FakeChannel {
      onmessage = null;
      constructor() { channels.push(this); }
      postMessage(data: unknown) { messages.push(data); }
    }
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(auth()));
    const { useAuthStore } = await import("./authStore");
    await useAuthStore.getState().login("fixture@example.invalid", "fixture-only");
    expect(messages).toEqual([{ type: "login" }]);
    channels[0].onmessage!({ data: { type: "logout" } });
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, accessToken: null });
    expect(await useAuthStore.getState().refresh()).toBe(false);
  });
  it("distinguishes bad credentials from infrastructure failure and single-flights login", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({}, { status: 500 })); vi.stubGlobal("fetch", fetch);
    const { useAuthStore } = await import("./authStore");
    await Promise.all([useAuthStore.getState().login("fixture@example.invalid", "fixture-only"), useAuthStore.getState().login("fixture@example.invalid", "fixture-only")]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().lastError).not.toBe("Credenciales incorrectas");
    fetch.mockResolvedValueOnce(Response.json({}, { status: 401 }));
    await useAuthStore.getState().login("fixture@example.invalid", "fixture-only");
    expect(useAuthStore.getState().lastError).toBe("Credenciales incorrectas");
  });
  it.each(["http", "network"])("keeps a visible logout-failure state after %s error until an explicit retry succeeds", async (failure) => {
    const fetch = vi.fn();
    if (failure === "http") fetch.mockResolvedValueOnce(Response.json({}, { status: 502 }));
    else fetch.mockRejectedValueOnce(new TypeError("fixture network error"));
    vi.stubGlobal("fetch", fetch);
    const { useAuthStore } = await import("./authStore");
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, accessToken: null, logoutUnconfirmed: true });
    expect(useAuthStore.getState().lastError).toContain("no pudimos confirmar");
    expect(await useAuthStore.getState().login("fixture@example.invalid", "fixture-only")).toBe(false);
    expect(await useAuthStore.getState().refresh()).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValueOnce(Response.json({ message: "closed" }));
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState()).toMatchObject({ logoutUnconfirmed: false, lastError: null, isAuthenticated: false });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/auth/logout", "/api/auth/logout"]);
  });
});
