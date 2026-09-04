import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Only portable commercial data is accepted. Database identifiers are never plan fields. */
const portableText = z.string().min(1).max(2000).refine((value) =>
  value.trim() === value &&
  !/[\u0000-\u001f\u007f]/.test(value) &&
  !/(?:[a-z][a-z0-9+.-]*:\/\/|(?:^|\s)[/~\\]|[a-z]:\\|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\beyJ[\w-]+\.[\w-]+\.[\w-]+|\b(?:sk-|sb_secret_|service_role\s*[:=]))/i.test(value),
);
const code = portableText.pipe(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/).max(100));
const slug = portableText.pipe(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200));
const count = z.number().int().nonnegative();
const referenceSchema = z.object({ code, name: portableText.pipe(z.string().max(200)), slug }).strict();
const variantSchema = z.object({ code, productSlug: slug, variantLabel: portableText.pipe(z.string().max(80)), variantSortOrder: count.max(10000) }).strict();
const familySchema = z.object({
  familyName: portableText.pipe(z.string().max(200)),
  familySlug: slug,
  brand: portableText.pipe(z.string().max(100)),
  category: portableText.pipe(z.string().max(120)),
  variantType: portableText.pipe(z.string().max(50)),
  description: portableText,
  active: z.literal(true),
  featured: z.boolean(),
  imageUrl: z.null(),
  selectedImage: z.object({
    strategy: z.literal("FIRST_ACTIVE_VARIANT"),
    productCode: code,
    source: z.literal("Product.imageUrl / ProductImage"),
    persistFamilyImage: z.literal(false),
  }).strict(),
  productCodes: z.array(code).min(2),
  variants: z.array(variantSchema).min(2),
  warnings: z.array(portableText),
  conflicts: z.array(z.never()).max(0),
}).strict();
const planSchema = z.object({
  schemaVersion: z.literal(1),
  release: z.literal("PRODUCTS_V1"),
  groupingRule: z.literal("ACTIVE_EXACT_COMMERCIAL_NAME_AT_LEAST_TWO_SKUS"),
  persistence: z.literal("QA_BASELINE_NOT_TEMPORARY_FIXTURE"),
  summary: z.object({ products: count, active: count, inactive: count, families: count, groupedVariants: count, individuals: count, commercialItems: count }).strict(),
  families: z.array(familySchema),
  individuals: z.array(referenceSchema),
  inactive: z.array(referenceSchema),
  warnings: z.array(portableText),
  conflicts: z.array(z.never()).max(0),
}).strict();

export interface PlanProductReference { code: string; name: string; slug: string }
export interface PlanVariant { code: string; productSlug: string; variantLabel: string; variantSortOrder: number }
export interface PlanFamily {
  familyName: string;
  familySlug: string;
  brand: string;
  category: string;
  variantType: string;
  description: string;
  active: true;
  featured: boolean;
  imageUrl: null;
  selectedImage: { strategy: "FIRST_ACTIVE_VARIANT"; productCode: string; source: "Product.imageUrl / ProductImage"; persistFamilyImage: false };
  productCodes: string[];
  variants: PlanVariant[];
  warnings: string[];
  conflicts: never[];
}
export interface ProductFamilyPlan {
  schemaVersion: 1;
  release: "PRODUCTS_V1";
  groupingRule: "ACTIVE_EXACT_COMMERCIAL_NAME_AT_LEAST_TWO_SKUS";
  persistence: "QA_BASELINE_NOT_TEMPORARY_FIXTURE";
  summary: { products: number; active: number; inactive: number; families: number; groupedVariants: number; individuals: number; commercialItems: number };
  families: PlanFamily[];
  individuals: PlanProductReference[];
  inactive: PlanProductReference[];
  warnings: string[];
  conflicts: never[];
}
export interface ExpectedPlanCounts {
  families: number;
  variants: number;
  individuals: number;
  active?: number;
  inactive?: number;
  products?: number;
  commercialItems?: number;
}
export const PLAN_ERROR_REASONS = [
  "PLAN_CHECKSUM_INVALID", "PLAN_CHECKSUM_MISMATCH", "PLAN_JSON_INVALID", "PLAN_SCHEMA_INVALID",
  "PLAN_EXPECTATIONS_INVALID", "PLAN_DUPLICATE_FAMILY_SLUG", "PLAN_DUPLICATE_CODE", "PLAN_DUPLICATE_PRODUCT_SLUG",
  "PLAN_FAMILY_PRODUCT_SLUG_COLLISION", "PLAN_PRODUCT_CODES_MISMATCH", "PLAN_DUPLICATE_VARIANT_LABEL",
  "PLAN_IMAGE_SELECTION_MISMATCH", "PLAN_SUMMARY_MISMATCH", "PLAN_EXPECTED_COUNTS_MISMATCH",
] as const;
export class ProductFamilyPlanError extends Error {
  constructor(public readonly reason: typeof PLAN_ERROR_REASONS[number]) {
    super(reason);
    this.name = "ProductFamilyPlanError";
  }
}
function requireValid(condition: boolean, reason: typeof PLAN_ERROR_REASONS[number]): asserts condition {
  if (!condition) throw new ProductFamilyPlanError(reason);
}
function unique(values: readonly string[]): boolean { return new Set(values).size === values.length; }

/** Checks the exact file bytes before JSON parsing; all failures contain fixed, sanitized messages. */
export function validateProductFamilyPlan(raw: string | Buffer, expectedSha256: string, expected: ExpectedPlanCounts): ProductFamilyPlan {
  requireValid(typeof expectedSha256 === "string" && /^[a-fA-F0-9]{64}$/.test(expectedSha256), "PLAN_CHECKSUM_INVALID");
  const digest = createHash("sha256").update(raw).digest();
  requireValid(timingSafeEqual(digest, Buffer.from(expectedSha256, "hex")), "PLAN_CHECKSUM_MISMATCH");
  let value: unknown;
  try { value = JSON.parse(raw.toString()); } catch { throw new ProductFamilyPlanError("PLAN_JSON_INVALID"); }
  const parsed = planSchema.safeParse(value);
  requireValid(parsed.success, "PLAN_SCHEMA_INVALID");
  const plan = parsed.data as ProductFamilyPlan;
  requireValid(Boolean(expected) && [expected.families, expected.variants, expected.individuals].every((value) => Number.isInteger(value) && value >= 0), "PLAN_EXPECTATIONS_INVALID");
  requireValid(Object.values(expected).every((value) => value === undefined || (Number.isInteger(value) && value >= 0)), "PLAN_EXPECTATIONS_INVALID");

  requireValid(unique(plan.families.map((family) => family.familySlug)), "PLAN_DUPLICATE_FAMILY_SLUG");
  const variants = plan.families.flatMap((family) => family.variants);
  const references = [...plan.individuals, ...plan.inactive];
  requireValid(unique([...variants.map((variant) => variant.code), ...references.map((product) => product.code)]), "PLAN_DUPLICATE_CODE");
  const productSlugs = [...variants.map((variant) => variant.productSlug), ...references.map((product) => product.slug)];
  requireValid(unique(productSlugs), "PLAN_DUPLICATE_PRODUCT_SLUG");
  const slugSet = new Set(productSlugs);
  requireValid(plan.families.every((family) => !slugSet.has(family.familySlug)), "PLAN_FAMILY_PRODUCT_SLUG_COLLISION");
  for (const family of plan.families) {
    requireValid(unique(family.productCodes) && family.productCodes.length === family.variants.length && family.variants.every((variant) => family.productCodes.includes(variant.code)), "PLAN_PRODUCT_CODES_MISMATCH");
    requireValid(unique(family.variants.map((variant) => variant.variantLabel)), "PLAN_DUPLICATE_VARIANT_LABEL");
    requireValid(family.selectedImage.productCode === family.variants[0].code, "PLAN_IMAGE_SELECTION_MISMATCH");
  }
  const actual = {
    products: variants.length + references.length,
    active: variants.length + plan.individuals.length,
    inactive: plan.inactive.length,
    families: plan.families.length,
    groupedVariants: variants.length,
    individuals: plan.individuals.length,
    commercialItems: plan.families.length + plan.individuals.length,
  };
  for (const key of Object.keys(actual) as (keyof typeof actual)[]) {
    requireValid(plan.summary[key] === actual[key], "PLAN_SUMMARY_MISMATCH");
  }
  requireValid(expected.families === actual.families && expected.variants === actual.groupedVariants && expected.individuals === actual.individuals, "PLAN_EXPECTED_COUNTS_MISMATCH");
  for (const key of ["active", "inactive", "products", "commercialItems"] as const) {
    requireValid(expected[key] === undefined || expected[key] === actual[key], "PLAN_EXPECTED_COUNTS_MISMATCH");
  }
  return plan;
}

export interface CurrentProduct {
  id: string;
  code: string;
  slug: string;
  name: string;
  active: boolean;
  familyId: string | null;
  variantLabel: string | null;
  variantSortOrder: number;
}
export interface FamilyCreateData {
  slug: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  imageUrl: string | null;
  badge: string | null;
  featured: boolean;
  active: boolean;
  variantType: string;
  alwaysShowAsFamily: boolean;
}
export interface CurrentFamily extends FamilyCreateData { id: string }
export interface VariantLink { productId: string; code: string; familySlug: string; variantLabel: string; variantSortOrder: number }
export type FamilyState = "CREATE_FAMILY" | "FAMILY_UNCHANGED" | "FAMILY_CONFLICT";
export type VariantState = "LINK_VARIANT" | "VARIANT_UNCHANGED" | "UNKNOWN_CODE" | "INACTIVE_PRODUCT" | "PRODUCT_ALREADY_IN_OTHER_FAMILY" | "LABEL_CONFLICT" | "SORT_ORDER_CONFLICT" | "SLUG_CONFLICT" | "INVALID";
export interface ReconciliationConflict {
  scope: "family" | "variant" | "individual" | "inactive" | "catalog";
  reason: string;
  code?: string;
  familySlug?: string;
}
export interface FamilyResult { familySlug: string; state: FamilyState; reasons: string[] }
export interface VariantResult { code: string; familySlug: string; state: VariantState; reasons: string[] }
export interface ReferenceResult { code: string; state: "INDIVIDUAL_UNCHANGED" | "INACTIVE_EXCLUDED" | "CONFLICT"; reasons: string[] }
export interface ReconciliationReport {
  families: FamilyResult[];
  variants: VariantResult[];
  individuals: ReferenceResult[];
  inactive: ReferenceResult[];
  conflicts: ReconciliationConflict[];
  summary: {
    familiesPlanned: number;
    familiesToCreate: number;
    familiesUnchanged: number;
    variantsPlanned: number;
    variantsToLink: number;
    variantsUnchanged: number;
    individuals: number;
    excludedInactiveProducts: number;
    conflicts: number;
    unknownCodes: number;
    inactiveProducts: number;
    protectedFieldsThatWouldChange: 0;
    writesPlanned: number;
    writesPerformed: number;
    actualProducts: number;
    actualActiveProducts: number;
    actualInactiveProducts: number;
  };
}
export interface Reconciliation { report: ReconciliationReport; familiesToCreate: FamilyCreateData[]; variantsToLink: VariantLink[] }

export function familyCreateData(family: PlanFamily): FamilyCreateData {
  return {
    slug: family.familySlug, name: family.familyName, brand: family.brand, category: family.category,
    description: family.description, imageUrl: family.imageUrl, badge: null,
    featured: family.featured, active: family.active, variantType: family.variantType, alwaysShowAsFamily: false,
  };
}
function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const group = result.get(key(row)) ?? [];
    group.push(row);
    result.set(key(row), group);
  }
  return result;
}

/** Pure read-only reconciliation. Never modifies input objects or protected Product fields. */
export function reconcileProductFamilyPlan(plan: ProductFamilyPlan, currentProducts: readonly CurrentProduct[], currentFamilies: readonly CurrentFamily[]): Reconciliation {
  const conflicts: ReconciliationConflict[] = [];
  const productsByCode = groupBy(currentProducts, (product) => product.code);
  const productsBySlug = groupBy(currentProducts, (product) => product.slug);
  const familiesBySlug = groupBy(currentFamilies, (family) => family.slug);
  const expectedCodes = new Set([...plan.families.flatMap((family) => family.productCodes), ...plan.individuals.map((product) => product.code), ...plan.inactive.map((product) => product.code)]);
  const expectedFamilySlugs = new Set(plan.families.map((family) => family.familySlug));
  const families: FamilyResult[] = [];
  const variants: VariantResult[] = [];
  const familiesToCreate: FamilyCreateData[] = [];
  const variantsToLink: VariantLink[] = [];
  const catalogConflict = (reason: string) => conflicts.push({ scope: "catalog", reason });
  // Unexpected database values are not copied into the report: they may contain private data.
  if (currentProducts.some((product) => !expectedCodes.has(product.code))) catalogConflict("UNEXPECTED_PRODUCT");
  if (currentFamilies.some((family) => !expectedFamilySlugs.has(family.slug))) catalogConflict("UNEXPECTED_FAMILY");
  if (!unique(currentProducts.map((product) => product.id))) catalogConflict("DUPLICATE_PRODUCT_ID");
  if (!unique(currentFamilies.map((family) => family.id))) catalogConflict("DUPLICATE_FAMILY_ID");
  if ([...productsByCode.values()].some((rows) => rows.length > 1)) catalogConflict("DUPLICATE_PRODUCT_CODE");
  if ([...productsBySlug.values()].some((rows) => rows.length > 1)) catalogConflict("DUPLICATE_PRODUCT_SLUG");
  if ([...familiesBySlug.values()].some((rows) => rows.length > 1)) catalogConflict("DUPLICATE_FAMILY_SLUG");
  const activeCount = currentProducts.filter((product) => product.active).length;
  if (currentProducts.length !== plan.summary.products) catalogConflict("PRODUCT_COUNT_MISMATCH");
  if (activeCount !== plan.summary.active) catalogConflict("ACTIVE_COUNT_MISMATCH");
  if (currentProducts.length - activeCount !== plan.summary.inactive) catalogConflict("INACTIVE_COUNT_MISMATCH");

  for (const family of plan.families) {
    const matches = familiesBySlug.get(family.familySlug) ?? [];
    const existing = matches.length === 1 ? matches[0] : undefined;
    const expectedData = familyCreateData(family);
    const familyReasons: string[] = [];
    if (matches.length > 1) familyReasons.push("DUPLICATE_FAMILY_SLUG");
    if (productsBySlug.has(family.familySlug)) familyReasons.push("SLUG_CONFLICT");
    if (existing && (Object.keys(expectedData) as (keyof FamilyCreateData)[]).some((key) => existing[key] !== expectedData[key])) familyReasons.push("INCOMPATIBLE_FAMILY_DATA");
    if (existing && currentProducts.some((product) => product.familyId === existing.id && !family.productCodes.includes(product.code))) familyReasons.push("UNEXPECTED_FAMILY_MEMBER");
    const familyState: FamilyState = familyReasons.length ? "FAMILY_CONFLICT" : existing ? "FAMILY_UNCHANGED" : "CREATE_FAMILY";
    families.push({ familySlug: family.familySlug, state: familyState, reasons: familyReasons });
    for (const reason of familyReasons) conflicts.push({ scope: "family", familySlug: family.familySlug, reason });
    if (familyState === "CREATE_FAMILY") familiesToCreate.push(expectedData);

    for (const variant of family.variants) {
      const rows = productsByCode.get(variant.code) ?? [];
      const product = rows.length === 1 ? rows[0] : undefined;
      const reasons: string[] = [];
      let state: VariantState;
      if (rows.length === 0) {
        reasons.push("UNKNOWN_CODE");
        state = "UNKNOWN_CODE";
      } else if (!product) {
        reasons.push("DUPLICATE_PRODUCT_CODE");
        state = "INVALID";
      } else {
        if (!product.active) reasons.push("INACTIVE_PRODUCT");
        if (product.slug !== variant.productSlug) reasons.push("SLUG_CONFLICT");
        if (product.name !== family.familyName) reasons.push("PRODUCT_NAME_MISMATCH");
        if (product.familyId !== null && product.familyId !== existing?.id) reasons.push("PRODUCT_ALREADY_IN_OTHER_FAMILY");
        const linkedToExpectedFamily = Boolean(existing) && product.familyId === existing.id;
        if ((linkedToExpectedFamily || product.variantLabel !== null) && product.variantLabel !== variant.variantLabel) reasons.push("LABEL_CONFLICT");
        // An unlinked default 0 is not existing variant metadata; linking assigns the planned order.
        if ((linkedToExpectedFamily || product.variantSortOrder !== 0) && product.variantSortOrder !== variant.variantSortOrder) reasons.push("SORT_ORDER_CONFLICT");
        if (!Number.isInteger(product.variantSortOrder) || product.variantSortOrder < 0) reasons.push("INVALID_VARIANT_METADATA");
        if (familyState === "FAMILY_CONFLICT") reasons.push(familyReasons.includes("SLUG_CONFLICT") ? "SLUG_CONFLICT" : "FAMILY_CONFLICT");
        const stateReason = reasons.find((reason) => ["INACTIVE_PRODUCT", "SLUG_CONFLICT", "PRODUCT_ALREADY_IN_OTHER_FAMILY", "LABEL_CONFLICT", "SORT_ORDER_CONFLICT"].includes(reason));
        state = reasons.length ? (stateReason as VariantState | undefined) ?? "INVALID" : linkedToExpectedFamily ? "VARIANT_UNCHANGED" : "LINK_VARIANT";
        if (state === "LINK_VARIANT") variantsToLink.push({ productId: product.id, code: variant.code, familySlug: family.familySlug, variantLabel: variant.variantLabel, variantSortOrder: variant.variantSortOrder });
      }
      variants.push({ code: variant.code, familySlug: family.familySlug, state, reasons });
      for (const reason of reasons) conflicts.push({ scope: "variant", code: variant.code, familySlug: family.familySlug, reason });
    }
  }

  const checkReferences = (references: PlanProductReference[], scope: "individual" | "inactive"): ReferenceResult[] => references.map((reference) => {
    const rows = productsByCode.get(reference.code) ?? [];
    const product = rows.length === 1 ? rows[0] : undefined;
    const reasons: string[] = [];
    if (rows.length === 0) reasons.push("UNKNOWN_CODE");
    else if (!product) reasons.push("DUPLICATE_PRODUCT_CODE");
    else {
      if (product.active !== (scope === "individual")) reasons.push(scope === "individual" ? "INACTIVE_PRODUCT" : "EXCLUDED_PRODUCT_IS_ACTIVE");
      if (product.familyId !== null) reasons.push("PRODUCT_ALREADY_IN_OTHER_FAMILY");
      if (product.slug !== reference.slug) reasons.push("SLUG_CONFLICT");
      if (product.name !== reference.name) reasons.push("PRODUCT_NAME_MISMATCH");
      if (product.variantLabel !== null || product.variantSortOrder !== 0) reasons.push("UNEXPECTED_VARIANT_METADATA");
    }
    for (const reason of reasons) conflicts.push({ scope, code: reference.code, reason });
    return { code: reference.code, state: reasons.length ? "CONFLICT" : scope === "individual" ? "INDIVIDUAL_UNCHANGED" : "INACTIVE_EXCLUDED", reasons };
  });
  const individuals = checkReferences(plan.individuals, "individual");
  const inactive = checkReferences(plan.inactive, "inactive");
  const report: ReconciliationReport = {
    families, variants, individuals, inactive, conflicts,
    summary: {
      familiesPlanned: families.length,
      familiesToCreate: familiesToCreate.length,
      familiesUnchanged: families.filter((family) => family.state === "FAMILY_UNCHANGED").length,
      variantsPlanned: variants.length,
      variantsToLink: variantsToLink.length,
      variantsUnchanged: variants.filter((variant) => variant.state === "VARIANT_UNCHANGED").length,
      individuals: individuals.length,
      excludedInactiveProducts: inactive.filter((product) => product.state === "INACTIVE_EXCLUDED").length,
      conflicts: conflicts.length,
      unknownCodes: conflicts.filter((conflict) => conflict.reason === "UNKNOWN_CODE").length,
      inactiveProducts: conflicts.filter((conflict) => conflict.reason === "INACTIVE_PRODUCT").length,
      protectedFieldsThatWouldChange: 0,
      writesPlanned: familiesToCreate.length + variantsToLink.length,
      writesPerformed: 0,
      actualProducts: currentProducts.length,
      actualActiveProducts: activeCount,
      actualInactiveProducts: currentProducts.length - activeCount,
    },
  };
  return { report, familiesToCreate, variantsToLink };
}
