import path from "node:path";
import { parseApplyArgs, loadApplyConfig } from "../services/stagingCatalog/config";
import { readOnlyProductCatalog } from "../services/stagingCatalog/readCatalog";
import { verifySnapshotBytes, sha256 } from "../services/stagingCatalog/snapshot";
import type { CatalogProduct } from "../services/stagingCatalog/types";
import { ensurePrivateDirectory, readChecksumFile, readPrivateSnapshot, timestampName, writePrivateFile } from "../services/stagingCatalog/privateFiles";
import { executeCatalog, previewCatalog } from "../services/stagingCatalog/applyRunner";
import { safeCatalogError } from "../services/stagingCatalog/safeError";
import { imageReferenceCounts } from "../services/stagingCatalog/imagePolicy";

export async function runCatalogApply(argv = process.argv.slice(2)) {
  const args = parseApplyArgs(argv);
  const bytes = readPrivateSnapshot(args.snapshot);
  const checksum = args.sha256 || readChecksumFile(args.checksumFile!, args.snapshot);
  const snapshot = verifySnapshotBytes(bytes, checksum, { count: args.expectedCount, active: args.expectedActive, inactive: args.expectedInactive });
  // This loads only the explicitly selected .env.staging; no production env is opened.
  const config = loadApplyConfig(args);
  const directory = ensurePrivateDirectory(args.outputDir);
  const gate = { environment: args.environment, projectRef: args.projectRef, mode: args.mode, confirm: args.confirm };
  let result;
  if (args.mode === "dry-run") {
    // SELECT is the fixed 14-field projection. The planner reports malformed target rows as INVALID.
    result = await previewCatalog(snapshot.products, async () => await readOnlyProductCatalog(config.connection) as CatalogProduct[], gate);
  } else {
    // Not even import/instantiate the mutation adapter during a dry-run.
    const { createStagingWriter } = await import("../services/stagingCatalog/stagingWriter.js");
    const target = createStagingWriter(config);
    try {
      result = await executeCatalog(snapshot.products, target.writer, gate);
    } finally {
      await target.disconnect();
    }
  }
  const report = {
    schemaVersion: 1,
    operation: args.mode === "dry-run" ? "APPLY_DRY_RUN" : "APPLY_EXECUTE",
    projectRef: config.projectRef,
    tlsCertificateValidation: "strict",
    snapshot: path.basename(args.snapshot),
    bytes: bytes.length,
    sha256: sha256(bytes),
    imageUrlCounts: imageReferenceCounts(snapshot.products),
    ...result,
  };
  const filename = `catalog-${args.mode}-${timestampName()}-report.json`;
  const json = JSON.stringify(report, null, 2) + "\n";
  writePrivateFile(path.join(directory, filename), json);
  writePrivateFile(path.join(directory, filename.replace(/\.json$/, ".sha256")), `${sha256(json)}  ${filename}\n`);
  process.stdout.write(JSON.stringify({
    operation: report.operation,
    projectRef: report.projectRef,
    tlsCertificateValidation: report.tlsCertificateValidation,
    snapshot: report.snapshot,
    bytes: report.bytes,
    sha256: report.sha256,
    imageUrlCounts: report.imageUrlCounts,
    ...result.plan.summary,
    canExecute: result.plan.canExecute,
    writeOperations: result.writeOperations,
    report: filename,
  }, null, 2) + "\n");
  if (!result.plan.canExecute) process.exitCode = 2;
  return report;
}

if (require.main === module) {
  runCatalogApply().catch(error => {
    process.stderr.write(`Catalog staging abortado: ${safeCatalogError(error)}\n`);
    process.exitCode = 1;
  });
}
