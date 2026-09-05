// Confirmed label mismatches: these exact existing photos say 1 KG for 2/3 KG SKUs.
// Withhold only the reviewed pairs. A corrected URL can be shown without blocking the SKU.
const withheldImages: Readonly<Record<string, string>> = {
  PLCT2: "https://res.cloudinary.com/dl2s0vpwb/image/upload/v1784785510/nlobiiil9vdxjyghgkk6_vgtcoy.webp",
  PLCT3: "https://res.cloudinary.com/dl2s0vpwb/image/upload/v1784785508/ypk0sr8oowjqua51qio3_olbjdx.webp",
};

export function isWithheldProductImage(code: string | undefined, url: string | null | undefined): boolean {
  return Boolean(code && url && withheldImages[code] === url);
}
