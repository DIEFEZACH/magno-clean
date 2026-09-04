import path from "node:path";
import { parseExportArgs, loadExportConfig, PRODUCTION_PROJECT_REF } from "../services/stagingCatalog/config";
import { readOnlyProductCatalog } from "../services/stagingCatalog/readCatalog";
import { sanitizeProductRows, validateSnapshot, serializeSnapshot, sha256 } from "../services/stagingCatalog/snapshot";
import { ensurePrivateDirectory, timestampName, writePrivateFile } from "../services/stagingCatalog/privateFiles";
import { safeCatalogError } from "../services/stagingCatalog/safeError";
import { verifyPublicProductionAssetReferences } from "../services/stagingCatalog/imagePolicy";

export async function runCatalogExport(argv = process.argv.slice(2)) {
  const args = parseExportArgs(argv);
  const config = loadExportConfig(args);
  const rows = await readOnlyProductCatalog(config.connection);
  const snapshot = validateSnapshot({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    source: { environment: "production", projectRef: PRODUCTION_PROJECT_REF },
    products: sanitizeProductRows(rows),
  }, { count: args.expectedCount, active: args.expectedActive, inactive: args.expectedInactive });
  // HEAD only; no object body download, redirects, credentials, uploads or Storage mutations.
  const imageReferences = await verifyPublicProductionAssetReferences(snapshot.products);
  // No file is created until every row and count has passed validation.
  const bytes = serializeSnapshot(snapshot);
  const checksum = sha256(bytes);
  const directory = ensurePrivateDirectory(args.outputDir);
  const basename = `products-sanitized-${timestampName()}`;
  const snapshotName = `${basename}.json`;
  const report = {
    schemaVersion: 1,
    operation: "EXPORT_READ_ONLY",
    projectRef: config.projectRef,
    tlsCertificateValidation: "strict",
    snapshot: snapshotName,
    bytes: Buffer.byteLength(bytes, "utf8"),
    sha256: checksum,
    total: snapshot.products.length,
    uniqueCodes: new Set(snapshot.products.map(p => p.code)).size,
    uniqueSlugs: new Set(snapshot.products.map(p => p.slug)).size,
    active: snapshot.products.filter(p => p.active).length,
    inactive: snapshot.products.filter(p => !p.active).length,
    imageUrlsPresent: snapshot.products.filter(p => p.imageUrl !== null).length,
    ...imageReferences,
    inactiveProducts: snapshot.products.filter(p => !p.active).map(({ code, name, active }) => ({ code, name, active })),
    remoteWriteOperations: 0,
    fieldsExcluded: ["id", "createdAt", "updatedAt", "costPrice", "unitPrice", "wholesalePrice", "stock", "reservedStock", "minStock", "familyId", "variantLabel", "variantSortOrder", "relations"],
  };
  writePrivateFile(path.join(directory, snapshotName), bytes);
  writePrivateFile(path.join(directory, `${basename}.sha256`), `${checksum}  ${snapshotName}\n`);
  writePrivateFile(path.join(directory, `${basename}-report.json`), JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  return report;
}

if (require.main === module) {
  runCatalogExport().catch(error => {
    process.stderr.write(`Catalog export abortado: ${safeCatalogError(error)}\n`);
    process.exitCode = 1;
  });
}
