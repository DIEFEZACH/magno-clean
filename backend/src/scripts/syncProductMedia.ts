import path from "node:path";
import { createSupabaseMediaStorageAdapter } from "../services/mediaSync/storageAdapter";
import { loadExactStagingConfig, parseMediaSyncArgs } from "../services/mediaSync/config";
import { flattenMediaManifest, loadMediaManifest } from "../services/mediaSync/manifest";
import { buildMediaSyncSummary, writeMediaSyncReports } from "../services/mediaSync/report";
import { synchronizeProductMedia } from "../services/mediaSync/runner";
import type { MediaSyncReport } from "../services/mediaSync/types";

function displayPath(target: string) {
  const relative = path.relative(process.cwd(), target);
  return relative && !relative.startsWith("..") ? relative : target;
}

export async function runProductMediaSync(argv = process.argv.slice(2)) {
  // Argument gates run before reading any file or making any network request.
  const args = parseMediaSyncArgs(argv);
  const stagingConfig = loadExactStagingConfig(args.envFilePath, args.projectRef);
  const manifest = loadMediaManifest(args.manifestPath);
  const entries = flattenMediaManifest(manifest);
  const storage = createSupabaseMediaStorageAdapter({
    supabaseUrl: stagingConfig.supabaseUrl,
    serviceRoleKey: stagingConfig.serviceRoleKey,
    bucket: args.bucket,
  });

  const sync = await synchronizeProductMedia({ manifest, entries, arguments: args, storage });
  if (args.mode === "dry-run" && sync.writeOperations !== 0) {
    throw new Error("Invariante de seguridad violada: un dry-run intentó escribir");
  }
  if (args.mode === "dry-run" && sync.entries.some((entry) => entry.status === "UPLOADED")) {
    throw new Error("Invariante de seguridad violada: UPLOADED no es válido en dry-run");
  }

  const summary = buildMediaSyncSummary(sync.entries, {
    reviewRequiredCount: entries.filter((entry) => entry.reviewRequired).length,
    ambiguousVariantCount: entries.filter((entry) => entry.ambiguousVariantAssociation === true).length,
    writeOperations: sync.writeOperations,
  });
  const report: MediaSyncReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: "staging",
    projectRef: args.projectRef,
    bucket: args.bucket,
    mode: args.mode,
    manifestPath: displayPath(args.manifestPath),
    sourceRoot: displayPath(args.sourceRoot),
    summary,
    entries: sync.entries,
  };
  const reportPaths = await writeMediaSyncReports(report, args.reportDirectory, {
    sensitiveValues: [stagingConfig.serviceRoleKey],
  });

  const publicResult = {
    environment: report.environment,
    projectRef: report.projectRef,
    bucket: report.bucket,
    mode: report.mode,
    summary: report.summary,
    reports: {
      json: displayPath(reportPaths.json),
      csv: displayPath(reportPaths.csv),
    },
  };
  process.stdout.write(`${JSON.stringify(publicResult, null, 2)}\n`);
  return { report, reportPaths };
}

if (require.main === module) {
  runProductMediaSync().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Error desconocido";
    process.stderr.write(`Media sync abortado: ${message}\n`);
    process.exitCode = 1;
  });
}
