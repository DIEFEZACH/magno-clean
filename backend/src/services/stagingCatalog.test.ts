import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalogPlan } from "./stagingCatalog/plan";
import { sanitizeProductRows, serializeSnapshot, sha256, validateCatalogProduct, validateSnapshot, verifySnapshotBytes } from "./stagingCatalog/snapshot";
import { PRODUCT_FIELDS, PRODUCT_SELECT, type CatalogProduct, type CatalogSnapshot } from "./stagingCatalog/types";

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    slug: "producto-qa-1-l", code: "QA1", brand: "Marca QA", name: "Producto QA", category: "QA",
    description: "1 LT", imageUrl: null, badge: null, price: 10, oldPrice: null,
    digitalPrice: 10, retailPrice: 12, featured: false, active: true, ...overrides,
  };
}

function snapshot(products = [product()]): CatalogSnapshot {
  return {
    schemaVersion: 1, exportedAt: "2026-09-04T00:00:00.000Z",
    source: { environment: "production", projectRef: "fxbgxjpgfkeuapbmgpmv" }, products,
  };
}

test("catalog baseline production SELECT contains exactly the 14 authorized fields", () => {
  assert.equal(PRODUCT_FIELDS.length, 14);
  assert.deepEqual(Object.keys(PRODUCT_SELECT), [...PRODUCT_FIELDS]);
  assert.ok(Object.values(PRODUCT_SELECT).every((value) => value === true));
});

test("catalog baseline export projection excludes IDs, internal prices, stock and relations", () => {
  const rows = sanitizeProductRows([{
    ...product(), id: "not-exportable", costPrice: 7, unitPrice: 8, wholesalePrice: 9,
    stock: 99, reservedStock: 10, minStock: 3, familyId: "family", variantLabel: "1 L", variantSortOrder: 1,
    createdAt: new Date(), updatedAt: new Date(), ProductImage: [{ id: "image" }],
    WebsiteContent: { source: "internal" }, InventoryMovement: [{ id: "movement" }],
  }]);
  assert.deepEqual(rows, [product()]);
  assert.deepEqual(Object.keys(rows[0]), [...PRODUCT_FIELDS]);
});

test("catalog baseline validates generic expectations without hardcoded catalog cardinality", () => {
  const value = snapshot([product(), product({ code: "QA2", slug: "producto-qa-2", active: false })]);
  assert.equal(validateSnapshot(value, { count: 2, active: 1, inactive: 1 }).products.length, 2);
  assert.equal(validateSnapshot(snapshot([]), { count: 0, active: 0, inactive: 0 }).products.length, 0);
  assert.throws(() => validateSnapshot(value, { count: 98 }), /Conteo count inesperado/);
  assert.throws(() => validateSnapshot(value, { active: 2 }), /Conteo active inesperado/);
  assert.throws(() => validateSnapshot(value, { inactive: 0 }), /Conteo inactive inesperado/);
  assert.throws(() => validateSnapshot(value, { count: -1 }), /Expectativas/);
});

test("catalog baseline snapshot rejects duplicate code and slug without including their values", () => {
  assert.throws(() => validateSnapshot(snapshot([product(), product({ slug: "second" })])), /^CatalogValidationError: Snapshot inválido: code duplicado\.$/);
  assert.throws(() => validateSnapshot(snapshot([product(), product({ code: "OTHER" })])), /slug duplicado/);
});

test("catalog baseline snapshot rejects arbitrary keys at every level and wrong source", () => {
  const value = snapshot();
  assert.throws(() => validateSnapshot({ ...value, environment: "staging" }));
  assert.throws(() => validateSnapshot({ ...value, source: { ...value.source, databaseUrl: "forbidden" } }));
  assert.throws(() => validateSnapshot({ ...value, source: { environment: "production", projectRef: "heqneuhptatgybddoply" } }));
  assert.throws(() => validateSnapshot({ ...value, source: { ...value.source, environment: "staging" } }));
  for (const field of ["id", "costPrice", "stock", "familyId", "WebsiteContent", "updatedAt"]) {
    assert.throws(() => validateSnapshot({ ...value, products: [{ ...product(), [field]: "not-allowed" }] }));
  }
});

test("catalog baseline preserves values and rejects missing/invalid required fields", () => {
  assert.equal(validateCatalogProduct(product({ code: "qa_1" })).code, "qa_1");
  assert.equal(validateCatalogProduct(product({ badge: "" })).badge, "");
  for (const field of ["code", "slug", "name", "brand", "category", "description"] as const) {
    assert.throws(() => validateCatalogProduct({ ...product(), [field]: "" }));
    const value: Partial<CatalogProduct> = { ...product() };
    delete value[field];
    assert.throws(() => validateCatalogProduct(value));
  }
  assert.throws(() => validateCatalogProduct(product({ code: " QA1 " })));
  assert.throws(() => validateCatalogProduct(product({ slug: "Invalid Slug" })));
  assert.throws(() => validateCatalogProduct({ ...product(), active: "true" }));
  assert.throws(() => validateCatalogProduct({ ...product(), featured: 1 }));
});

test("catalog baseline price validation is finite, nonnegative, not coercive", () => {
  for (const field of ["price", "oldPrice", "digitalPrice", "retailPrice"] as const) {
    for (const value of [-1, NaN, Infinity, -Infinity, "10"]) {
      assert.throws(() => validateCatalogProduct({ ...product(), [field]: value }));
    }
    assert.equal(validateCatalogProduct({ ...product(), [field]: 10.25 })[field], 10.25);
  }
  assert.equal(validateCatalogProduct(product({ oldPrice: null })).oldPrice, null);
  for (const field of ["price", "digitalPrice", "retailPrice"]) {
    assert.throws(() => validateCatalogProduct({ ...product(), [field]: null }));
  }
});

test("catalog baseline accepts only public unsigned HTTPS Cloudinary image URLs or null", () => {
  const allowed = "https://res.cloudinary.com/test-cloud/image/upload/v123/product.webp";
  assert.equal(validateCatalogProduct(product({ imageUrl: allowed })).imageUrl, allowed);
  assert.equal(validateCatalogProduct(product()).imageUrl, null);
  for (const value of [
    "", "http://res.cloudinary.com/cloud/image/upload/a.webp",
    "https://user:pass@res.cloudinary.com/cloud/image/upload/a.webp",
    "https://res.cloudinary.com/cloud/image/private/a.webp",
    "https://res.cloudinary.com/cloud/image/authenticated/a.webp",
    "https://res.cloudinary.com/cloud/image/upload/s--signature--/a.webp",
    "https://res.cloudinary.com/cloud/image/upload/a.webp?token=hidden",
    "https://res.cloudinary.com.attacker.example/cloud/image/upload/a.webp",
    "https://other.example/product.webp", "https://project.supabase.co/storage/v1/object/public/b/a.webp",
    "https://res.cloudinary.com:444/cloud/image/upload/a.webp",
  ]) assert.throws(() => validateCatalogProduct(product({ imageUrl: value })));
});

test("catalog baseline rejects recognizable secret/PII patterns with sanitized diagnostics", () => {
  for (const value of [
    "customer@example.test", "password=do-not-log-this", "Bearer never-print-this-token",
    "https://user:password@example.test/asset", "tel 55 1234 5678", "5512345678",
    "postgresql://account:password@host/database", "JWT_ACCESS_SECRET=not-for-logs",
    "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiMSJ9.signature",
  ]) {
    try {
      sanitizeProductRows([product({ description: value })]);
      assert.fail("Expected rejection");
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(value));
      assert.match(error.message, /Fila Product 1 inválida/);
    }
  }
});

test("catalog baseline checksum covers exact bytes including trailing newline", () => {
  const encoded = serializeSnapshot(snapshot());
  assert.ok(encoded.endsWith("\n"));
  assert.deepEqual(verifySnapshotBytes(Buffer.from(encoded), sha256(encoded)), snapshot());
  assert.deepEqual(verifySnapshotBytes(Buffer.from(encoded), sha256(encoded).toUpperCase()), snapshot());
  assert.throws(() => verifySnapshotBytes(Buffer.from(encoded.trimEnd()), sha256(encoded)), /no coincide/);
  assert.throws(() => verifySnapshotBytes(Buffer.from(encoded), "bad"), /Checksum/);
  assert.throws(() => verifySnapshotBytes(Buffer.from(encoded), "0".repeat(64)), /no coincide/);
});

test("catalog baseline checksum verification still rejects malformed JSON/UTF-8/schema", () => {
  for (const bytes of [Buffer.from("not JSON"), Buffer.from([0xff]), Buffer.from("{}")]) {
    assert.throws(() => verifySnapshotBytes(bytes, sha256(bytes)));
  }
});

test("catalog baseline plan CREATE has no mutation and preserves input", () => {
  const value = product();
  const before = JSON.stringify(value);
  const plan = buildCatalogPlan([value], []);
  assert.deepEqual(plan.entries, [{ code: "QA1", status: "CREATE" }]);
  assert.equal(plan.summary.CREATE, 1);
  assert.equal(plan.summary.active, 1);
  assert.equal(plan.summary.stagingTotal, 0);
  assert.equal(plan.canExecute, true);
  assert.equal(JSON.stringify(value), before);
});

test("catalog baseline plan UPDATE lists only authorized changed fields excluding code", () => {
  const current = product();
  const next = product({ name: "Nuevo nombre", price: 20, oldPrice: 25, active: false });
  const plan = buildCatalogPlan([next], [current]);
  assert.equal(plan.entries[0].status, "UPDATE");
  assert.deepEqual(plan.entries[0].changedFields, ["name", "price", "oldPrice", "active"]);
  assert.equal(plan.canExecute, true);
  assert.deepEqual(current, product());
});

test("catalog baseline rerun UNCHANGED needs no writes", () => {
  const plan = buildCatalogPlan([product()], [product()]);
  assert.deepEqual(plan.entries, [{ code: "QA1", status: "UNCHANGED" }]);
  assert.equal(plan.summary.UNCHANGED, 1);
  assert.equal(plan.summary.CREATE + plan.summary.UPDATE, 0);
});

test("catalog baseline EXTRA_IN_STAGING is retained and blocks execution", () => {
  const extra = product({ code: "EXTRA", slug: "extra" });
  const plan = buildCatalogPlan([product()], [product(), extra]);
  assert.equal(plan.summary.EXTRA_IN_STAGING, 1);
  assert.equal(plan.summary.UNCHANGED, 1);
  assert.equal(plan.canExecute, false);
  assert.deepEqual(extra, product({ code: "EXTRA", slug: "extra" }));
});

test("catalog baseline duplicates in snapshot or staging produce CONFLICT_CODE", () => {
  assert.equal(buildCatalogPlan([product(), product({ slug: "second" })], []).summary.CONFLICT_CODE, 2);
  assert.equal(buildCatalogPlan([product()], [product(), product({ slug: "second" })]).summary.CONFLICT_CODE, 1);
  const extra = product({ code: "EXTRA", slug: "extra" });
  const plan = buildCatalogPlan([], [extra, { ...extra, slug: "extra-second" }]);
  assert.equal(plan.summary.CONFLICT_CODE, 2);
  assert.equal(plan.canExecute, false);
});

test("catalog baseline slug conflict blocks creates and updates, including slug swaps", () => {
  assert.equal(buildCatalogPlan([product(), product({ code: "OTHER" })], []).summary.CONFLICT_SLUG, 2);
  const other = product({ code: "OTHER" });
  const createConflict = buildCatalogPlan([product()], [other]);
  assert.equal(createConflict.summary.CONFLICT_SLUG, 1);
  assert.equal(createConflict.canExecute, false);
  const existing = product({ slug: "previous" });
  assert.equal(buildCatalogPlan([product()], [existing, other]).summary.CONFLICT_SLUG, 1);
  assert.equal(buildCatalogPlan([product(), product({ code: "OTHER", slug: "previous" })], [existing, other]).summary.CONFLICT_SLUG, 2);
});

test("catalog baseline invalid records receive terminal INVALID without leaking raw data", () => {
  const sensitive = { ...product(), code: "private@example.test", description: "password=hidden" } as CatalogProduct;
  const plan = buildCatalogPlan([sensitive], []);
  assert.equal(plan.summary.INVALID, 1);
  assert.equal(plan.canExecute, false);
  assert.ok(!JSON.stringify(plan).includes("private@example.test"));
  assert.ok(!JSON.stringify(plan).includes("hidden"));
  assert.equal(buildCatalogPlan([product()], [{ ...product(), price: -1 }]).summary.INVALID, 1);
  assert.equal(buildCatalogPlan([], [sensitive]).summary.INVALID, 1);
});

test("catalog baseline internal state is excluded before comparing, and never in changedFields", () => {
  const current = { ...product(), stock: 12, reservedStock: 2, minStock: 3, familyId: "local-family", variantLabel: "1 L", WebsiteContent: { id: "editorial" } };
  const projected = sanitizeProductRows([current]);
  const plan = buildCatalogPlan([product({ name: "Updated" })], projected);
  assert.deepEqual(plan.entries[0].changedFields, ["name"]);
  assert.equal(current.stock, 12);
  assert.equal(current.reservedStock, 2);
  assert.equal(current.familyId, "local-family");
  assert.equal(current.variantLabel, "1 L");
  assert.deepEqual(current.WebsiteContent, { id: "editorial" });
});

test("catalog baseline summary counts active/inactive, images, and every terminal once", () => {
  const first = product({ imageUrl: "https://res.cloudinary.com/cloud/image/upload/a.webp" });
  const second = product({ code: "SECOND", slug: "second", active: false });
  const extra = product({ code: "EXTRA", slug: "extra" });
  const plan = buildCatalogPlan([first, second], [first, extra]);
  assert.equal(plan.summary.snapshotTotal, 2);
  assert.equal(plan.summary.stagingTotal, 2);
  assert.equal(plan.summary.active, 1);
  assert.equal(plan.summary.inactive, 1);
  assert.equal(plan.summary.imageUrlsPresent, 1);
  assert.equal(plan.summary.CREATE, 1);
  assert.equal(plan.summary.UNCHANGED, 1);
  assert.equal(plan.summary.EXTRA_IN_STAGING, 1);
  assert.equal(plan.entries.length, 3);
});
