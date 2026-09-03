import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type {
  MediaSyncReport,
  MediaSyncReportEntry,
  MediaSyncSummary,
} from "./mediaSync/types";
import {
  buildMediaSyncSummary,
  sanitizeMediaSyncReport,
  serializeMediaSyncCsv,
  writeMediaSyncReports,
} from "./mediaSync/report";

const sha = "a".repeat(64);

function entry(
  index: number,
  status: MediaSyncReportEntry["status"],
  overrides: Partial<MediaSyncReportEntry> = {},
): MediaSyncReportEntry {
  return {
    index,
    family: `FAMILIA ${index}`,
    role: "HERO",
    variantCode: index === 1 ? "SKU-1" : null,
    sourcePath: `source-${index}.png`,
    optimizedPath: `family/hero-${index}.webp`,
    storagePath: `family/hero/hero-${index}.webp`,
    status,
    reasons: [],
    originalBytes: 1_000,
    bytes: 250,
    width: 800,
    height: 800,
    expectedSha256: sha,
    localSha256: sha,
    ...overrides,
  };
}

function report(entries: MediaSyncReportEntry[]): MediaSyncReport {
  const summary = buildMediaSyncSummary(entries, {
    reviewRequiredCount: 13,
    ambiguousVariantCount: 10,
  });
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-03T22:30:45.123Z",
    environment: "staging",
    projectRef: "heqneuhptatgybddoply",
    bucket: "product-media",
    mode: "dry-run",
    manifestPath: "../docs/product-data/media-manifest.json",
    sourceRoot: "../.local/product-media-optimized",
    summary,
    entries,
  };
}

test("construye conteos y métricas deterministas desde los estados finales", () => {
  const entries = [
    entry(4, "READY", { family: "ZETA", bytes: 200, originalBytes: 1_000 }),
    entry(2, "EXISTING_MATCH", { family: "ALFA", variantCode: "SKU-Z", bytes: 300 }),
    entry(3, "SKIPPED_REVIEW_REQUIRED", { optimizedPath: null }),
    entry(1, "REMOTE_CONFLICT", { family: "ALFA", variantCode: "SKU-A", bytes: 250 }),
    entry(5, "HASH_MISMATCH"),
    entry(6, "FAILED", { bytes: 100 }),
  ];
  const summary = buildMediaSyncSummary(entries, {
    reviewRequiredCount: 13,
    ambiguousVariantCount: 10,
    writeOperations: 2,
  });

  assert.equal(summary.totalManifest, 6);
  assert.equal(summary.totalOptimized, 5);
  assert.equal(summary.eligible, 4);
  assert.equal(summary.ready, 1);
  assert.equal(summary.existingMatch, 1);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.invalid, 1);
  assert.equal(summary.remoteConflicts, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.totalEligibleBytes, 850);
  assert.equal(summary.bytesToUpload, 200);
  assert.equal(summary.eligibleOriginalBytes, 4_000);
  assert.equal(summary.savingPercent, 78.75);
  assert.deepEqual(summary.familiesCovered, ["ALFA", "FAMILIA 6", "ZETA"]);
  assert.deepEqual(summary.variantSkusCovered, ["SKU-A", "SKU-Z"]);
  assert.equal(summary.reviewRequiredCount, 13);
  assert.equal(summary.ambiguousVariantCount, 10);
  assert.equal(summary.writeOperations, 2);
  assert.equal(summary.statusCounts.READY, 1);
});

test("sanitiza razones y usa una lista explícita de campos", () => {
  const serviceKey = "sensitive-service-role-value";
  const syntheticDatabaseUrl = ["postgresql://admin", "password@example.test/postgres"].join(":");
  const unsafe = report([
    entry(1, "FAILED", {
      reasons: [
        `Bearer ${serviceKey}`,
        `DATABASE_URL=${syntheticDatabaseUrl}`,
        "token=eyJabcdefghijk.abcdefghijk.abcdefghijk",
      ],
    }),
  ]);
  (unsafe as MediaSyncReport & { serviceRoleKey?: string }).serviceRoleKey = serviceKey;
  (unsafe.entries[0] as MediaSyncReportEntry & { authorization?: string }).authorization = serviceKey;

  const sanitized = sanitizeMediaSyncReport(unsafe, [serviceKey]);
  const serialized = JSON.stringify(sanitized);
  const csv = serializeMediaSyncCsv(sanitized);
  assert.doesNotMatch(serialized, /sensitive-service-role-value/);
  assert.doesNotMatch(serialized, /postgresql:\/\//);
  assert.doesNotMatch(serialized, /eyJabcdefghijk/);
  assert.doesNotMatch(serialized, /serviceRoleKey|authorization/);
  assert.match(serialized, /REDACTED/);
  assert.doesNotMatch(csv, /sensitive-service-role-value|postgresql:\/\/|eyJabcdefghijk/);
  assert.match(csv, /REDACTED/);
});

test("conserva el contador explícito de escrituras al sanitizar", () => {
  const input = report([entry(1, "EXISTING_MATCH")]);
  input.summary.writeOperations = 1;

  const sanitized = sanitizeMediaSyncReport(input);
  assert.equal(sanitized.summary.writeOperations, 1);
  assert.equal(sanitized.summary.existingMatch, 1);
});

test("protege todas las celdas CSV contra fórmulas y escapa contenido", () => {
  const unsafe = report([
    entry(1, "READY", {
      family: "=HYPERLINK(\"https://example.test\")",
      variantCode: "+SUM(1,1)",
      sourcePath: " @IMPORTXML(example)",
      reasons: ["-2+3", "línea, con coma"],
    }),
  ]);
  const csv = serializeMediaSyncCsv(sanitizeMediaSyncReport(unsafe));

  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.test""\)"/);
  assert.match(csv, /"'\+SUM\(1,1\)"/);
  assert.match(csv, /"' @IMPORTXML\(example\)"/);
  assert.match(csv, /"'-2\+3 \| línea, con coma"/);
});

test("escribe JSON y CSV privados, completos y sin temporales visibles", async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "media-sync-report-"));
  t.after(async () => rm(parent, { recursive: true, force: true }));
  const directory = path.join(parent, "private", "reports");
  const input = report([
    entry(2, "EXISTING_MATCH", { family: "BETA" }),
    entry(1, "READY", { family: "ALFA" }),
  ]);

  const paths = await writeMediaSyncReports(input, directory, {
    now: new Date("2026-09-03T22:30:45.123Z"),
  });

  assert.equal(
    path.basename(paths.json),
    "media-sync-staging-20260903T223045123Z.json",
  );
  assert.equal(
    path.basename(paths.csv),
    "media-sync-staging-20260903T223045123Z.csv",
  );
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(paths.json)).mode & 0o777, 0o600);
  assert.equal((await stat(paths.csv)).mode & 0o777, 0o600);

  const parsed = JSON.parse(await readFile(paths.json, "utf8")) as MediaSyncReport;
  assert.deepEqual(parsed.entries.map((item) => item.index), [1, 2]);
  assert.equal(parsed.summary.ready, 1);
  assert.equal(parsed.summary.existingMatch, 1);
  assert.match(await readFile(paths.csv, "utf8"), /"EXISTING_MATCH"/);

  const directoryEntries = await import("node:fs/promises").then(({ readdir }) =>
    readdir(directory),
  );
  assert.deepEqual(directoryEntries.sort(), [
    path.basename(paths.csv),
    path.basename(paths.json),
  ]);
});

test("nunca sobrescribe un reporte del mismo timestamp", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "media-sync-collision-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  const now = new Date("2026-09-03T22:30:45.123Z");
  const input = report([entry(1, "READY")]);

  await writeMediaSyncReports(input, directory, { now });
  await assert.rejects(
    writeMediaSyncReports(input, directory, { now }),
    /no se sobrescribió/,
  );
});

test("rechaza un directorio preexistente público sin cambiar sus permisos", async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "media-sync-public-report-"));
  t.after(async () => rm(parent, { recursive: true, force: true }));
  const directory = path.join(parent, "reports");
  await mkdir(directory, { mode: 0o755 });
  await chmod(directory, 0o755);

  await assert.rejects(
    writeMediaSyncReports(report([entry(1, "READY")]), directory),
    /permisos privados 0700/,
  );
  assert.equal((await stat(directory)).mode & 0o777, 0o755);
});

// Compile-time guard: summary remains the shared MediaSyncSummary contract.
const _summaryContract: MediaSyncSummary = buildMediaSyncSummary([]);
void _summaryContract;
