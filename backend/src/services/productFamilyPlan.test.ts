import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  familyCreateData,
  reconcileProductFamilyPlan,
  validateProductFamilyPlan,
  type CurrentFamily,
  type CurrentProduct,
  type ExpectedPlanCounts,
  type ProductFamilyPlan,
} from "./productFamilyPlan/plan";

const expected: ExpectedPlanCounts = { families: 1, variants: 2, individuals: 1, inactive: 1, active: 3, products: 4, commercialItems: 2 };
function fixture(): ProductFamilyPlan {
  return {
    schemaVersion: 1,
    release: "PRODUCTS_V1",
    groupingRule: "ACTIVE_EXACT_COMMERCIAL_NAME_AT_LEAST_TWO_SKUS",
    persistence: "QA_BASELINE_NOT_TEMPORARY_FIXTURE",
    summary: { families: 1, groupedVariants: 2, individuals: 1, inactive: 1, active: 3, products: 4, commercialItems: 2 },
    families: [{
      familyName: "CLEANER", familySlug: "cleaner", brand: "Magno Clean", category: "Magno", variantType: "Presentación",
      description: "Disponible en varias presentaciones.", active: true, featured: false, imageUrl: null,
      selectedImage: { strategy: "FIRST_ACTIVE_VARIANT", productCode: "QA1", source: "Product.imageUrl / ProductImage", persistFamilyImage: false },
      productCodes: ["QA1", "QA2"],
      variants: [
        { code: "QA1", productSlug: "cleaner-1-l", variantLabel: "1 L", variantSortOrder: 0 },
        { code: "QA2", productSlug: "cleaner-5-l", variantLabel: "5 L", variantSortOrder: 1 },
      ],
      warnings: [], conflicts: [],
    }],
    individuals: [{ code: "SOLO", name: "SOLO", slug: "solo" }],
    inactive: [{ code: "LEGACY", name: "Legacy", slug: "legacy" }],
    warnings: [], conflicts: [],
  };
}
function validate(value: unknown = fixture(), expectations = expected): ProductFamilyPlan {
  const bytes = Buffer.from(JSON.stringify(value));
  return validateProductFamilyPlan(bytes, createHash("sha256").update(bytes).digest("hex"), expectations);
}
function products(plan = fixture()): CurrentProduct[] {
  return [
    ...plan.families.flatMap((family) => family.variants.map((variant) => ({ code: variant.code, name: family.familyName, slug: variant.productSlug, active: true }))),
    ...plan.individuals.map((product) => ({ ...product, active: true })),
    ...plan.inactive.map((product) => ({ ...product, active: false })),
  ].map((product, index) => ({ ...product, id: `private-product-${index}`, familyId: null, variantLabel: null, variantSortOrder: 0 }));
}
function existingFamily(plan = fixture()): CurrentFamily {
  return { id: "private-family-1", ...familyCreateData(plan.families[0]) };
}
function linkedProducts(plan = fixture()): CurrentProduct[] {
  const family = existingFamily(plan);
  return products(plan).map((product) => {
    const variant = plan.families[0].variants.find((variant) => variant.code === product.code);
    return variant ? { ...product, familyId: family.id, variantLabel: variant.variantLabel, variantSortOrder: variant.variantSortOrder } : product;
  });
}
function hasReason(value: ReturnType<typeof reconcileProductFamilyPlan>, reason: string): boolean {
  return value.report.conflicts.some((conflict) => conflict.reason === reason);
}

test("family plan validates the versioned canonical bytes and all release counts", () => {
  const raw = readFileSync(resolve(__dirname, "../../../docs/product-data/product-family-plan.json"));
  const plan = validateProductFamilyPlan(raw, "686cec7028b355fcc171fad41d2881af4442c9cea68f3a13b576c957bcea0710", {
    families: 25, variants: 79, individuals: 16, products: 98, active: 95, inactive: 3, commercialItems: 41,
  });
  assert.equal(plan.families.length, 25);
  assert.deepEqual(plan.inactive.map((product) => product.slug), ["magno-bot-clean-ai", "magno-hydroforce-2200", "magno-pro-cyclone-x2"]);
  const result = reconcileProductFamilyPlan(plan, products(plan), []);
  assert.equal(result.report.summary.conflicts, 0);
  assert.equal(result.report.summary.familiesToCreate, 25);
  assert.equal(result.report.summary.variantsToLink, 79);
  assert.equal(result.report.summary.individuals, 16);
  assert.equal(result.report.summary.excludedInactiveProducts, 3);
});

test("family plan expectations are supplied by caller, not hardcoded to the release", () => {
  assert.deepEqual(validate(), fixture());
  for (const key of Object.keys(expected) as (keyof ExpectedPlanCounts)[]) {
    assert.throws(() => validate(fixture(), { ...expected, [key]: expected[key] + 1 }), /PLAN_EXPECTED_COUNTS_MISMATCH/);
    assert.throws(() => validate(fixture(), { ...expected, [key]: -1 }), /PLAN_EXPECTATIONS_INVALID/);
  }
  const value = fixture();
  value.summary.active = 2;
  assert.throws(() => validate(value), /PLAN_SUMMARY_MISMATCH/);
});

test("family plan checksum rejects mismatch and malformed hash before JSON parsing", () => {
  const raw = "this is not JSON and contains secret-sentinel";
  assert.throws(() => validateProductFamilyPlan(raw, "0".repeat(64), expected), /^ProductFamilyPlanError: PLAN_CHECKSUM_MISMATCH$/);
  assert.throws(() => validateProductFamilyPlan(raw, "bad-secret-sentinel", expected), /^ProductFamilyPlanError: PLAN_CHECKSUM_INVALID$/);
  const digest = createHash("sha256").update(raw).digest("hex");
  assert.throws(() => validateProductFamilyPlan(raw, digest, expected), /^ProductFamilyPlanError: PLAN_JSON_INVALID$/);
  const bytes = JSON.stringify(fixture());
  assert.deepEqual(validateProductFamilyPlan(bytes, createHash("sha256").update(bytes).digest("hex").toUpperCase(), expected), fixture());
});

test("family plan strict schemas reject protected fields, IDs, inventory, URLs and arbitrary nested data", () => {
  for (const key of ["id", "familyId", "stock", "reservedStock", "price", "WebsiteContent", "environment", "databaseUrl"]) {
    const value = fixture();
    (value as unknown as Record<string, unknown>)[key] = "secret-sentinel";
    assert.throws(() => validate(value), /^ProductFamilyPlanError: PLAN_SCHEMA_INVALID$/);
    const nested = fixture();
    (nested.families[0] as unknown as Record<string, unknown>)[key] = "secret-sentinel";
    assert.throws(() => validate(nested), /^ProductFamilyPlanError: PLAN_SCHEMA_INVALID$/);
    const variant = fixture();
    (variant.families[0].variants[0] as unknown as Record<string, unknown>)[key] = "secret-sentinel";
    assert.throws(() => validate(variant), /^ProductFamilyPlanError: PLAN_SCHEMA_INVALID$/);
    const individual = fixture();
    (individual.individuals[0] as unknown as Record<string, unknown>)[key] = "secret-sentinel";
    assert.throws(() => validate(individual), /^ProductFamilyPlanError: PLAN_SCHEMA_INVALID$/);
  }
  for (const forbidden of ["https://production.example.test/image.png", "/Users/private/file", "C:\\private\\file", "user@example.test", "postgresql://user:secret@example.test/db", "sb_secret_private"]) {
    const value = fixture();
    value.families[0].description = forbidden;
    assert.throws(() => validate(value), /^ProductFamilyPlanError: PLAN_SCHEMA_INVALID$/);
  }
  const value = fixture();
  (value.families[0].selectedImage as unknown as Record<string, unknown>).url = "secret-sentinel";
  assert.throws(() => validate(value), /^ProductFamilyPlanError: PLAN_SCHEMA_INVALID$/);
});

test("family plan rejects empty families, labels and invalid sort orders", () => {
  const empty = fixture();
  empty.families[0].variants = [];
  empty.families[0].productCodes = [];
  assert.throws(() => validate(empty), /PLAN_SCHEMA_INVALID/);
  for (const label of ["", " ", " 1 L", "1 L "]) {
    const value = fixture();
    value.families[0].variants[0].variantLabel = label;
    assert.throws(() => validate(value), /PLAN_SCHEMA_INVALID/);
  }
  for (const order of [-1, 1.5, 10001, "1", null]) {
    const value = fixture();
    (value.families[0].variants[0] as unknown as Record<string, unknown>).variantSortOrder = order;
    assert.throws(() => validate(value), /PLAN_SCHEMA_INVALID/);
  }
});

test("family plan enforces family and variant text bounds before any database query", () => {
  for (const [field, maximum] of [["familyName", 200], ["brand", 100], ["category", 120], ["variantType", 50]] as const) {
    const value = fixture();
    value.families[0][field] = "X".repeat(maximum + 1);
    assert.throws(() => validate(value), /PLAN_SCHEMA_INVALID/);
  }
  const value = fixture();
  value.families[0].variants[0].variantLabel = "X".repeat(81);
  assert.throws(() => validate(value), /PLAN_SCHEMA_INVALID/);
});

test("family plan rejects duplicate family slugs, codes, labels and inconsistent references", () => {
  const duplicateFamily = fixture();
  duplicateFamily.families.push(structuredClone(duplicateFamily.families[0]));
  assert.throws(() => validate(duplicateFamily), /PLAN_DUPLICATE_FAMILY_SLUG/);
  const duplicateCode = fixture();
  duplicateCode.families[0].variants[1].code = "QA1";
  assert.throws(() => validate(duplicateCode), /PLAN_DUPLICATE_CODE/);
  const crossedCode = fixture();
  crossedCode.individuals[0].code = "QA1";
  assert.throws(() => validate(crossedCode), /PLAN_DUPLICATE_CODE/);
  const crossFamily = fixture();
  crossFamily.families.push({ ...structuredClone(crossFamily.families[0]), familySlug: "cleaner-other" });
  assert.throws(() => validate(crossFamily), /PLAN_DUPLICATE_CODE/);
  const duplicateLabel = fixture();
  duplicateLabel.families[0].variants[1].variantLabel = "1 L";
  assert.throws(() => validate(duplicateLabel), /PLAN_DUPLICATE_VARIANT_LABEL/);
  const inconsistentCodes = fixture();
  inconsistentCodes.families[0].productCodes[0] = "OTHER";
  assert.throws(() => validate(inconsistentCodes), /PLAN_PRODUCT_CODES_MISMATCH/);
  const inconsistentImage = fixture();
  inconsistentImage.families[0].selectedImage.productCode = "OTHER";
  assert.throws(() => validate(inconsistentImage), /PLAN_IMAGE_SELECTION_MISMATCH/);
});

test("family plan rejects duplicate product slugs and family/product slug collisions", () => {
  const duplicateSlug = fixture();
  duplicateSlug.individuals[0].slug = duplicateSlug.families[0].variants[0].productSlug;
  assert.throws(() => validate(duplicateSlug), /PLAN_DUPLICATE_PRODUCT_SLUG/);
  const collision = fixture();
  collision.families[0].familySlug = collision.individuals[0].slug;
  assert.throws(() => validate(collision), /PLAN_FAMILY_PRODUCT_SLUG_COLLISION/);
});

test("family reconciliation plans only missing families and links without performing writes", () => {
  const result = reconcileProductFamilyPlan(validate(), products(), []);
  assert.equal(result.report.families[0].state, "CREATE_FAMILY");
  assert.deepEqual(result.report.variants.map((variant) => variant.state), ["LINK_VARIANT", "LINK_VARIANT"]);
  assert.equal(result.report.summary.conflicts, 0);
  assert.equal(result.report.summary.writesPlanned, 3);
  assert.equal(result.report.summary.writesPerformed, 0);
  assert.equal(result.report.summary.protectedFieldsThatWouldChange, 0);
  assert.deepEqual(result.familiesToCreate, [familyCreateData(fixture().families[0])]);
  assert.deepEqual(Object.keys(result.variantsToLink[0]).sort(), ["code", "familySlug", "productId", "variantLabel", "variantSortOrder"]);
});

test("family reconciliation detects unknown and duplicate database codes", () => {
  const unknown = reconcileProductFamilyPlan(fixture(), products().slice(1), []);
  assert.equal(unknown.report.variants[0].state, "UNKNOWN_CODE");
  assert.equal(unknown.report.summary.unknownCodes, 1);
  const rows = products();
  rows.push({ ...rows[0], id: "other-private-id", slug: "different-slug" });
  const duplicate = reconcileProductFamilyPlan(fixture(), rows, []);
  assert.equal(duplicate.report.variants[0].state, "INVALID");
  assert.ok(hasReason(duplicate, "DUPLICATE_PRODUCT_CODE"));
});

test("family reconciliation rejects collisions between a family slug and any Product slug", () => {
  const rows = products();
  rows[2].slug = "cleaner";
  const result = reconcileProductFamilyPlan(fixture(), rows, []);
  assert.equal(result.report.families[0].state, "FAMILY_CONFLICT");
  assert.equal(result.report.variants[0].state, "SLUG_CONFLICT");
  assert.equal(result.familiesToCreate.length, 0);
  assert.equal(result.variantsToLink.length, 0);
});

test("family reconciliation rejects inactive variants and products in another family", () => {
  const inactive = products();
  inactive[0].active = false;
  const result = reconcileProductFamilyPlan(fixture(), inactive, []);
  assert.equal(result.report.variants[0].state, "INACTIVE_PRODUCT");
  assert.equal(result.report.summary.inactiveProducts, 1);
  assert.ok(hasReason(result, "ACTIVE_COUNT_MISMATCH"));
  const inAnother = products();
  inAnother[0].familyId = "private-other-family";
  assert.equal(reconcileProductFamilyPlan(fixture(), inAnother, []).report.variants[0].state, "PRODUCT_ALREADY_IN_OTHER_FAMILY");
});

test("family reconciliation leaves exactly compatible existing families unchanged", () => {
  const result = reconcileProductFamilyPlan(fixture(), products(), [existingFamily()]);
  assert.equal(result.report.families[0].state, "FAMILY_UNCHANGED");
  assert.equal(result.report.summary.familiesToCreate, 0);
  assert.equal(result.report.summary.familiesUnchanged, 1);
  assert.equal(result.report.summary.variantsToLink, 2);
  assert.equal(result.report.summary.conflicts, 0);
});

test("family reconciliation compares every family scalar, including defaults absent from plan", () => {
  const mismatches: Partial<CurrentFamily>[] = [
    { name: "Other" }, { brand: "Other" }, { category: "Other" }, { description: "Other" },
    { imageUrl: "https://private.example.test/secret-sentinel" }, { badge: "Other" },
    { featured: true }, { active: false }, { variantType: "Other" }, { alwaysShowAsFamily: true },
  ];
  for (const mismatch of mismatches) {
    const result = reconcileProductFamilyPlan(fixture(), linkedProducts(), [{ ...existingFamily(), ...mismatch }]);
    assert.equal(result.report.families[0].state, "FAMILY_CONFLICT", JSON.stringify(Object.keys(mismatch)));
    assert.ok(hasReason(result, "INCOMPATIBLE_FAMILY_DATA"));
    assert.equal(result.variantsToLink.length, 0);
    assert.ok(!JSON.stringify(result.report).includes("secret-sentinel"));
  }
});

test("family reconciliation detects extra family members, extra products and extra families", () => {
  const memberRows = linkedProducts();
  memberRows[2].familyId = existingFamily().id;
  const memberResult = reconcileProductFamilyPlan(fixture(), memberRows, [existingFamily()]);
  assert.ok(hasReason(memberResult, "UNEXPECTED_FAMILY_MEMBER"));
  assert.equal(memberResult.report.individuals[0].state, "CONFLICT");
  const extraRows = products();
  extraRows.push({ ...extraRows[0], id: "private-extra", code: "secret-sentinel", slug: "private-extra" });
  assert.ok(hasReason(reconcileProductFamilyPlan(fixture(), extraRows, []), "UNEXPECTED_PRODUCT"));
  assert.ok(hasReason(reconcileProductFamilyPlan(fixture(), products(), [{ ...existingFamily(), slug: "private-extra" }]), "UNEXPECTED_FAMILY"));
});

test("family reconciliation reports label and sort conflicts without overwriting metadata", () => {
  const labels = linkedProducts();
  labels[0].variantLabel = "Wrong";
  assert.equal(reconcileProductFamilyPlan(fixture(), labels, [existingFamily()]).report.variants[0].state, "LABEL_CONFLICT");
  labels[0].variantLabel = null;
  assert.equal(reconcileProductFamilyPlan(fixture(), labels, [existingFamily()]).report.variants[0].state, "LABEL_CONFLICT");
  const sort = linkedProducts();
  sort[1].variantSortOrder = 0;
  assert.equal(reconcileProductFamilyPlan(fixture(), sort, [existingFamily()]).report.variants[1].state, "SORT_ORDER_CONFLICT");
  const unlinked = products();
  unlinked[0].variantLabel = "Wrong";
  unlinked[1].variantSortOrder = 9;
  const result = reconcileProductFamilyPlan(fixture(), unlinked, []);
  assert.equal(result.report.variants[0].state, "LABEL_CONFLICT");
  assert.equal(result.report.variants[1].state, "SORT_ORDER_CONFLICT");
});

test("family reconciliation requires every individual and inactive reference with exact status", () => {
  for (const referenceIndex of [2, 3]) {
    const missing = products().filter((_product, index) => index !== referenceIndex);
    const result = reconcileProductFamilyPlan(fixture(), missing, []);
    assert.equal(result.report.summary.unknownCodes, 1);
    assert.ok(hasReason(result, "PRODUCT_COUNT_MISMATCH"));
    const flipped = products();
    flipped[referenceIndex].active = !flipped[referenceIndex].active;
    assert.ok(hasReason(reconcileProductFamilyPlan(fixture(), flipped, []), referenceIndex === 2 ? "INACTIVE_PRODUCT" : "EXCLUDED_PRODUCT_IS_ACTIVE"));
    const linked = products();
    linked[referenceIndex].familyId = "not-allowed";
    assert.ok(hasReason(reconcileProductFamilyPlan(fixture(), linked, []), "PRODUCT_ALREADY_IN_OTHER_FAMILY"));
  }
});

test("family reconciliation verifies identity and ungrouped metadata without modifying protected fields", () => {
  const identity = products();
  identity[0].name = "Drifted";
  identity[1].slug = "drifted";
  identity[2].variantLabel = "unexpected";
  const result = reconcileProductFamilyPlan(fixture(), identity, []);
  assert.ok(hasReason(result, "PRODUCT_NAME_MISMATCH"));
  assert.ok(hasReason(result, "SLUG_CONFLICT"));
  assert.ok(hasReason(result, "UNEXPECTED_VARIANT_METADATA"));
  const rows = products().map((product) => Object.freeze({
    ...product, price: 11, oldPrice: 12, costPrice: 1, stock: 50, reservedStock: 2, minStock: 5,
    imageUrl: "https://private.example.test/image", images: [{ id: "image" }], WebsiteContent: { secret: "secret-sentinel" },
    brand: "Original", category: "Original", description: "Original", updatedAt: new Date("2026-01-01"),
  }));
  const before = JSON.stringify(rows);
  reconcileProductFamilyPlan(fixture(), Object.freeze(rows), Object.freeze([]));
  assert.equal(JSON.stringify(rows), before);
});

test("family reconciliation is idempotent after one simulated complete application", () => {
  const plan = fixture();
  const initial = products();
  const first = reconcileProductFamilyPlan(plan, initial, []);
  const families = first.familiesToCreate.map((family, index) => ({ id: `created-${index}`, ...family }));
  const after = initial.map((product) => {
    const link = first.variantsToLink.find((link) => link.productId === product.id);
    return link ? {
      ...product, familyId: families.find((family) => family.slug === link.familySlug).id,
      variantLabel: link.variantLabel, variantSortOrder: link.variantSortOrder,
    } : product;
  });
  const second = reconcileProductFamilyPlan(plan, after, families);
  assert.equal(second.report.summary.conflicts, 0);
  assert.equal(second.report.summary.familiesUnchanged, 1);
  assert.equal(second.report.summary.variantsUnchanged, 2);
  assert.equal(second.report.summary.writesPlanned, 0);
  assert.deepEqual(second.familiesToCreate, []);
  assert.deepEqual(second.variantsToLink, []);
});

test("family reconciliation report omits all database IDs, private values and secrets", () => {
  const rows = linkedProducts();
  rows[0].variantLabel = "secret-label-sentinel";
  rows[1].name = "secret-name-sentinel";
  rows.push({ ...rows[2], id: "secret-id-sentinel", code: "secret-code-sentinel", slug: "secret-slug-sentinel" });
  const result = reconcileProductFamilyPlan(fixture(), rows, [{ ...existingFamily(), imageUrl: "https://private.example.test/secret-url-sentinel" }]);
  const report = JSON.stringify(result.report);
  for (const forbidden of ["secret-", "private-product", "private-family", "https://"]) assert.ok(!report.includes(forbidden));
  assert.ok(result.report.summary.conflicts > 0);
});
