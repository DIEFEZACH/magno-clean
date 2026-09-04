import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { validateProductFamilyPlan, type CurrentFamily, type CurrentProduct } from "./productFamilyPlan/plan";
import { executeProductFamilies, previewProductFamilies, type FamilyPlanWriter } from "./productFamilyPlan/runner";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF, STAGING_CONFIRMATION, PRODUCTION_CONFIRMATION } from "./productFamilyPlan/config";
import { readOnlyFamilyPlanState, FAMILY_SCHEMA_SQL, FAMILY_READ_SQL, PRODUCT_READ_SQL, LEGACY_PRODUCT_READ_SQL } from "./productFamilyPlan/readState";
import { safeFamilyPlanError } from "./productFamilyPlan/safeError";

const checksum = "686cec7028b355fcc171fad41d2881af4442c9cea68f3a13b576c957bcea0710";
const canonicalPlan = () => validateProductFamilyPlan(
  readFileSync(path.resolve(__dirname, "../../../docs/product-data/product-family-plan.json")), checksum,
  { families: 25, variants: 79, individuals: 16 },
);
const gate = { environment: "staging" as const, projectRef: STAGING_PROJECT_REF, mode: "execute" as const, confirm: STAGING_CONFIRMATION };
type Product = CurrentProduct & Record<string, unknown>;
function products(): Product[] {
  const plan = canonicalPlan();
  return [
    ...plan.families.flatMap(f => f.variants.map(v => ({ code: v.code, slug: v.productSlug, name: f.familyName, active: true }))),
    ...plan.individuals.map(p => ({ ...p, active: true })), ...plan.inactive.map(p => ({ ...p, active: false })),
  ].map((p, i) => ({ ...p, id: `test-product-${i}`, familyId: null, variantLabel: null, variantSortOrder: 0,
    brand: "Fixture", category: "Fixture", description: "Existing description", imageUrl: null,
    badge: "Unchanged", featured: false, price: 14, oldPrice: 15, costPrice: 1, unitPrice: 2,
    wholesalePrice: 3, retailPrice: 4, digitalPrice: 5, stock: 11, reservedStock: 2, minStock: 6,
    images: [{ id: "existing-image" }], websiteContent: { id: "existing-editorial" },
    orders: [], payments: [], inventoryReservations: [], inventoryMovements: [],
    createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z"),
  }));
}
function memory(options: { failLink?: number; alterProtected?: boolean; finalDrift?: boolean; startingProducts?: Product[] } = {}) {
  let rows = options.startingProducts ?? products();
  let families: CurrentFamily[] = [];
  let transactions = 0; let mutations = 0;
  const payloads: string[][] = [];
  const writer: FamilyPlanWriter = { async serializable(work) {
    transactions++;
    const pending = structuredClone(rows); const pendingFamilies = structuredClone(families);
    let reads = 0; let links = 0;
    const result = await work({
      readProducts: async () => {
        reads++;
        if (reads === 2 && options.finalDrift) pending[0].variantLabel = "unexpected";
        return structuredClone(pending).sort((a, b) => a.code.localeCompare(b.code));
      },
      readFamilies: async () => structuredClone(pendingFamilies),
      createFamily: async data => {
        mutations++; const row = { id: `test-family-${pendingFamilies.length}`, ...data };
        pendingFamilies.push(row); return { id: row.id, slug: row.slug };
      },
      linkVariant: async (id, data) => {
        links++; mutations++; payloads.push(Object.keys(data).sort());
        if (links === options.failLink) throw new Error("injected database fault");
        const row = pending.find(p => p.id === id)!;
        assert.equal(row.familyId, null);
        Object.assign(row, data, { updatedAt: new Date("2026-02-01T00:00:00Z") });
        if (options.alterProtected) row.price = 999;
      },
    });
    rows = pending; families = pendingFamilies; return result;
  } };
  return { writer, rows: () => structuredClone(rows), families: () => structuredClone(families),
    transactions: () => transactions, mutations: () => mutations, payloads };
}

test("canonical bytes/counts are pinned and dry-run has no writer", async () => {
  const plan = canonicalPlan(); const rows = products(); const before = structuredClone(rows);
  const result = await previewProductFamilies(plan, async () => ({ products: rows, families: [], schema: "CURRENT" }),
    { ...gate, mode: "dry-run", confirm: undefined });
  assert.equal(result.report.summary.familiesToCreate, 25);
  assert.equal(result.report.summary.variantsToLink, 79);
  assert.equal(result.report.summary.individuals, 16);
  assert.equal(result.report.summary.conflicts, 0);
  assert.equal(result.writeOperations, 0); assert.deepEqual(rows, before);
});

test("execute: 25/79 atomic links, all protected fields preserved, rerun zero writes", async () => {
  const store = memory(); const before = store.rows();
  const result = await executeProductFamilies(canonicalPlan(), store.writer, gate);
  assert.equal(result.familiesCreated, 25); assert.equal(result.variantsLinked, 79);
  assert.equal(result.writeOperations, 104); assert.equal(store.transactions(), 1);
  assert.equal(result.report.summary.writesPerformed, 104);
  for (const p of store.rows()) {
    const old = before.find(x => x.id === p.id)!;
    for (const key of Object.keys(old).filter(k => !["familyId", "variantLabel", "variantSortOrder", "updatedAt"].includes(k))) {
      assert.deepEqual(p[key], old[key], key);
    }
  }
  assert.ok(store.payloads.every(keys => JSON.stringify(keys) === JSON.stringify(["familyId", "variantLabel", "variantSortOrder"])));
  const afterFirst = store.rows();
  const second = await executeProductFamilies(canonicalPlan(), store.writer, gate);
  assert.equal(second.writeOperations, 0); assert.equal(store.mutations(), 104);
  assert.equal(second.report.summary.writesPerformed, 0);
  assert.equal(second.report.summary.familiesUnchanged, 25); assert.equal(second.report.summary.variantsUnchanged, 79);
  assert.deepEqual(store.rows(), afterFirst);
});

test("confirmation/environment required before any transaction; tokens are not interchangeable", async () => {
  const store = memory();
  for (const bad of [
    { ...gate, confirm: undefined }, { ...gate, confirm: PRODUCTION_CONFIRMATION },
    { ...gate, projectRef: PRODUCTION_PROJECT_REF }, { ...gate, mode: "dry-run" as const },
    { ...gate, preMigration: true },
    { ...gate, environment: "production" as const, projectRef: PRODUCTION_PROJECT_REF },
  ]) await assert.rejects(executeProductFamilies(canonicalPlan(), store.writer, bad));
  assert.equal(store.transactions(), 0); assert.equal(store.mutations(), 0);
});

test("conflict after preview is rechecked within execute and rolls back before writes", async () => {
  const rows = products(); rows[0].active = false;
  const store = memory({ startingProducts: rows });
  await assert.rejects(executeProductFamilies(canonicalPlan(), store.writer, gate), /CONFLICTS_ABORTED/);
  assert.equal(store.mutations(), 0); assert.deepEqual(store.rows(), rows); assert.deepEqual(store.families(), []);
});

test("failure midway rolls back created families and all already-linked variants", async () => {
  const store = memory({ failLink: 40 }); const before = store.rows();
  await assert.rejects(executeProductFamilies(canonicalPlan(), store.writer, gate));
  assert.equal(store.transactions(), 1); assert.equal(store.mutations(), 65);
  assert.deepEqual(store.rows(), before); assert.deepEqual(store.families(), []);
});

test("protected field or final link drift detected before commit rolls back everything", async () => {
  for (const option of [{ alterProtected: true }, { finalDrift: true }]) {
    const store = memory(option); const before = store.rows();
    await assert.rejects(executeProductFamilies(canonicalPlan(), store.writer, gate), /ABORTED/);
    assert.deepEqual(store.rows(), before); assert.deepEqual(store.families(), []);
  }
});

test("readonly connection and transaction never query missing family schema", async () => {
  for (const legacy of [true, false]) {
    const calls: string[] = [];
    const result = await readOnlyFamilyPlanState({}, legacy, config => {
      assert.equal(config.options, "-c default_transaction_read_only=on");
      return { connect: async () => undefined, end: async () => { calls.push("END"); },
        query: async sql => {
          calls.push(sql);
          const rows = sql.startsWith("SHOW") ? [{ transaction_read_only: "on" }] :
            sql === FAMILY_SCHEMA_SQL ? [{ familyTable: !legacy, associationColumns: legacy ? 0 : 3 }] : [];
          return { rows };
        },
      };
    });
    assert.equal(result.schema, legacy ? "PRE_MIGRATION" : "CURRENT");
    assert.equal(calls.includes(FAMILY_READ_SQL), !legacy);
    assert.equal(calls.includes(LEGACY_PRODUCT_READ_SQL), legacy);
    assert.equal(calls.includes(PRODUCT_READ_SQL), !legacy);
    assert.deepEqual(calls.slice(-2), ["ROLLBACK", "END"]);
    assert.doesNotMatch(calls.join(" "), /\b(?:INSERT|UPDATE|DELETE|COMMIT|CREATE|ALTER|DROP)\b/);
  }
});

test("readonly aborts on missing/partial schema or readonly guard, and closes session", async () => {
  for (const schema of [
    { familyTable: false, associationColumns: 0 }, { familyTable: false, associationColumns: 3 },
    { familyTable: true, associationColumns: 0 }, { familyTable: true, associationColumns: 2 },
  ]) {
    const calls: string[] = [];
    await assert.rejects(readOnlyFamilyPlanState({}, false, () => ({
      connect: async () => undefined, end: async () => { calls.push("END"); },
      query: async sql => { calls.push(sql); return { rows: sql.startsWith("SHOW") ? [{ transaction_read_only: "on" }] : [schema] }; },
    })));
    assert.equal(calls.includes(PRODUCT_READ_SQL), false);
    assert.equal(calls.includes(FAMILY_READ_SQL), false);
    assert.deepEqual(calls.slice(-2), ["ROLLBACK", "END"]);
  }
});

test("reports omit database IDs, protected fields and arbitrary unexpected row values", async () => {
  const rows = products(); rows[0].code = "postgresql://injected.invalid/private";
  const result = await previewProductFamilies(canonicalPlan(), async () => ({ products: rows, families: [], schema: "CURRENT" }),
    { ...gate, mode: "dry-run", confirm: undefined });
  const json = JSON.stringify(result);
  for (const privateValue of ["test-product-", "injected.invalid", "existing-image", "existing-editorial", "costPrice", "reservedStock"]) {
    assert.equal(json.includes(privateValue), false);
  }
  assert.equal(safeFamilyPlanError(new Error("postgresql://private:credential@unknown.invalid/db")), "FAMILY_PLAN_VALIDATION_OR_OPERATION_FAILED");
  assert.equal(safeFamilyPlanError(Object.assign(new Error("private"), { code: "28P01" })), "FAMILY_DATABASE_AUTHENTICATION_FAILED");
});

test("raw pg socket errors are consumed without printing driver data", async () => {
  let listener: (error: unknown) => void;
  const calls: string[] = [];
  await assert.rejects(readOnlyFamilyPlanState({}, true, () => ({
    on: (_event, handler) => { listener = handler; },
    connect: async () => undefined, end: async () => { calls.push("END"); },
    query: async sql => {
      calls.push(sql);
      if (sql === LEGACY_PRODUCT_READ_SQL) listener(new Error("private transport error"));
      return { rows: sql.startsWith("SHOW") ? [{ transaction_read_only: "on" }] :
        sql === FAMILY_SCHEMA_SQL ? [{ familyTable: false, associationColumns: 0 }] : [] };
    },
  })), /FAMILY_DATABASE_CONNECTION_FAILED/);
  assert.deepEqual(calls.slice(-2), ["ROLLBACK", "END"]);
});
