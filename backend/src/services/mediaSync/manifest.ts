import { readFileSync } from "node:fs";
import { z } from "zod";
import type { FlattenedManifestEntry, MediaManifest } from "./types";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const confidenceSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
const roleSchema = z.enum([
  "HERO",
  "BENEFITS",
  "USAGE",
  "SAFETY",
  "INFOGRAPHIC",
  "VARIANT_IMAGE",
  "TECHNICAL_SHEET",
  "SDS",
  "OTHER",
]);

const manifestFileSchema = z.object({
  sourcePath: z.string().min(1),
  logicalPath: z.string().min(1),
  family: z.string().trim().min(1),
  familyAssociationConfidence: confidenceSchema,
  classification: roleSchema,
  classificationConfidence: confidenceSchema,
  productCode: z.string().min(1).nullable(),
  variantLabel: z.string().min(1).nullable(),
  width: z.number().int().positive().max(10_000),
  height: z.number().int().positive().max(10_000),
  bytes: z.number().int().positive(),
  format: z.string().min(1),
  sha256: sha256Schema,
  reviewRequired: z.boolean(),
  ambiguousVariantAssociation: z.boolean().optional(),
  reviewReasons: z.array(z.string()),
  role: roleSchema,
  variantCode: z.string().min(1).nullable(),
  originalWidth: z.number().int().positive().max(100_000),
  originalHeight: z.number().int().positive().max(100_000),
  originalBytes: z.number().int().positive(),
  optimizedPath: z.string().min(1).nullable(),
  optimizedSha256: sha256Schema.nullable(),
  mimeType: z.string().min(1).nullable(),
  sourceSha256: sha256Schema,
  bucket: z.string().min(1).nullable(),
  storagePath: z.string().min(1).nullable(),
}).strict().superRefine((file, context) => {
  if (file.classification !== file.role) {
    context.addIssue({ code: "custom", message: "classification y role no coinciden" });
  }
  const optimizedFields = [file.optimizedPath, file.optimizedSha256, file.mimeType, file.bucket, file.storagePath];
  const populated = optimizedFields.filter((value) => value !== null).length;
  if (populated !== 0 && populated !== optimizedFields.length) {
    context.addIssue({ code: "custom", message: "Los campos optimizados deben estar todos presentes o todos ausentes" });
  }
});

const manifestVariantSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  image: z.string().min(1),
}).strict();

const manifestFamilySchema = z.object({
  family: z.string().trim().min(1),
  media: z.record(z.string(), z.array(z.string())),
  variants: z.array(manifestVariantSchema),
  files: z.array(manifestFileSchema),
}).strict();

const mediaManifestSchema = z.object({
  schemaVersion: z.literal(2),
  generatedAt: z.string().min(1),
  sourceRoot: z.string().min(1),
  policy: z.record(z.string(), z.unknown()),
  summary: z.record(z.string(), z.unknown()),
  families: z.array(manifestFamilySchema).min(1),
  unassociated: z.array(z.unknown()),
  exactDuplicates: z.array(z.unknown()),
  optimization: z.object({
    outputRoot: z.string().min(1),
    format: z.literal("image/webp"),
    processed: z.number().int().nonnegative(),
    excludedForReview: z.number().int().nonnegative(),
    originalBytes: z.number().int().nonnegative(),
    optimizedBytes: z.number().int().nonnegative(),
    savingPercent: z.number().min(0).max(100),
    originalsModified: z.literal(false),
  }).strict(),
}).strict().superRefine((manifest, context) => {
  const files = manifest.families.flatMap((family) => family.files);
  const optimized = files.filter((file) => file.optimizedPath !== null);
  if (manifest.optimization.processed !== optimized.length) {
    context.addIssue({ code: "custom", message: "optimization.processed no coincide con los archivos optimizados" });
  }
  const declaredTotal = manifest.summary.totalImages;
  if (typeof declaredTotal === "number" && declaredTotal !== files.length) {
    context.addIssue({ code: "custom", message: "summary.totalImages no coincide con el manifest" });
  }
  for (const family of manifest.families) {
    family.files.forEach((file, fileIndex) => {
      if (file.family !== family.family) {
        context.addIssue({
          code: "custom",
          path: ["families", manifest.families.indexOf(family), "files", fileIndex, "family"],
          message: "La familia del archivo no coincide con su contenedor",
        });
      }
    });
  }
});

export function parseMediaManifest(input: unknown): MediaManifest {
  const result = mediaManifestSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const location = issue?.path.length ? issue.path.join(".") : "manifest";
    throw new Error(`Manifest inválido en ${location}: ${issue?.message ?? "estructura no válida"}`);
  }
  return result.data as MediaManifest;
}

export function loadMediaManifest(manifestPath: string): MediaManifest {
  let source: string;
  try {
    source = readFileSync(manifestPath, "utf8");
  } catch {
    throw new Error("No fue posible leer el manifest indicado");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("El manifest no contiene JSON válido");
  }
  return parseMediaManifest(parsed);
}

export function flattenMediaManifest(manifest: MediaManifest): FlattenedManifestEntry[] {
  let index = 0;
  return manifest.families.flatMap((family) => family.files.map((file) => ({
    ...file,
    index: index++,
    declaredVariants: family.variants,
  })));
}
