export const MEDIA_SYNC_STATUSES = [
  "READY",
  "EXISTING_MATCH",
  "SKIPPED_REVIEW_REQUIRED",
  "SKIPPED_AMBIGUOUS_VARIANT",
  "SKIPPED_UNSUPPORTED_TYPE",
  "INVALID_LOCAL_FILE",
  "HASH_MISMATCH",
  "DIMENSION_MISMATCH",
  "DUPLICATE_STORAGE_PATH",
  "REMOTE_CONFLICT",
  "UPLOADED",
  "FAILED",
] as const;

export type MediaSyncStatus = (typeof MEDIA_SYNC_STATUSES)[number];
export type MediaSyncMode = "dry-run" | "execute";
export type MediaConfidence = "LOW" | "MEDIUM" | "HIGH";

export type MediaManifestVariant = {
  code: string;
  label: string;
  image: string;
};

export type MediaManifestFile = {
  sourcePath: string;
  logicalPath: string;
  family: string;
  familyAssociationConfidence: MediaConfidence;
  classification: string;
  classificationConfidence: MediaConfidence;
  productCode: string | null;
  variantLabel: string | null;
  width: number;
  height: number;
  bytes: number;
  format: string;
  sha256: string;
  reviewRequired: boolean;
  ambiguousVariantAssociation?: boolean;
  reviewReasons: string[];
  role: string;
  variantCode: string | null;
  originalWidth: number;
  originalHeight: number;
  originalBytes: number;
  optimizedPath: string | null;
  optimizedSha256: string | null;
  mimeType: string | null;
  sourceSha256: string;
  bucket: string | null;
  storagePath: string | null;
};

export type MediaManifestFamily = {
  family: string;
  media: Record<string, string[]>;
  variants: MediaManifestVariant[];
  files: MediaManifestFile[];
};

export type MediaManifest = {
  schemaVersion: number;
  generatedAt: string;
  sourceRoot: string;
  policy: Record<string, unknown>;
  summary: Record<string, unknown>;
  families: MediaManifestFamily[];
  unassociated: unknown[];
  exactDuplicates: unknown[];
  optimization: {
    outputRoot: string;
    format: string;
    processed: number;
    excludedForReview: number;
    originalBytes: number;
    optimizedBytes: number;
    savingPercent: number;
    originalsModified: boolean;
  };
};

export type FlattenedManifestEntry = MediaManifestFile & {
  index: number;
  declaredVariants: MediaManifestVariant[];
};

export type MediaSyncArguments = {
  manifestPath: string;
  sourceRoot: string;
  environment: "staging";
  projectRef: string;
  bucket: string;
  mode: MediaSyncMode;
  confirmation?: string;
  envFilePath: string;
  reportDirectory: string;
  concurrency: number;
};

export type MediaSyncStagingConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  projectRef: string;
};

export type ValidatedLocalMedia = {
  path: string;
  bytes: Buffer;
  sha256: string;
  width: number;
  height: number;
  mimeType: "image/webp";
};

export type MediaSyncReportEntry = {
  index: number;
  family: string;
  role: string;
  variantCode: string | null;
  sourcePath: string;
  optimizedPath: string | null;
  storagePath: string | null;
  status: MediaSyncStatus;
  reasons: string[];
  originalBytes: number;
  bytes: number;
  width: number;
  height: number;
  expectedSha256: string | null;
  localSha256?: string;
  remoteSha256?: string;
};

export type MediaSyncSummary = {
  totalManifest: number;
  totalOptimized: number;
  eligible: number;
  ready: number;
  existingMatch: number;
  uploaded: number;
  reviewRequiredCount: number;
  ambiguousVariantCount: number;
  skipped: number;
  invalid: number;
  remoteConflicts: number;
  failed: number;
  totalEligibleBytes: number;
  bytesToUpload: number;
  eligibleOriginalBytes: number;
  savingPercent: number;
  familiesCovered: string[];
  variantSkusCovered: string[];
  statusCounts: Record<MediaSyncStatus, number>;
  writeOperations: number;
};

export type MediaSyncReport = {
  schemaVersion: 1;
  generatedAt: string;
  environment: "staging";
  projectRef: string;
  bucket: string;
  mode: MediaSyncMode;
  manifestPath: string;
  sourceRoot: string;
  summary: MediaSyncSummary;
  entries: MediaSyncReportEntry[];
};

export type MediaSyncRunResult = {
  report: MediaSyncReport;
  reportPaths?: { json: string; csv: string };
};
