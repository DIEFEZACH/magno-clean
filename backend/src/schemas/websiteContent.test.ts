import assert from "node:assert/strict";
import test from "node:test";
import { createWebsiteContentMediaSchema, updateWebsiteContentDraftSchema } from "./websiteContent";

const validDraft = {
  title: "Contenido editorial",
  shortDescription: "Descripción aprobable",
};

test("acepta un DRAFT sin technicalSheetUrl", () => {
  assert.equal(updateWebsiteContentDraftSchema.safeParse({ ...validDraft, sdsUrl: null }).success, true);
});

test("acepta un DRAFT sin sdsUrl", () => {
  assert.equal(updateWebsiteContentDraftSchema.safeParse({ ...validDraft, technicalSheetUrl: null }).success, true);
});

test("acepta URLs documentales válidas", () => {
  assert.equal(updateWebsiteContentDraftSchema.safeParse({
    ...validDraft,
    technicalSheetUrl: "https://example.com/ficha.pdf",
    sdsUrl: "https://example.com/seguridad.pdf",
  }).success, true);
});

test("rechaza una URL documental inválida no vacía", () => {
  const result = updateWebsiteContentDraftSchema.safeParse({
    ...validDraft,
    technicalSheetUrl: "ficha-invalida",
  });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.error.flatten().fieldErrors.technicalSheetUrl?.length);
});

const validMedia = {
  role: "HERO",
  bucket: "product-media",
  storagePath: "citrical/hero/hero-01.webp",
  alt: "CITRICAL pre-lavador profesional",
  position: 0,
  sha256: "a".repeat(64),
};

test("acepta asociación editorial estricta a product-media", () => {
  assert.equal(createWebsiteContentMediaSchema.safeParse(validMedia).success, true);
});

test("rechaza bucket, traversal, MIME o SHA-256 inválidos", () => {
  assert.equal(createWebsiteContentMediaSchema.safeParse({ ...validMedia, bucket: "product-images" }).success, false);
  assert.equal(createWebsiteContentMediaSchema.safeParse({ ...validMedia, storagePath: "../hero.webp" }).success, false);
  assert.equal(createWebsiteContentMediaSchema.safeParse({ ...validMedia, mimeType: "image/png" }).success, false);
  assert.equal(createWebsiteContentMediaSchema.safeParse({ ...validMedia, sha256: "abc" }).success, false);
});
