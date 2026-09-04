import { createHash } from "node:crypto";
import type { CatalogProduct } from "./types";

// The operator approved this existing public URL, not all files on this host.
// Fingerprint of the URL string (not of image bytes); no canonical asset URL in code.
export const SCN20_PUBLIC_URL_SHA256 = "cf7effa700bb12bdf9ff45ad9358f2c5a96f0aff048e6f286b2644462a51b85d";
export const PUBLIC_PRODUCTION_ASSET_HOST = "fxbgxjpgfkeuapbmgpmv.supabase.co";
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

function unsignedHttpsUrl(value: string): URL | null {
  try {
    if (value !== value.trim() || value.length > 2048 || /[\s\\?#\u0000-\u001f\u007f]/.test(value)) return null;
    const url = new URL(value);
    // href equality also rejects empty userinfo and explicit default-port disguises.
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || url.href !== value) return null;
    return url;
  } catch {
    return null;
  }
}

export function isAuthorizedSCN20Image(code: string, value: string): boolean {
  if (code !== "SCN20") return false;
  const url = unsignedHttpsUrl(value);
  if (!url || url.hostname !== PUBLIC_PRODUCTION_ASSET_HOST || !url.pathname.startsWith("/storage/v1/object/public/")) return false;
  try {
    const segments = url.pathname.slice("/storage/v1/object/public/".length).split("/").map(segment => decodeURIComponent(segment));
    if (segments.length < 2 || segments.some(segment => !segment || segment === "." || segment === ".." || /[\s\\/?#%\u0000-\u001f\u007f]/.test(segment))) return false;
    if (/(token|secret|service.?role|credential|password|bearer|signature|eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.|APP_USR-|sb_secret_|sk-proj-)/i.test(segments.join("/"))) return false;
    return createHash("sha256").update(value, "utf8").digest("hex") === SCN20_PUBLIC_URL_SHA256;
  } catch {
    return false;
  }
}

export function isPublicCloudinaryImage(value: string): boolean {
  const url = unsignedHttpsUrl(value);
  return Boolean(url && url.hostname === "res.cloudinary.com"
    && /^\/[^/]+\/image\/upload\/.+/.test(url.pathname)
    && !/\/s--[^/]+--\//.test(url.pathname));
}

export function imageReferenceCounts(products: Pick<CatalogProduct, "code" | "imageUrl">[]) {
  const counts = { Cloudinary: 0, SupabasePublicProduction: 0, null: 0 };
  for (const product of products) {
    if (product.imageUrl === null) counts.null++;
    else if (isAuthorizedSCN20Image(product.code, product.imageUrl)) counts.SupabasePublicProduction++;
    else if (isPublicCloudinaryImage(product.imageUrl)) counts.Cloudinary++;
    else throw new Error("UNAUTHORIZED_IMAGE_REFERENCE");
  }
  if (counts.SupabasePublicProduction > 1) throw new Error("UNAUTHORIZED_IMAGE_REFERENCE");
  return counts;
}

type HeadRequest = (url: string, init: RequestInit) => Promise<Pick<Response, "status" | "headers">>;

export async function verifyPublicProductionAssetReferences(
  products: Pick<CatalogProduct, "code" | "imageUrl">[],
  request: HeadRequest = fetch,
) {
  // Validate the entire set before even contacting an asset, never just the first URL.
  const imageUrlCounts = imageReferenceCounts(products);
  const image = products.find(product => product.imageUrl !== null && isAuthorizedSCN20Image(product.code, product.imageUrl));
  if (!image?.imageUrl) return { imageUrlCounts, PUBLIC_PRODUCTION_ASSET_REFERENCE: { count: 0 } };
  let response: Pick<Response, "status" | "headers">;
  try {
    response = await request(image.imageUrl, {
      method: "HEAD", redirect: "manual", credentials: "omit", signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("PUBLIC_ASSET_CHECK_FAILED");
  }
  if (response.status !== 200) throw new Error("PUBLIC_ASSET_HTTP_NOT_200");
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_MIME_TYPES.has(contentType)) throw new Error("PUBLIC_ASSET_UNSUPPORTED_CONTENT_TYPE");
  return {
    imageUrlCounts,
    PUBLIC_PRODUCTION_ASSET_REFERENCE: {
      count: 1,
      code: "SCN20",
      reason: "imagen pública preexistente en Supabase Storage producción",
      risk: "dependencia visual temporal entre staging y un objeto público de producción",
      followUp: "migrar o reemplazar posteriormente con un asset propio de staging",
      validation: {
        method: "HEAD", httpStatus: 200, contentType,
        checkedAt: new Date().toISOString(), urlSha256: SCN20_PUBLIC_URL_SHA256,
      },
    },
  };
}
