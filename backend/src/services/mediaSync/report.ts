import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  chmod,
  link,
  lstat,
  mkdir,
  open,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import {
  MEDIA_SYNC_STATUSES,
  type MediaSyncReport,
  type MediaSyncReportEntry,
  type MediaSyncStatus,
  type MediaSyncSummary,
} from "./types";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const MAX_REASON_LENGTH = 2_000;

const SKIPPED_STATUSES = new Set<MediaSyncStatus>([
  "SKIPPED_REVIEW_REQUIRED",
  "SKIPPED_AMBIGUOUS_VARIANT",
  "SKIPPED_UNSUPPORTED_TYPE",
]);
const INVALID_STATUSES = new Set<MediaSyncStatus>([
  "INVALID_LOCAL_FILE",
  "HASH_MISMATCH",
  "DIMENSION_MISMATCH",
  "DUPLICATE_STORAGE_PATH",
]);
const ELIGIBLE_STATUSES = new Set<MediaSyncStatus>([
  "READY",
  "EXISTING_MATCH",
  "REMOTE_CONFLICT",
  "UPLOADED",
  "FAILED",
]);

export type MediaSyncSummaryOptions = {
  /** Counts can overlap primary result statuses, so the manifest reader supplies them. */
  reviewRequiredCount?: number;
  ambiguousVariantCount?: number;
  /** A write can be reconciled as EXISTING_MATCH after an ambiguous network result. */
  writeOperations?: number;
};

export type WriteMediaSyncReportOptions = {
  now?: Date;
  /** Values are removed if an upstream error accidentally includes one in a reason. */
  sensitiveValues?: readonly string[];
};

export type MediaSyncReportPaths = {
  json: string;
  csv: string;
};

function countStatuses(entries: readonly MediaSyncReportEntry[]) {
  const counts = Object.fromEntries(
    MEDIA_SYNC_STATUSES.map((status) => [status, 0]),
  ) as Record<MediaSyncStatus, number>;

  for (const entry of entries) counts[entry.status] += 1;
  return counts;
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

function sortedUnique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort(
    (left, right) => left.localeCompare(right, "en", { sensitivity: "variant" }),
  );
}

/**
 * Builds the derived portion of a report from final, one-status-per-entry results.
 * Manifest-level review and ambiguity totals are explicit because those flags may
 * overlap while each report entry intentionally has only one primary status.
 */
export function buildMediaSyncSummary(
  entries: readonly MediaSyncReportEntry[],
  options: MediaSyncSummaryOptions = {},
): MediaSyncSummary {
  const statusCounts = countStatuses(entries);
  const eligibleEntries = entries.filter((entry) => ELIGIBLE_STATUSES.has(entry.status));
  const eligibleOriginalBytes = eligibleEntries.reduce(
    (total, entry) => total + Math.max(0, entry.originalBytes),
    0,
  );
  const totalEligibleBytes = eligibleEntries.reduce(
    (total, entry) => total + Math.max(0, entry.bytes),
    0,
  );

  return {
    totalManifest: entries.length,
    totalOptimized: entries.filter((entry) => entry.optimizedPath !== null).length,
    eligible: eligibleEntries.length,
    ready: statusCounts.READY,
    existingMatch: statusCounts.EXISTING_MATCH,
    uploaded: statusCounts.UPLOADED,
    reviewRequiredCount:
      options.reviewRequiredCount ?? statusCounts.SKIPPED_REVIEW_REQUIRED,
    ambiguousVariantCount:
      options.ambiguousVariantCount ?? statusCounts.SKIPPED_AMBIGUOUS_VARIANT,
    skipped: entries.filter((entry) => SKIPPED_STATUSES.has(entry.status)).length,
    invalid: entries.filter((entry) => INVALID_STATUSES.has(entry.status)).length,
    remoteConflicts: statusCounts.REMOTE_CONFLICT,
    failed: statusCounts.FAILED,
    totalEligibleBytes,
    bytesToUpload: entries
      .filter((entry) => entry.status === "READY")
      .reduce((total, entry) => total + Math.max(0, entry.bytes), 0),
    eligibleOriginalBytes,
    savingPercent:
      eligibleOriginalBytes > 0
        ? roundPercent(
            ((eligibleOriginalBytes - totalEligibleBytes) / eligibleOriginalBytes) * 100,
          )
        : 0,
    familiesCovered: sortedUnique(eligibleEntries.map((entry) => entry.family)),
    variantSkusCovered: sortedUnique(
      eligibleEntries.map((entry) => entry.variantCode),
    ),
    statusCounts,
    writeOperations: options.writeOperations ?? statusCounts.UPLOADED,
  };
}

function redactString(value: string, sensitiveValues: readonly string[]) {
  let redacted = value;

  for (const secret of sensitiveValues) {
    if (secret.length >= 4) redacted = redacted.split(secret).join("[REDACTED]");
  }

  // Credentials embedded in URLs (including PostgreSQL connection strings).
  redacted = redacted.replace(
    /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"']+/gi,
    "[REDACTED_DATABASE_URL]",
  );
  redacted = redacted.replace(
    /(https?:\/\/[^\s/:@]+:)[^\s@/]+@/gi,
    "$1[REDACTED]@",
  );

  // Common bearer/JWT/Supabase secret forms.
  redacted = redacted.replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]");
  redacted = redacted.replace(
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    "[REDACTED_JWT]",
  );
  redacted = redacted.replace(
    /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/gi,
    "[REDACTED_SUPABASE_KEY]",
  );
  redacted = redacted.replace(
    /\b((?:database_url|service_role_key|supabase_service_role_key|password|secret|token|authorization|cookie|api[_-]?key)\s*[:=]\s*)([^\s,;]+)/gi,
    "$1[REDACTED]",
  );
  redacted = redacted.replace(
    /([?&](?:access_token|token|key|apikey|api_key|password|secret|signature)=)[^&#\s]+/gi,
    "$1[REDACTED]",
  );

  if (redacted.length > MAX_REASON_LENGTH) {
    return `${redacted.slice(0, MAX_REASON_LENGTH)}…[truncated]`;
  }
  return redacted;
}

function sanitizeEntry(
  entry: MediaSyncReportEntry,
  sensitiveValues: readonly string[],
): MediaSyncReportEntry {
  // This explicit allowlist prevents accidental future adapter/config fields from
  // leaking into either report even if an object is widened before it reaches us.
  return {
    index: entry.index,
    family: redactString(entry.family, sensitiveValues),
    role: redactString(entry.role, sensitiveValues),
    variantCode:
      entry.variantCode === null
        ? null
        : redactString(entry.variantCode, sensitiveValues),
    sourcePath: redactString(entry.sourcePath, sensitiveValues),
    optimizedPath:
      entry.optimizedPath === null
        ? null
        : redactString(entry.optimizedPath, sensitiveValues),
    storagePath:
      entry.storagePath === null
        ? null
        : redactString(entry.storagePath, sensitiveValues),
    status: entry.status,
    reasons: [...entry.reasons]
      .map((reason) => redactString(reason, sensitiveValues))
      .sort((left, right) => left.localeCompare(right, "en")),
    originalBytes: entry.originalBytes,
    bytes: entry.bytes,
    width: entry.width,
    height: entry.height,
    expectedSha256: entry.expectedSha256,
    ...(entry.localSha256 ? { localSha256: entry.localSha256 } : {}),
    ...(entry.remoteSha256 ? { remoteSha256: entry.remoteSha256 } : {}),
  };
}

export function sanitizeMediaSyncReport(
  report: MediaSyncReport,
  sensitiveValues: readonly string[] = [],
): MediaSyncReport {
  const entries = report.entries
    .map((entry) => sanitizeEntry(entry, sensitiveValues))
    .sort(
      (left, right) =>
        left.index - right.index ||
        (left.storagePath ?? "").localeCompare(right.storagePath ?? "", "en") ||
        left.family.localeCompare(right.family, "en"),
    );
  const summary = buildMediaSyncSummary(entries, {
    reviewRequiredCount: report.summary.reviewRequiredCount,
    ambiguousVariantCount: report.summary.ambiguousVariantCount,
    writeOperations: report.summary.writeOperations,
  });

  return {
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    environment: "staging",
    projectRef: report.projectRef,
    bucket: report.bucket,
    mode: report.mode,
    manifestPath: redactString(report.manifestPath, sensitiveValues),
    sourceRoot: redactString(report.sourceRoot, sensitiveValues),
    summary,
    entries,
  };
}

function protectCsvFormula(value: string) {
  // Spreadsheet applications can ignore leading whitespace before a formula.
  return /^[\t\r\n ]*[=+\-@]/.test(value) || /^[\t\r]/.test(value)
    ? `'${value}`
    : value;
}

function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "number" ? String(value) : protectCsvFormula(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

export function serializeMediaSyncCsv(report: MediaSyncReport) {
  const headers = [
    "index",
    "family",
    "role",
    "variantCode",
    "sourcePath",
    "optimizedPath",
    "storagePath",
    "status",
    "reasons",
    "originalBytes",
    "bytes",
    "width",
    "height",
    "expectedSha256",
    "localSha256",
    "remoteSha256",
  ] as const;

  const rows = report.entries.map((entry) =>
    [
      entry.index,
      entry.family,
      entry.role,
      entry.variantCode,
      entry.sourcePath,
      entry.optimizedPath,
      entry.storagePath,
      entry.status,
      entry.reasons.join(" | "),
      entry.originalBytes,
      entry.bytes,
      entry.width,
      entry.height,
      entry.expectedSha256,
      entry.localSha256,
      entry.remoteSha256,
    ]
      .map(csvCell)
      .join(","),
  );

  return `${headers.map(csvCell).join(",")}\n${rows.join("\n")}${rows.length ? "\n" : ""}`;
}

function timestampForFile(now: Date) {
  if (!Number.isFinite(now.getTime())) throw new Error("Timestamp de reporte inválido");
  return now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(".", "")
    .replace(/Z$/, "Z");
}

async function ensurePrivateDirectory(reportDirectory: string) {
  await mkdir(reportDirectory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  const stat = await lstat(reportDirectory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("El directorio de reportes debe ser un directorio real");
  }
  const permissions = stat.mode & 0o777;
  if ((permissions & 0o077) !== 0 || (permissions & 0o700) !== 0o700) {
    throw new Error("El directorio de reportes existente debe tener permisos privados 0700");
  }
}

async function pathExists(target: string) {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function preparePrivateTempFile(target: string, contents: string) {
  const temporaryPath = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const handle = await open(temporaryPath, "wx", PRIVATE_FILE_MODE);
  try {
    await handle.writeFile(contents, { encoding: "utf8" });
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  await handle.close();
  await chmod(temporaryPath, PRIVATE_FILE_MODE);
  return temporaryPath;
}

/**
 * Writes an all-or-nothing pair without exposing partially written final files.
 * Hard-link publication is atomic and refuses to overwrite an existing report.
 */
async function publishReportPair(
  jsonPath: string,
  jsonContents: string,
  csvPath: string,
  csvContents: string,
) {
  const jsonTemp = await preparePrivateTempFile(jsonPath, jsonContents);
  let csvTemp: string | undefined;
  let jsonPublished = false;
  let csvPublished = false;

  try {
    csvTemp = await preparePrivateTempFile(csvPath, csvContents);
    await link(jsonTemp, jsonPath);
    jsonPublished = true;
    await link(csvTemp, csvPath);
    csvPublished = true;
    await chmod(jsonPath, PRIVATE_FILE_MODE);
    await chmod(csvPath, PRIVATE_FILE_MODE);
  } catch (error) {
    if (jsonPublished) await unlink(jsonPath).catch(() => undefined);
    if (csvPublished) await unlink(csvPath).catch(() => undefined);
    throw error;
  } finally {
    await unlink(jsonTemp).catch(() => undefined);
    if (csvTemp) await unlink(csvTemp).catch(() => undefined);
  }
}

export async function writeMediaSyncReports(
  report: MediaSyncReport,
  reportDirectory: string,
  options: WriteMediaSyncReportOptions = {},
): Promise<MediaSyncReportPaths> {
  const directory = path.resolve(reportDirectory);
  await ensurePrivateDirectory(directory);

  const timestamp = timestampForFile(options.now ?? new Date());
  const baseName = `media-sync-staging-${timestamp}`;
  const jsonPath = path.join(directory, `${baseName}.json`);
  const csvPath = path.join(directory, `${baseName}.csv`);
  if ((await pathExists(jsonPath)) || (await pathExists(csvPath))) {
    throw new Error("Ya existe un reporte para ese timestamp; no se sobrescribió");
  }

  const sanitized = sanitizeMediaSyncReport(report, options.sensitiveValues);
  const jsonContents = `${JSON.stringify(sanitized, null, 2)}\n`;
  const csvContents = serializeMediaSyncCsv(sanitized);
  await publishReportPair(jsonPath, jsonContents, csvPath, csvContents);

  return { json: jsonPath, csv: csvPath };
}
