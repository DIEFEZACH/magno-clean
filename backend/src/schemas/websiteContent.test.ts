import assert from "node:assert/strict";
import test from "node:test";
import { updateWebsiteContentDraftSchema } from "./websiteContent";

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
