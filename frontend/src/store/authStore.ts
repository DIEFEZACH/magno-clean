import { create } from "zustand";
import { API_URL } from "../lib/config";

type User = { id: string; name: string; email: string; role: "ADMIN" | "CUSTOMER"; active: boolean };
type AuthResponse = { accessToken: string; user: User; message?: string };

type AuthStore = {
  initialized: boolean;
  isAuthenticated: boolean;
  accessToken: string | null;
  user: User | null;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  refresh: () => Promise<boolean>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthStore>((set, get) => ({
  initialized: false,
  isAuthenticated: false,
  accessToken: null,
  user: null,

  initialize: async () => {
    if (get().initialized) return;
    await get().refresh();
    set({ initialized: true });
  },

  login: async (email, password) => {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) return false;
    const data = await response.json() as AuthResponse;
    set({ initialized: true, isAuthenticated: true, accessToken: data.accessToken, user: data.user });
    return true;
  },

  refresh: async () => {
    const response = await fetch(`${API_URL}/api/auth/refresh`, { method: "POST", credentials: "include" });
    if (!response.ok) {
      set({ initialized: true, isAuthenticated: false, accessToken: null, user: null });
      return false;
    }
    const data = await response.json() as AuthResponse;
    set({ initialized: true, isAuthenticated: true, accessToken: data.accessToken, user: data.user });
    return true;
  },

  logout: async () => {
    await fetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" });
    set({ initialized: true, isAuthenticated: false, accessToken: null, user: null });
  },
}));
