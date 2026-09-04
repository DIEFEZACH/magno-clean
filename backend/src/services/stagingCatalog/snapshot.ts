import { createHash, timingSafeEqual } from "node:crypto";
import { TextDecoder } from "node:util";
import { z } from "zod";
import { PRODUCT_FIELDS, type CatalogExpectations, type CatalogProduct, type CatalogSnapshot } from "./types";
import { isAuthorizedSCN20Image, isPublicCloudinaryImage } from "./imagePolicy";

export class CatalogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogValidationError";
  }
}

// Conservative rejection of recognizable sensitive patterns is not a guarantee
// that arbitrary free text is free of PII. Human review remains necessary.
const sensitivePatterns = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  /-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----/,
  /\b(?:postgres(?:ql)?|redis):\/\//i,
  /\b(?:Bearer\s+\S+|(?:password|passwd|contraseña|secret|token|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|service[_ -]?role|DATABASE_URL|JWT_ACCESS_SECRET)\s*[:=]\s*\S+)/i,
  /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|sb_(?:secret|publishable)_[A-Za-z0-9_-]{16,}|APP_USR-[A-Za-z0-9_-]{16,})\b/,
  /https?:\/\/[^\s/]*supabase\.(?:co|com)\b/i,
  /\b[a-z][a-z\d+.-]*:\/\/[^\s/?#]+@/i,
  /(?:^|\s)(?:\+\d{1,3}[ -]?)?(?:\(?\d{2,4}\)?[ -]){2,4}\d{2,4}(?:$|\s)/,
  /\b\d{10,16}\b/,
];

function hasSensitivePattern(value: string) {
  return sensitivePatterns.some((pattern) => pattern.test(value));
}

function publicText(max: number, nonempty = true) {
  return z.string().max(max).refine((value) => !nonempty || value.trim().length > 0)
    .refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value))
    .refine((value) => !hasSensitivePattern(value));
}

const money = z.number().finite().nonnegative();
const imageUrl = z.string().max(2048).nullable();

const productSchema = z.object({
  slug: publicText(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  code: publicText(100).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  brand: publicText(100),
  name: publicText(200),
  category: publicText(120),
  description: publicText(5000),
  imageUrl,
  badge: publicText(500, false).nullable(),
  price: money,
  oldPrice: money.nullable(),
  digitalPrice: money,
  retailPrice: money,
  featured: z.boolean(),
  active: z.boolean(),
}).strict().refine((product) => product.imageUrl === null
  || isAuthorizedSCN20Image(product.code, product.imageUrl)
  || (isPublicCloudinaryImage(product.imageUrl) && !hasSensitivePattern(product.imageUrl)), { path: ["imageUrl"] });

const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.iso.datetime({ offset: false }),
  source: z.object({
    environment: z.literal("production"),
    projectRef: z.literal("fxbgxjpgfkeuapbmgpmv"),
  }).strict(),
  products: z.array(productSchema),
}).strict();

function fail(message: string): never {
  throw new CatalogValidationError(message);
}

export function validateCatalogProduct(input: unknown): CatalogProduct {
  const result = productSchema.safeParse(input);
  if (!result.success) fail("Producto inválido: estructura, valor o patrón sensible no autorizado.");
  return result.data as CatalogProduct;
}

export function sanitizeProductRows(rows: unknown[]): CatalogProduct[] {
  if (!Array.isArray(rows)) fail("El resultado Product debe ser una lista.");
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) fail(`Fila Product ${index + 1} inválida.`);
    const projected = Object.fromEntries(PRODUCT_FIELDS.map((field) => [field, (row as Record<string, unknown>)[field]]));
    try {
      return validateCatalogProduct(projected);
    } catch {
      fail(`Fila Product ${index + 1} inválida; no se exportaron sus valores.`);
    }
  });
}

export function validateSnapshot(input: unknown, expectations: CatalogExpectations = {}): CatalogSnapshot {
  const result = snapshotSchema.safeParse(input);
  if (!result.success) fail("Snapshot inválido: estructura, origen, campos o valores no autorizados.");
  const data = result.data as CatalogSnapshot;
  for (const field of ["code", "slug"] as const) {
    if (new Set(data.products.map((product) => product[field])).size !== data.products.length) {
      fail(`Snapshot inválido: ${field} duplicado.`);
    }
  }
  for (const value of Object.values(expectations)) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) fail("Expectativas de conteo inválidas.");
  }
  const active = data.products.filter((product) => product.active).length;
  const actual = { count: data.products.length, active, inactive: data.products.length - active };
  for (const key of ["count", "active", "inactive"] as const) {
    if (expectations[key] !== undefined && actual[key] !== expectations[key]) {
      fail(`Conteo ${key} inesperado: esperado ${expectations[key]}, observado ${actual[key]}.`);
    }
  }
  return data;
}

export function serializeSnapshot(snapshot: CatalogSnapshot): string {
  return `${JSON.stringify(validateSnapshot(snapshot), null, 2)}\n`;
}

export function sha256(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function verifySnapshotBytes(bytes: Buffer, expectedSha256: string, expectations?: CatalogExpectations): CatalogSnapshot {
  if (!Buffer.isBuffer(bytes)) fail("El snapshot debe proporcionarse como bytes.");
  if (!/^[a-fA-F0-9]{64}$/.test(expectedSha256)) fail("Checksum SHA-256 inválido.");
  if (!timingSafeEqual(Buffer.from(sha256(bytes), "hex"), Buffer.from(expectedSha256, "hex"))) {
    fail("El checksum del snapshot no coincide.");
  }
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail("El snapshot no contiene JSON UTF-8 válido.");
  }
  return validateSnapshot(input, expectations);
}
