import { createHash } from "node:crypto";
import { assertSafeStoragePath } from "../storageObjectPath";
import { LocalMediaValidationError, inspectLocalMedia } from "./localFile";
import { MediaStorageConflictError, type MediaStorageAdapter } from "./storageAdapter";
import type {
  FlattenedManifestEntry,
  MediaManifest,
  MediaSyncArguments,
  MediaSyncReportEntry,
  ValidatedLocalMedia,
} from "./types";

type MediaSyncRunnerInput = {
  manifest: MediaManifest;
  entries: FlattenedManifestEntry[];
  arguments: MediaSyncArguments;
  storage: MediaStorageAdapter;
};

export type MediaSyncRunnerResult = {
  entries: MediaSyncReportEntry[];
  writeOperations: number;
};

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function reportEntry(entry: FlattenedManifestEntry): MediaSyncReportEntry {
  return {
    index: entry.index,
    family: entry.family,
    role: entry.role,
    variantCode: entry.variantCode,
    sourcePath: entry.sourcePath,
    optimizedPath: entry.optimizedPath,
    storagePath: entry.storagePath,
    status: "FAILED",
    reasons: [],
    originalBytes: entry.originalBytes,
    bytes: entry.bytes,
    width: entry.width,
    height: entry.height,
    expectedSha256: entry.optimizedSha256,
  };
}

function setStatus(target: MediaSyncReportEntry, status: MediaSyncReportEntry["status"], reason: string) {
  target.status = status;
  target.reasons = [reason];
  return target;
}

function classifyVariant(entry: FlattenedManifestEntry) {
  if (entry.role !== "VARIANT_IMAGE") return undefined;
  if (
    !entry.variantCode ||
    entry.classificationConfidence !== "HIGH" ||
    entry.familyAssociationConfidence !== "HIGH"
  ) {
    return "La asociación de variante no tiene código y confianza HIGH inequívocos";
  }
  const matchingVariants = entry.declaredVariants.filter((variant) => variant.code === entry.variantCode);
  const matchingAsset = matchingVariants.filter((variant) => variant.image === entry.storagePath);
  const labelsAreConsistent = matchingVariants.every((variant) => variant.label === entry.variantLabel);
  if (!matchingVariants.length || matchingAsset.length !== 1 || !labelsAreConsistent) {
    return "El SKU de variante no tiene una asociación única y consistente en el manifest";
  }
  return undefined;
}

function validateStoragePath(entry: FlattenedManifestEntry) {
  if (!entry.storagePath || entry.bucket !== "product-media") throw new Error("Falta el destino canónico de Storage");
  assertSafeStoragePath(entry.storagePath);
}

function duplicatePaths(entries: FlattenedManifestEntry[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.storagePath) counts.set(entry.storagePath, (counts.get(entry.storagePath) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([storagePath]) => storagePath));
}

async function mapLimited<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const current = items[cursor];
      cursor += 1;
      await task(current);
    }
  });
  await Promise.all(workers);
}

export async function synchronizeProductMedia(input: MediaSyncRunnerInput): Promise<MediaSyncRunnerResult> {
  const duplicates = duplicatePaths(input.entries);
  const results = input.entries.map(reportEntry);
  const eligible: Array<{
    manifestEntry: FlattenedManifestEntry;
    report: MediaSyncReportEntry;
    local: ValidatedLocalMedia;
  }> = [];

  for (const entry of input.entries) {
    const target = results[entry.index];

    if (entry.ambiguousVariantAssociation === true) {
      setStatus(target, "SKIPPED_AMBIGUOUS_VARIANT", "Asociación de variante marcada para revisión humana");
      continue;
    }
    if (entry.reviewRequired) {
      setStatus(target, "SKIPPED_REVIEW_REQUIRED", "El manifest requiere revisión humana");
      continue;
    }
    if (["TECHNICAL_SHEET", "SDS", "OTHER"].includes(entry.role)) {
      setStatus(target, "SKIPPED_UNSUPPORTED_TYPE", "Tipo de medio fuera del alcance inicial WebP");
      continue;
    }
    if (entry.familyAssociationConfidence !== "HIGH") {
      setStatus(target, "SKIPPED_REVIEW_REQUIRED", "La asociación familiar no tiene confianza HIGH y requiere revisión humana");
      continue;
    }
    if (entry.storagePath && duplicates.has(entry.storagePath)) {
      setStatus(target, "DUPLICATE_STORAGE_PATH", "storagePath duplicado en el manifest");
      continue;
    }
    const variantProblem = classifyVariant(entry);
    if (variantProblem) {
      setStatus(target, "SKIPPED_AMBIGUOUS_VARIANT", variantProblem);
      continue;
    }

    try {
      if (!entry.family.trim()) throw new Error("La familia no está identificada");
      validateStoragePath(entry);
      const local = inspectLocalMedia(entry, input.arguments.sourceRoot, input.manifest.optimization.outputRoot);
      target.localSha256 = local.sha256;
      eligible.push({ manifestEntry: entry, report: target, local });
    } catch (error) {
      if (error instanceof LocalMediaValidationError) {
        setStatus(target, error.kind, error.message);
      } else {
        setStatus(target, "INVALID_LOCAL_FILE", "Ruta o metadatos locales inválidos");
      }
    }
  }

  let writeOperations = 0;
  await mapLimited(eligible, input.arguments.concurrency, async ({ manifestEntry, report, local }) => {
    try {
      const remote = await input.storage.inspect(manifestEntry.storagePath!);
      if (remote.status === "object") {
        const remoteSha256 = sha256(remote.bytes);
        report.remoteSha256 = remoteSha256;
        if (remote.mimeType === "image/webp" && remoteSha256 === local.sha256) {
          setStatus(report, "EXISTING_MATCH", "El objeto remoto coincide; no requiere escritura");
        } else {
          setStatus(report, "REMOTE_CONFLICT", "El objeto remoto existe con contenido o MIME diferente");
        }
        return;
      }

      if (input.arguments.mode === "dry-run") {
        setStatus(report, "READY", "Validación completa; el objeto no existe en staging");
        return;
      }

      writeOperations += 1;
      const uploaded = await input.storage.upload(manifestEntry.storagePath!, local.bytes);
      if (uploaded.status === "existing") {
        setStatus(report, "EXISTING_MATCH", "La reconciliación confirmó contenido remoto idéntico");
      } else {
        setStatus(report, "UPLOADED", "Objeto creado sin sobrescritura");
      }
    } catch (error) {
      if (error instanceof MediaStorageConflictError) {
        setStatus(report, "REMOTE_CONFLICT", "La reconciliación detectó contenido remoto diferente");
      } else {
        setStatus(report, "FAILED", "La inspección remota no pudo completarse de forma segura");
      }
    }
  });

  results.sort((left, right) => left.index - right.index);
  return { entries: results, writeOperations };
}
