import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { WebsiteContentStatus } from "@prisma/client";
import { addWebsiteContentMedia, removeWebsiteContentMedia, updateWebsiteContentMedia } from "./websiteContent";
import { assertSafeStoragePath, inspectWebsiteContentMedia, readWebpDimensions } from "./websiteContentMediaStorage";

const input = {
  role: "HERO" as const,
  bucket: "product-media" as const,
  storagePath: "citrical/hero/hero-01.webp",
  alt: "CITRICAL pre-lavador profesional",
  position: 0,
  sha256: "a".repeat(64),
};

function fakeDb(status: WebsiteContentStatus = WebsiteContentStatus.DRAFT) {
  const state: any = { status, media: [] };
  const db: any = {
    websiteContentRevision: {
      findUnique: async () => ({ id: "revision-1", status: state.status }),
    },
    websiteContentMedia: {
      create: async ({ data }: any) => { const row = { id: "media-1", ...data }; state.media.push(row); return row; },
      findFirst: async ({ where }: any) => state.media.find((item: any) => item.id === where.id && item.revisionId === where.revisionId) || null,
      update: async ({ where, data }: any) => { const row = state.media.find((item: any) => item.id === where.id); Object.assign(row, data); return row; },
      deleteMany: async ({ where }: any) => { const before = state.media.length; state.media = state.media.filter((item: any) => item.id !== where.id || item.revisionId !== where.revisionId); return { count: before - state.media.length }; },
    },
  };
  return { db, state };
}

const inspected = async () => ({ width: 1254, height: 1254, byteSize: 1000, mimeType: "image/webp", sha256: input.sha256 });

test("asocia, edita y quita medios sólo en DRAFT", async () => {
  const { db, state } = fakeDb();
  const media = await addWebsiteContentMedia("revision-1", input, db, inspected);
  assert.equal(media.storagePath, input.storagePath);
  assert.equal(media.width, 1254);
  const updated = await updateWebsiteContentMedia("revision-1", media.id, { alt: "Nuevo texto alternativo", position: 1 }, db);
  assert.equal(updated.alt, "Nuevo texto alternativo");
  await removeWebsiteContentMedia("revision-1", media.id, db);
  assert.equal(state.media.length, 0);
});

test("rechaza asociar medios fuera de DRAFT antes de consultar Storage", async () => {
  const { db } = fakeDb(WebsiteContentStatus.REVIEW);
  let inspectedObject = false;
  await assert.rejects(addWebsiteContentMedia("revision-1", input, db, async () => {
    inspectedObject = true;
    return inspected();
  }), /DRAFT/);
  assert.equal(inspectedObject, false);
});

test("valida rutas sin traversal y lee dimensiones VP8X", () => {
  assert.doesNotThrow(() => assertSafeStoragePath("citrical/hero/hero-01.webp"));
  assert.throws(() => assertSafeStoragePath("citrical/../hero.webp"), /inválida/);
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(22, 4);
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8X", 12, "ascii");
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(1253, 24, 3);
  buffer.writeUIntLE(1253, 27, 3);
  assert.deepEqual(readWebpDimensions(buffer), { width: 1254, height: 1254 });
});

test("traduce un objeto ausente a error de validación controlado", async () => {
  await assert.rejects(
    inspectWebsiteContentMedia(input.bucket, input.storagePath, input.sha256, async () => new Response(null, { status: 400 })),
    /no existe en Storage/,
  );
});

test("deriva y valida Content-Type desde Storage, no desde el navegador", async () => {
  await assert.rejects(
    inspectWebsiteContentMedia(input.bucket, input.storagePath, input.sha256, async () => new Response("png", {
      status: 200,
      headers: { "content-type": "image/png" },
    })),
    /Content-Type image\/webp/,
  );
});

test("la migración devuelve OLD en DELETE y conserva bloqueo PUBLISHED", () => {
  const migration = fs.readFileSync("prisma/migrations/20260902090000_editorial_media/migration.sql", "utf8");
  assert.match(migration, /RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END/);
  assert.match(migration, /IF OLD\."status" = 'PUBLISHED' THEN/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OR DELETE ON "WebsiteContentMedia"/);
});
