export const API_URL=(import.meta.env.VITE_API_URL||"http://localhost:4000").replace(/\/$/,"");
export const SITE_URL=(import.meta.env.VITE_SITE_URL||"http://localhost:5173").replace(/\/$/,"");
// Opt-in only for the isolated Pages preview; existing deployments keep their transport.
export const AUTH_PROXY_ENABLED = import.meta.env.VITE_AUTH_PROXY_ENABLED === "true";
export const AUTH_URL = AUTH_PROXY_ENABLED ? "" : API_URL;

if (import.meta.env.PROD && (!import.meta.env.VITE_API_URL || !import.meta.env.VITE_SITE_URL)) {
  throw new Error("VITE_API_URL y VITE_SITE_URL son obligatorias en builds de producción");
}
