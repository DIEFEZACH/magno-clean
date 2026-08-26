import { env } from "../config/env";
import { AppError } from "../errors/AppError";

const endpoint = `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1`;
const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

export function publicImageUrl(path: string) {
  return `${endpoint}/object/public/${encodeURIComponent(env.SUPABASE_PRODUCT_IMAGES_BUCKET)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export async function uploadProductImage(path: string, file: Express.Multer.File) {
  const body = new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength);
  const response = await fetch(`${endpoint}/object/${encodeURIComponent(env.SUPABASE_PRODUCT_IMAGES_BUCKET)}/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", headers: { ...headers, "Content-Type": file.mimetype, "x-upsert": "false", "cache-control": "public, max-age=31536000, immutable" }, body: body as unknown as BodyInit });
  if (!response.ok) throw new AppError(502, "No fue posible guardar la imagen en Storage");
  return publicImageUrl(path);
}

export async function deleteProductImage(path: string) {
  const response = await fetch(`${endpoint}/object/${encodeURIComponent(env.SUPABASE_PRODUCT_IMAGES_BUCKET)}/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "DELETE", headers });
  if (!response.ok && response.status !== 404) throw new AppError(502, "No fue posible eliminar la imagen de Storage");
}
