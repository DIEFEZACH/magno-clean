import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, symlink, truncate, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadExactStagingConfig,
  MEDIA_SYNC_BUCKET,
  MEDIA_SYNC_EXECUTION_CONFIRMATION,
  MEDIA_SYNC_PRODUCTION_PROJECT_REF,
  MEDIA_SYNC_STAGING_PROJECT_REF,
  parseMediaSyncArgs,
} from "./mediaSync/config";
import {
  inspectLocalMedia,
  LocalMediaValidationError,
  resolveContainedLocalPath,
} from "./mediaSync/localFile";
import {
  flattenMediaManifest,
  parseMediaManifest,
} from "./mediaSync/manifest";
import { synchronizeProductMedia } from "./mediaSync/runner";
import type {
  MediaManifest,
  MediaManifestFile,
  MediaManifestVariant,
  MediaSyncArguments,
} from "./mediaSync/types";

const OPTIMIZATION_ROOT = ".local/product-media-optimized";
const FAKE_STAGING_SECRET = "fake-staging-service-role-secret-for-tests";

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Minimal, structurally valid WebP using the VP8X container. */
function vp8x(width = 64, height = 48) {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8X", 12, "ascii");
  bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

function manifestFile(
  bytes: Buffer,
  overrides: Partial<MediaManifestFile> = {},
): MediaManifestFile {
  const role = overrides.role ?? "HERO";
  const optimizedPath = overrides.optimizedPath === undefined
    ? `${OPTIMIZATION_ROOT}/demo/hero/hero-01.webp`
    : overrides.optimizedPath;
  return {
    sourcePath: "originals/demo.png",
    logicalPath: "demo/hero/hero-01.webp",
    family: "DEMO",
    familyAssociationConfidence: "HIGH",
    classification: role,
    classificationConfidence: "HIGH",
    productCode: null,
    variantLabel: null,
    width: 64,
    height: 48,
    bytes: bytes.length,
    format: "WEBP",
    sha256: "1".repeat(64),
    reviewRequired: false,
    ambiguousVariantAssociation: false,
    reviewReasons: [],
    role,
    variantCode: null,
    originalWidth: 128,
    originalHeight: 96,
    originalBytes: bytes.length * 2,
    optimizedPath,
    optimizedSha256: optimizedPath === null ? null : sha256(bytes),
    mimeType: optimizedPath === null ? null : "image/webp",
    sourceSha256: "2".repeat(64),
    bucket: optimizedPath === null ? null : "product-media",
    storagePath: optimizedPath === null ? null : "demo/hero/hero-01.webp",
    ...overrides,
  };
}

function manifest(
  files: MediaManifestFile[],
  variants: MediaManifestVariant[] = [],
): MediaManifest {
  const optimized = files.filter((file) => file.optimizedPath !== null);
  return {
    schemaVersion: 2,
    generatedAt: "2026-09-03T00:00:00.000Z",
    sourceRoot: "originals",
    policy: {},
    summary: { totalImages: files.length },
    families: [{ family: "DEMO", media: {}, variants, files }],
    unassociated: [],
    exactDuplicates: [],
    optimization: {
      outputRoot: OPTIMIZATION_ROOT,
      format: "image/webp",
      processed: optimized.length,
      excludedForReview: files.filter((file) => file.reviewRequired).length,
      originalBytes: files.reduce((sum, file) => sum + file.originalBytes, 0),
      optimizedBytes: optimized.reduce((sum, file) => sum + file.bytes, 0),
      savingPercent: 50,
      originalsModified: false,
    },
  };
}

function syncArguments(sourceRoot: string, mode: "dry-run" | "execute" = "dry-run"): MediaSyncArguments {
  return {
    manifestPath: "/virtual/media-manifest.json",
    sourceRoot,
    environment: "staging",
    projectRef: MEDIA_SYNC_STAGING_PROJECT_REF,
    bucket: MEDIA_SYNC_BUCKET,
    mode,
    confirmation: mode === "execute" ? MEDIA_SYNC_EXECUTION_CONFIRMATION : undefined,
    envFilePath: "/virtual/.env.staging",
    reportDirectory: "/virtual/reports",
    concurrency: 3,
  };
}

async function createLocalFixture(t: { after(callback: () => unknown): void }, bytes = vp8x()) {
  const root = await mkdtemp(path.join(os.tmpdir(), "media-sync-local-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = path.join(root, "demo", "hero", "hero-01.webp");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  const parsedManifest = parseMediaManifest(manifest([manifestFile(bytes)]));
  return {
    root,
    target,
    bytes,
    manifest: parsedManifest,
    entries: flattenMediaManifest(parsedManifest),
  };
}

function validArgv(mode: "--dry-run" | "--execute" = "--dry-run") {
  const argv = [
    "--manifest", "../docs/product-data/media-manifest.json",
    "--source-root", "../.local/product-media-optimized",
    "--environment", "staging",
    "--project-ref", MEDIA_SYNC_STAGING_PROJECT_REF,
    "--bucket", MEDIA_SYNC_BUCKET,
    mode,
  ];
  if (mode === "--execute") argv.push("--confirm", MEDIA_SYNC_EXECUTION_CONFIRMATION);
  return argv;
}

test("parser acepta un dry-run explícito y resuelve rutas sin codificarlas", () => {
  const cwd = path.join(os.tmpdir(), "media-sync-cli");
  const result = parseMediaSyncArgs(validArgv(), cwd);

  assert.equal(result.mode, "dry-run");
  assert.equal(result.environment, "staging");
  assert.equal(result.projectRef, MEDIA_SYNC_STAGING_PROJECT_REF);
  assert.equal(result.bucket, MEDIA_SYNC_BUCKET);
  assert.equal(result.manifestPath, path.resolve(cwd, "../docs/product-data/media-manifest.json"));
  assert.equal(result.sourceRoot, path.resolve(cwd, "../.local/product-media-optimized"));
  assert.equal(result.envFilePath, path.resolve(cwd, ".env.staging"));
});

test("parser bloquea producción, entornos no staging y destinos no autorizados", () => {
  const replaceFlag = (argv: string[], flag: string, value: string) => {
    const copy = [...argv];
    copy[copy.indexOf(flag) + 1] = value;
    return copy;
  };

  assert.throws(
    () => parseMediaSyncArgs(replaceFlag(validArgv(), "--project-ref", MEDIA_SYNC_PRODUCTION_PROJECT_REF)),
    /producción rechazado/,
  );
  assert.throws(
    () => parseMediaSyncArgs(replaceFlag(validArgv(), "--environment", "production")),
    /sólo permite --environment staging/,
  );
  assert.throws(
    () => parseMediaSyncArgs(replaceFlag(validArgv(), "--project-ref", "otro-proyecto")),
    /no autorizado/,
  );
  assert.throws(
    () => parseMediaSyncArgs(replaceFlag(validArgv(), "--bucket", "product-images")),
    /Bucket no autorizado/,
  );
});

test("execute exige confirmación exacta y los modos son mutuamente excluyentes", () => {
  const withoutConfirmation = validArgv("--execute").slice(0, -2);
  assert.throws(() => parseMediaSyncArgs(withoutConfirmation), /requiere --confirm/);

  const wrongConfirmation = validArgv("--execute");
  wrongConfirmation[wrongConfirmation.length - 1] = "CONFIRMACION_INCORRECTA";
  assert.throws(() => parseMediaSyncArgs(wrongConfirmation), /requiere --confirm/);

  assert.throws(
    () => parseMediaSyncArgs([...validArgv(), "--execute"]),
    /exactamente uno/,
  );
  assert.throws(
    () => parseMediaSyncArgs(validArgv().slice(0, -1)),
    /exactamente uno/,
  );
  assert.equal(parseMediaSyncArgs(validArgv("--execute")).mode, "execute");
});

test("carga exclusivamente .env.staging y nunca completa datos desde .env", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "media-sync-env-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stagingPath = path.join(root, ".env.staging");
  await writeFile(
    path.join(root, ".env"),
    [
      `SUPABASE_URL=https://${MEDIA_SYNC_PRODUCTION_PROJECT_REF}.supabase.co`,
      "SUPABASE_SERVICE_ROLE_KEY=production-fallback-must-not-be-read",
    ].join("\n"),
  );
  await writeFile(
    stagingPath,
    [
      `SUPABASE_URL=https://${MEDIA_SYNC_STAGING_PROJECT_REF}.supabase.co`,
      `SUPABASE_SERVICE_ROLE_KEY=${FAKE_STAGING_SECRET}`,
      "SUPABASE_PRODUCT_MEDIA_BUCKET=product-media",
    ].join("\n"),
  );

  const config = loadExactStagingConfig(stagingPath);
  assert.equal(config.supabaseUrl, `https://${MEDIA_SYNC_STAGING_PROJECT_REF}.supabase.co`);
  assert.equal(config.projectRef, MEDIA_SYNC_STAGING_PROJECT_REF);
  assert.equal(config.serviceRoleKey, FAKE_STAGING_SECRET);

  await writeFile(stagingPath, `SUPABASE_URL=https://${MEDIA_SYNC_STAGING_PROJECT_REF}.supabase.co\n`);
  assert.throws(
    () => loadExactStagingConfig(stagingPath),
    /no contiene la configuración requerida/,
  );
});

test("config rechaza producción, hosts parecidos y nombres de env distintos sin filtrar secretos", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "media-sync-env-gates-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const writeCandidate = async (name: string, url: string) => {
    const target = path.join(root, name);
    await writeFile(target, `SUPABASE_URL=${url}\nSUPABASE_SERVICE_ROLE_KEY=${FAKE_STAGING_SECRET}\n`);
    return target;
  };

  const production = await writeCandidate(
    ".env.staging",
    `https://${MEDIA_SYNC_PRODUCTION_PROJECT_REF}.supabase.co`,
  );
  assert.throws(() => loadExactStagingConfig(production), /producción rechazado/);

  await writeFile(
    production,
    `SUPABASE_URL=https://${MEDIA_SYNC_STAGING_PROJECT_REF}.supabase.co.example.test\nSUPABASE_SERVICE_ROLE_KEY=${FAKE_STAGING_SECRET}\n`,
  );
  assert.throws(
    () => loadExactStagingConfig(production),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /no coincide exactamente/);
      assert.doesNotMatch(error.message, new RegExp(FAKE_STAGING_SECRET));
      return true;
    },
  );

  const wrongName = await writeCandidate(
    ".env",
    `https://${MEDIA_SYNC_STAGING_PROJECT_REF}.supabase.co`,
  );
  assert.throws(() => loadExactStagingConfig(wrongName), /exactamente \.env\.staging/);
});

test("acepta un manifest canónico válido y lo aplana de forma determinista", () => {
  const bytes = vp8x();
  const parsed = parseMediaManifest(manifest([
    manifestFile(bytes),
    manifestFile(bytes, {
      sourcePath: "originals/demo-02.png",
      logicalPath: "demo/benefits/benefits-01.webp",
      classification: "BENEFITS",
      role: "BENEFITS",
      optimizedPath: `${OPTIMIZATION_ROOT}/demo/benefits/benefits-01.webp`,
      storagePath: "demo/benefits/benefits-01.webp",
    }),
  ]));
  const entries = flattenMediaManifest(parsed);

  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((entry) => entry.index), [0, 1]);
  assert.deepEqual(entries.map((entry) => entry.role), ["HERO", "BENEFITS"]);
});

test("rechaza manifests inválidos, incompletos o internamente inconsistentes", () => {
  const valid = manifest([manifestFile(vp8x())]);
  assert.throws(
    () => parseMediaManifest({ ...valid, schemaVersion: 1 }),
    /Manifest inválido/,
  );
  assert.throws(
    () => parseMediaManifest({ ...valid, unexpected: true }),
    /Manifest inválido/,
  );
  assert.throws(
    () => parseMediaManifest({
      ...valid,
      optimization: { ...valid.optimization, processed: 99 },
    }),
    /no coincide/,
  );
  assert.throws(
    () => parseMediaManifest({
      ...valid,
      families: [{ ...valid.families[0], files: [{ ...valid.families[0].files[0], family: "OTRA" }] }],
    }),
    /no coincide con su contenedor/,
  );
});

test("valida un WebP local real contra hash, MIME, tamaño y dimensiones", async (t) => {
  const fixture = await createLocalFixture(t);
  const result = inspectLocalMedia(fixture.entries[0], fixture.root, OPTIMIZATION_ROOT);

  assert.equal(result.path, await realpath(fixture.target));
  assert.equal(result.sha256, sha256(fixture.bytes));
  assert.equal(result.mimeType, "image/webp");
  assert.deepEqual({ width: result.width, height: result.height }, { width: 64, height: 48 });
  assert.deepEqual(result.bytes, fixture.bytes);
});

test("clasifica archivo inexistente, MIME falso, hash y dimensiones diferentes", async (t) => {
  const fixture = await createLocalFixture(t);
  const base = fixture.entries[0];

  assert.throws(
    () => inspectLocalMedia({ ...base, optimizedPath: `${OPTIMIZATION_ROOT}/missing.webp` }, fixture.root, OPTIMIZATION_ROOT),
    (error: unknown) => error instanceof LocalMediaValidationError && error.kind === "INVALID_LOCAL_FILE",
  );
  assert.throws(
    () => inspectLocalMedia({ ...base, mimeType: "image/png" }, fixture.root, OPTIMIZATION_ROOT),
    (error: unknown) => error instanceof LocalMediaValidationError && error.kind === "INVALID_LOCAL_FILE",
  );
  assert.throws(
    () => inspectLocalMedia({ ...base, optimizedSha256: "0".repeat(64) }, fixture.root, OPTIMIZATION_ROOT),
    (error: unknown) => error instanceof LocalMediaValidationError && error.kind === "HASH_MISMATCH",
  );
  assert.throws(
    () => inspectLocalMedia({ ...base, width: 65 }, fixture.root, OPTIMIZATION_ROOT),
    (error: unknown) => error instanceof LocalMediaValidationError && error.kind === "DIMENSION_MISMATCH",
  );

  const fakeRoot = await mkdtemp(path.join(os.tmpdir(), "media-sync-fake-mime-"));
  t.after(() => rm(fakeRoot, { recursive: true, force: true }));
  const fakePath = path.join(fakeRoot, "demo", "hero", "hero-01.webp");
  const fakeBytes = Buffer.from("not-a-real-webp-file-with-a-webp-extension");
  await mkdir(path.dirname(fakePath), { recursive: true });
  await writeFile(fakePath, fakeBytes);
  const fakeEntry = {
    ...base,
    bytes: fakeBytes.length,
    optimizedSha256: sha256(fakeBytes),
  };
  assert.throws(
    () => inspectLocalMedia(fakeEntry, fakeRoot, OPTIMIZATION_ROOT),
    (error: unknown) => error instanceof LocalMediaValidationError && error.kind === "INVALID_LOCAL_FILE",
  );
});

test("bloquea traversal, prefijos ajenos y symlinks antes de leer bytes", async (t) => {
  const fixture = await createLocalFixture(t);

  assert.throws(
    () => resolveContainedLocalPath(fixture.root, OPTIMIZATION_ROOT, `${OPTIMIZATION_ROOT}/../secret.webp`),
    /segmentos peligrosos/,
  );
  assert.throws(
    () => resolveContainedLocalPath(fixture.root, OPTIMIZATION_ROOT, "otra-raiz/demo/hero.webp"),
    /no pertenece al outputRoot/,
  );
  assert.throws(
    () => resolveContainedLocalPath(fixture.root, OPTIMIZATION_ROOT, `${OPTIMIZATION_ROOT}/demo\\secret.webp`),
    /ruta lógica segura/,
  );

  const outside = path.join(path.dirname(fixture.root), `outside-${path.basename(fixture.root)}.webp`);
  t.after(() => rm(outside, { force: true }));
  await writeFile(outside, fixture.bytes);
  const link = path.join(fixture.root, "demo", "hero", "linked.webp");
  await symlink(outside, link);
  assert.throws(
    () => resolveContainedLocalPath(fixture.root, OPTIMIZATION_ROOT, `${OPTIMIZATION_ROOT}/demo/hero/linked.webp`),
    /simbólicos/,
  );
});

test("rechaza archivos mayores de 10 MB antes de cargarlos en memoria", async (t) => {
  const fixture = await createLocalFixture(t);
  await truncate(fixture.target, 10 * 1024 * 1024 + 1);
  assert.throws(
    () => inspectLocalMedia({ ...fixture.entries[0], bytes: 10 * 1024 * 1024 + 1 }, fixture.root, OPTIMIZATION_ROOT),
    (error: unknown) => error instanceof LocalMediaValidationError && error.kind === "INVALID_LOCAL_FILE",
  );
});

test("omite reviewRequired, asociaciones familiares dudosas y VARIANT_IMAGE sin SKU inequívoco", async () => {
  const bytes = vp8x();
  const files = [
    manifestFile(bytes, {
      reviewRequired: true,
      optimizedPath: `${OPTIMIZATION_ROOT}/demo/review/review.webp`,
      storagePath: "demo/review/review.webp",
    }),
    manifestFile(bytes, {
      ambiguousVariantAssociation: true,
      optimizedPath: `${OPTIMIZATION_ROOT}/demo/ambiguous/ambiguous.webp`,
      storagePath: "demo/ambiguous/ambiguous.webp",
    }),
    manifestFile(bytes, {
      role: "VARIANT_IMAGE",
      classification: "VARIANT_IMAGE",
      variantLabel: "1 L",
      variantCode: null,
      optimizedPath: `${OPTIMIZATION_ROOT}/demo/variants/missing-code.webp`,
      storagePath: "demo/variants/missing-code.webp",
    }),
    manifestFile(bytes, {
      familyAssociationConfidence: "MEDIUM",
      role: "USAGE",
      classification: "USAGE",
      optimizedPath: `${OPTIMIZATION_ROOT}/demo/usage/uncertain-family.webp`,
      storagePath: "demo/usage/uncertain-family.webp",
    }),
  ];
  const parsed = parseMediaManifest(manifest(files));
  let inspections = 0;
  let uploads = 0;
  const result = await synchronizeProductMedia({
    manifest: parsed,
    entries: flattenMediaManifest(parsed),
    arguments: syncArguments("/source-not-needed"),
    storage: {
      inspect: async () => { inspections += 1; return { status: "missing" }; },
      upload: async () => { uploads += 1; return { status: "uploaded" }; },
    },
  });

  assert.deepEqual(result.entries.map((entry) => entry.status), [
    "SKIPPED_REVIEW_REQUIRED",
    "SKIPPED_AMBIGUOUS_VARIANT",
    "SKIPPED_AMBIGUOUS_VARIANT",
    "SKIPPED_REVIEW_REQUIRED",
  ]);
  assert.equal(inspections, 0);
  assert.equal(uploads, 0);
  assert.equal(result.writeOperations, 0);
});

test("marca todas las colisiones de storagePath y no toca Storage", async () => {
  const bytes = vp8x();
  const duplicatePath = "demo/hero/duplicate.webp";
  const files = [
    manifestFile(bytes, {
      optimizedPath: `${OPTIMIZATION_ROOT}/demo/hero/duplicate-a.webp`,
      storagePath: duplicatePath,
    }),
    manifestFile(bytes, {
      sourcePath: "originals/demo-b.png",
      optimizedPath: `${OPTIMIZATION_ROOT}/demo/hero/duplicate-b.webp`,
      storagePath: duplicatePath,
    }),
  ];
  const parsed = parseMediaManifest(manifest(files));
  let storageCalls = 0;
  const result = await synchronizeProductMedia({
    manifest: parsed,
    entries: flattenMediaManifest(parsed),
    arguments: syncArguments("/source-not-needed"),
    storage: {
      inspect: async () => { storageCalls += 1; return { status: "missing" }; },
      upload: async () => { storageCalls += 1; return { status: "uploaded" }; },
    },
  });

  assert.deepEqual(result.entries.map((entry) => entry.status), [
    "DUPLICATE_STORAGE_PATH",
    "DUPLICATE_STORAGE_PATH",
  ]);
  assert.equal(storageCalls, 0);
  assert.equal(result.writeOperations, 0);
});

test("dry-run con objeto ausente produce READY, cero uploads y nunca UPLOADED", async (t) => {
  const fixture = await createLocalFixture(t);
  let inspections = 0;
  let uploads = 0;
  const result = await synchronizeProductMedia({
    manifest: fixture.manifest,
    entries: fixture.entries,
    arguments: syncArguments(fixture.root),
    storage: {
      inspect: async () => { inspections += 1; return { status: "missing" }; },
      upload: async () => { uploads += 1; return { status: "uploaded" }; },
    },
  });

  assert.equal(inspections, 1);
  assert.equal(uploads, 0);
  assert.equal(result.writeOperations, 0);
  assert.deepEqual(result.entries.map((entry) => entry.status), ["READY"]);
  assert.equal(result.entries.some((entry) => entry.status === "UPLOADED"), false);
});

test("dry-run reconcilia objeto remoto idéntico como EXISTING_MATCH sin escribir", async (t) => {
  const fixture = await createLocalFixture(t);
  let uploads = 0;
  const result = await synchronizeProductMedia({
    manifest: fixture.manifest,
    entries: fixture.entries,
    arguments: syncArguments(fixture.root),
    storage: {
      inspect: async () => ({ status: "object", bytes: fixture.bytes, mimeType: "image/webp" }),
      upload: async () => { uploads += 1; return { status: "uploaded" }; },
    },
  });

  assert.equal(result.entries[0].status, "EXISTING_MATCH");
  assert.equal(result.entries[0].remoteSha256, sha256(fixture.bytes));
  assert.equal(uploads, 0);
  assert.equal(result.writeOperations, 0);
});

test("dry-run reporta REMOTE_CONFLICT ante bytes o MIME remotos diferentes", async (t) => {
  const fixture = await createLocalFixture(t);
  for (const remote of [
    { status: "object" as const, bytes: Buffer.from("different"), mimeType: "image/webp" },
    { status: "object" as const, bytes: fixture.bytes, mimeType: "image/png" },
  ]) {
    let uploads = 0;
    const result = await synchronizeProductMedia({
      manifest: fixture.manifest,
      entries: fixture.entries,
      arguments: syncArguments(fixture.root),
      storage: {
        inspect: async () => remote,
        upload: async () => { uploads += 1; return { status: "uploaded" }; },
      },
    });
    assert.equal(result.entries[0].status, "REMOTE_CONFLICT");
    assert.equal(uploads, 0);
    assert.equal(result.writeOperations, 0);
  }
});

test("errores remotos quedan sanitizados y nunca filtran secretos al resultado", async (t) => {
  const fixture = await createLocalFixture(t);
  const remoteSecret = "remote-response-secret-sentinel";
  const result = await synchronizeProductMedia({
    manifest: fixture.manifest,
    entries: fixture.entries,
    arguments: syncArguments(fixture.root),
    storage: {
      inspect: async () => { throw new Error(`Authorization: Bearer ${remoteSecret}`); },
      upload: async () => { throw new Error(`apikey=${remoteSecret}`); },
    },
  });

  const serialized = JSON.stringify(result);
  assert.equal(result.entries[0].status, "FAILED");
  assert.match(result.entries[0].reasons[0], /no pudo completarse de forma segura/);
  assert.doesNotMatch(serialized, new RegExp(remoteSecret));
  assert.doesNotMatch(serialized, /Authorization|Bearer|apikey/);
  assert.equal(result.writeOperations, 0);
});
