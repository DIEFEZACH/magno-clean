import { Prisma, WebsiteContentStatus } from "@prisma/client";
import { env } from "../config/env";
import { publicStorageObjectUrl } from "./publicStorageUrl";
import { assertSafeStoragePath } from "./storageObjectPath";

export type PublicWebsiteContentMediaRole = "HERO" | "BENEFITS" | "USAGE" | "SAFETY" | "INFOGRAPHIC";

export type PublicWebsiteContentMedia = {
  role: PublicWebsiteContentMediaRole;
  url: string;
  alt: string;
  position: number;
  width: number;
  height: number;
};

export type PublicWebsiteContent = {
  media: PublicWebsiteContentMedia[];
};

export type PublicWebsiteContentTarget =
  | { type: "family"; id: string }
  | { type: "product"; id: string };

type PublicMediaRow = {
  role: string;
  bucket: string;
  storagePath: string;
  alt: string;
  position: number;
  width: number | null;
  height: number | null;
  mimeType: string;
};

const roleOrder: Record<PublicWebsiteContentMediaRole, number> = {
  HERO: 0,
  BENEFITS: 1,
  USAGE: 2,
  SAFETY: 3,
  INFOGRAPHIC: 4,
};

const publicMediaSelect = {
  role: true,
  bucket: true,
  storagePath: true,
  alt: true,
  position: true,
  width: true,
  height: true,
  mimeType: true,
} satisfies Prisma.WebsiteContentMediaSelect;

function isPublicRole(value: string): value is PublicWebsiteContentMediaRole {
  return Object.prototype.hasOwnProperty.call(roleOrder, value);
}

function isSafePublicMedia(media: PublicMediaRow) {
  if (!isPublicRole(media.role)) return false;
  if (media.bucket !== env.SUPABASE_PRODUCT_MEDIA_BUCKET) return false;
  if (media.mimeType !== "image/webp") return false;
  if (!media.alt.trim()) return false;
  if (!Number.isInteger(media.width) || Number(media.width) <= 0) return false;
  if (!Number.isInteger(media.height) || Number(media.height) <= 0) return false;
  if (!Number.isInteger(media.position) || media.position < 0) return false;
  try {
    assertSafeStoragePath(media.storagePath);
    return true;
  } catch {
    return false;
  }
}

export function serializePublicWebsiteContent(mediaRows: PublicMediaRow[]): PublicWebsiteContent {
  const media = mediaRows
    .filter(isSafePublicMedia)
    .map((item) => ({
      role: item.role as PublicWebsiteContentMediaRole,
      url: publicStorageObjectUrl(env.SUPABASE_URL, item.bucket, item.storagePath),
      alt: item.alt.trim(),
      position: item.position,
      width: item.width as number,
      height: item.height as number,
    }))
    .sort((left, right) => roleOrder[left.role] - roleOrder[right.role] || left.position - right.position);
  return { media };
}

export async function resolvePublicWebsiteContent(
  target: PublicWebsiteContentTarget,
  client: any,
): Promise<PublicWebsiteContent | null> {
  const targetFilter = target.type === "family"
    ? { familyId: target.id, productId: null }
    : { productId: target.id, familyId: null };
  const published = await client.websiteContentRevision.findFirst({
    where: {
      status: WebsiteContentStatus.PUBLISHED,
      content: { is: targetFilter },
      publishedFor: { is: targetFilter },
    },
    select: {
      media: {
        select: publicMediaSelect,
      },
    },
  });
  return published ? serializePublicWebsiteContent(published.media) : null;
}
