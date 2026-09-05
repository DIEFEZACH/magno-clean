import { create } from "zustand";
import { AUTH_URL } from "../lib/config";

type User = { id: string; name: string; email: string; role: "ADMIN" | "CUSTOMER"; active: boolean };
type AuthResponse = { accessToken: string; user: User; message?: string };

type AuthStore = {
  initialized: boolean;
  isAuthenticated: boolean;
  accessToken: string | null;
  user: User | null;
  lastError: string | null;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  refresh: () => Promise<boolean>;
  logout: () => Promise<void>;
};

const signedOut = { initialized: true, isAuthenticated: false, accessToken: null, user: null };
let sessionEpoch = 0;
let loggedOut = false;
let refreshPending: Promise<boolean> | null = null;
let initializePending: Promise<void> | null = null;
let loginPending: Promise<boolean> | null = null;
let logoutPending: Promise<void> | null = null;
let fallbackLock: Promise<void> = Promise.resolve();
const sessionChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("magno-auth-session") : null;

// Serialize cookie rotation/logout across same-origin tabs. No tokens cross this
// channel or leave memory. Browsers without Web Locks retain per-tab single flight.
function withSessionLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request("magno-auth-cookie", operation);
  const result = fallbackLock.then(operation);
  fallbackLock = result.then(() => undefined, () => undefined);
  return result;
}

function authRequest(route: "login" | "refresh" | "logout", body: object = {}) {
  return fetch(`${AUTH_URL}/api/auth/${route}`, {
    method: "POST", credentials: "include", cache: "no-store",
    headers: { "Content-Type": "application/json", "X-Magno-Auth": "1" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  initialized: false,
  isAuthenticated: false,
  accessToken: null,
  user: null,
  lastError: null,

  initialize: () => {
    if (get().initialized) return Promise.resolve();
    if (initializePending) return initializePending;
    initializePending = get().refresh().then(() => undefined).finally(() => {
      set({ initialized: true });
      initializePending = null;
    });
    return initializePending;
  },

  login: (email, password) => {
    if (loginPending) return loginPending;
    const epoch = ++sessionEpoch;
    loggedOut = false;
    set({ lastError: null });
    loginPending = withSessionLock(async () => {
      if (epoch !== sessionEpoch || loggedOut) return false;
      try {
        const response = await authRequest("login", { email, password });
        if (epoch !== sessionEpoch || loggedOut) return false;
        if (!response.ok) {
          set({ ...signedOut, lastError: response.status === 401 ? "Credenciales incorrectas" : response.status === 429 ? "Demasiados intentos. Espera un momento antes de intentar de nuevo." : "No fue posible iniciar sesión. Intenta nuevamente." });
          return false;
        }
        const data = await response.json() as AuthResponse;
        if (epoch !== sessionEpoch || loggedOut) return false;
        set({ initialized: true, isAuthenticated: true, accessToken: data.accessToken, user: data.user, lastError: null });
        sessionChannel?.postMessage({ type: "login" });
        return true;
      } catch {
        if (epoch === sessionEpoch) set({ ...signedOut, lastError: "No fue posible conectar con autenticación. Intenta nuevamente." });
        return false;
      }
    }).finally(() => { loginPending = null; });
    return loginPending;
  },

  refresh: () => {
    if (loggedOut) return Promise.resolve(false);
    if (refreshPending) return refreshPending;
    const epoch = sessionEpoch;
    refreshPending = withSessionLock(async () => {
      if (epoch !== sessionEpoch || loggedOut) return false;
      try {
        const response = await authRequest("refresh");
        if (epoch !== sessionEpoch || loggedOut) return false;
        if (!response.ok) {
          set({ ...signedOut, lastError: response.status === 401 ? null : "No fue posible restaurar la sesión. Intenta nuevamente." });
          return false;
        }
        const data = await response.json() as AuthResponse;
        if (epoch !== sessionEpoch || loggedOut) return false;
        set({ initialized: true, isAuthenticated: true, accessToken: data.accessToken, user: data.user, lastError: null });
        return true;
      } catch {
        if (epoch === sessionEpoch) set({ ...signedOut, lastError: "No fue posible restaurar la sesión. Intenta nuevamente." });
        return false;
      }
    }).finally(() => { refreshPending = null; });
    return refreshPending;
  },

  logout: () => {
    if (logoutPending) return logoutPending;
    ++sessionEpoch;
    loggedOut = true;
    set({ ...signedOut, lastError: null });
    sessionChannel?.postMessage({ type: "logout" });
    // Wait for an in-flight rotation's Set-Cookie, then revoke that latest cookie.
    // Epoch checks prevent its access token from restoring the logged-out UI.
    logoutPending = withSessionLock(async () => {
      try {
        const response = await authRequest("logout");
        if (!response.ok) set({ lastError: "Sesión cerrada en este navegador; no pudimos confirmar su revocación. Intenta nuevamente." });
      } catch {
        set({ lastError: "Sesión cerrada en este navegador; no pudimos confirmar su revocación. Intenta nuevamente." });
      }
    }).finally(() => { logoutPending = null; });
    return logoutPending;
  },
}));

if (sessionChannel) sessionChannel.onmessage = (event: MessageEvent) => {
  if (event.data?.type === "logout") {
    ++sessionEpoch;
    loggedOut = true;
    useAuthStore.setState({ ...signedOut, lastError: null });
  } else if (event.data?.type === "login") {
    loggedOut = false;
  }
};
