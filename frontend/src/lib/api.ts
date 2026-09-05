import { useAuthStore } from "../store/authStore";
export { API_URL } from "./config";
import { API_URL, AUTH_URL } from "./config";

export async function apiFetch(path: string, init: RequestInit = {}, retry = true) {
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${path === "/api/auth/me" ? AUTH_URL : API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && retry) {
    const refreshed = await useAuthStore.getState().refresh();
    if (refreshed) return apiFetch(path, init, false);
  }

  return response;
}
