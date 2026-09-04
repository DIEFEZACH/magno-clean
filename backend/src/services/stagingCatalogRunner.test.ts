import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CatalogProduct } from "./stagingCatalog/types";
import { PRODUCT_FIELDS } from "./stagingCatalog/types";
import { executeCatalog, previewCatalog, productCreateData, productUpdateData, type StagingWriter } from "./stagingCatalog/applyRunner";
import { APPLY_CONFIRMATION, STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "./stagingCatalog/config";
import { readOnlyProductCatalog, PRODUCT_READ_SQL } from "./stagingCatalog/readCatalog";
import { safeCatalogError } from "./stagingCatalog/safeError";
import { ensurePrivateDirectory, writePrivateFile, readPrivateSnapshot, readChecksumFile } from "./stagingCatalog/privateFiles";

function product(code = "QA1"): CatalogProduct {
  return { code, slug: code.toLowerCase(), brand: "QA", name: "Fixture", category: "Prueba", description: "1 L", imageUrl: null, badge: null, price: 1, oldPrice: null, digitalPrice: 1, retailPrice: 2, featured: false, active: true };
}
const gate = { environment: "staging", projectRef: STAGING_PROJECT_REF, mode: "execute" as const, confirm: APPLY_CONFIRMATION };

function memoryWriter(initial: Record<string, unknown>[]) {
  let rows = structuredClone(initial);
  let transactionCount = 0;
  let mutations = 0;
  const writer: StagingWriter = {
    async serializable(work) {
      transactionCount++;
      const pending = structuredClone(rows);
      const result = await work({
        readProducts: async () => pending.map(row => Object.fromEntries(PRODUCT_FIELDS.map(field => [field, row[field]])) as CatalogProduct),
        upsertProduct: async (code, create, update) => {
          mutations++;
          const existing = pending.find(row => row.code === code);
          if (existing) Object.assign(existing, update);
          else pending.push({ id: "new-cuid-from-staging", minStock: 5, variantSortOrder: 0, costPrice: 0, unitPrice: 0, wholesalePrice: 0, ...create });
        },
      });
      rows = pending;
      return result;
    },
  };
  return { writer, rows: () => rows, transactionCount: () => transactionCount, mutations: () => mutations };
}

test("dry-run can only read; reports CREATE with zero writes", async () => {
  let reads = 0;
  const result = await previewCatalog([product()], async () => { reads++; return []; }, { ...gate, mode: "dry-run" });
  assert.equal(reads, 1);
  assert.equal(result.plan.summary.CREATE, 1);
  assert.equal(result.writeOperations, 0);
});

test("execute requires full confirmation and rejects production before opening transaction", async () => {
  const memory = memoryWriter([]);
  for (const bad of [{ ...gate, confirm: undefined }, { ...gate, projectRef: PRODUCTION_PROJECT_REF }, { ...gate, environment: "production" }, { ...gate, mode: "dry-run" as const }]) {
    await assert.rejects(executeCatalog([product()], memory.writer, bad));
  }
  assert.equal(memory.transactionCount(), 0);
  assert.equal(memory.mutations(), 0);
});

test("create uses new IDs/defaults, zero stock and no relations; rerun UNCHANGED writes nothing", async () => {
  const memory = memoryWriter([]);
  const first = await executeCatalog([product()], memory.writer, gate);
  assert.equal(first.writeOperations, 1);
  assert.equal(first.plan.summary.CREATE, 1);
  const saved = memory.rows()[0];
  assert.equal(saved.stock, 0);
  assert.equal(saved.reservedStock, 0);
  assert.equal(saved.minStock, 5);
  assert.equal(saved.familyId, null);
  assert.equal(saved.costPrice, 0);
  assert.equal(saved.id, "new-cuid-from-staging");
  const second = await executeCatalog([product()], memory.writer, gate);
  assert.equal(second.plan.summary.UNCHANGED, 1);
  assert.equal(second.writeOperations, 0);
  assert.equal(memory.mutations(), 1);
});

test("UPDATE preserves stock, reservation, family, labels, images, editorial and internal prices", async () => {
  const protectedValues = { id: "staging-owned", stock: 23, reservedStock: 4, minStock: 11, familyId: "family-staging", variantLabel: "1 L", variantSortOrder: 7, images: [{ id: "image-staging" }], websiteContent: { publishedRevisionId: "published-staging" }, inventoryReservations: [{ id: "reserved" }], costPrice: 6, unitPrice: 7, wholesalePrice: 8, createdAt: "existing" };
  const memory = memoryWriter([{ ...product(), ...protectedValues }]);
  const result = await executeCatalog([{ ...product(), name: "Nombre actualizado", active: false }], memory.writer, gate);
  assert.equal(result.plan.summary.UPDATE, 1);
  assert.deepEqual(result.plan.entries[0].changedFields, ["name", "active"]);
  for (const [key, value] of Object.entries(protectedValues)) assert.deepEqual(memory.rows()[0][key], value, key);
  assert.equal(memory.rows()[0].name, "Nombre actualizado");
  assert.equal(memory.rows()[0].active, false);
});

test("payload projection never spreads unauthorized fields even if supplied at runtime", () => {
  const row = { ...product(), id: "forbidden", stock: 100, familyId: "forbidden", websiteContent: { secret: "private" }, costPrice: 300 };
  assert.deepEqual(Object.keys(productUpdateData(row)), PRODUCT_FIELDS.filter(field => field !== "code"));
  const create = productCreateData(row);
  assert.equal(create.stock, 0);
  assert.equal(create.familyId, null);
  for (const forbidden of ["id", "websiteContent", "costPrice"]) assert.equal(forbidden in create, false);
});

test("execute revalidates current target and refuses extras / slug conflicts without writes", async () => {
  for (const current of [[product("EXTRA")], [{ ...product("OTHER"), slug: "qa1" }]]) {
    const memory = memoryWriter(current);
    await assert.rejects(executeCatalog([product()], memory.writer, gate), /HUMAN_REVIEW/);
    assert.equal(memory.mutations(), 0);
    assert.deepEqual(memory.rows(), current);
  }
});

test("export uses read-only startup + transaction, fixed Product select, rollback and no mutation statements", async () => {
  const calls: string[] = [];
  const result = await readOnlyProductCatalog({}, config => {
    assert.equal(config.options, "-c default_transaction_read_only=on");
    return {
      connect: async () => { calls.push("CONNECT"); },
      query: async text => { calls.push(text); return { rows: text.startsWith("SHOW") ? [{ transaction_read_only: "on" }] : text === PRODUCT_READ_SQL ? [product()] : [] }; },
      end: async () => { calls.push("END"); },
    };
  });
  assert.equal(result.length, 1);
  assert.deepEqual(calls, ["CONNECT", "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "SHOW transaction_read_only", PRODUCT_READ_SQL, "ROLLBACK", "END"]);
  assert.doesNotMatch(PRODUCT_READ_SQL, /\*|id"|stock|PriceInternal|costPrice|unitPrice|wholesalePrice|JOIN/);
  assert.doesNotMatch(calls.join(" "), /INSERT|UPDATE|DELETE|COMMIT|CREATE/);
});

test("read-only check failure prevents catalog query and always closes connection", async () => {
  const calls: string[] = [];
  await assert.rejects(readOnlyProductCatalog({}, () => ({
    connect: async () => undefined,
    query: async text => { calls.push(text); return { rows: [{ transaction_read_only: "off" }] }; },
    end: async () => { calls.push("END"); },
  })), /READ_ONLY_REQUIRED/);
  assert.equal(calls.includes(PRODUCT_READ_SQL), false);
  assert.deepEqual(calls.slice(-2), ["ROLLBACK", "END"]);
});

test("safe errors never include raw connection, password, token, path or stack", () => {
  const secret = "postgresql://user:should-not-be-logged@untrusted.invalid/database";
  assert.equal(safeCatalogError(new Error(secret)), "CATALOG_VALIDATION_OR_OPERATION_FAILED");
  assert.equal(safeCatalogError(Object.assign(new Error(secret), { code: "28P01" })), "DATABASE_AUTHENTICATION_FAILED");
  assert.equal(safeCatalogError(new Error("Conteo count inesperado: esperado 98, observado 99.")), "Conteo count inesperado: esperado 98, observado 99.");
});

test("private files use 0700/0600, no overwrite, bounded reads and no symlinks", () => {
  // macOS exposes /var through a symlink; use its canonical temp path, not a bypass.
  const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "magno-catalog-unit-"));
  try {
    const cwd = path.join(temporary, "backend");
    fs.mkdirSync(cwd);
    const directory = ensurePrivateDirectory(path.join(temporary, ".local/staging-baseline"), cwd);
    const file = path.join(directory, "fixture.json");
    writePrivateFile(file, "{}\n");
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(readPrivateSnapshot(file).toString(), "{}\n");
    assert.throws(() => writePrivateFile(file, "overwrite"));
    assert.throws(() => ensurePrivateDirectory(path.join(temporary, "other"), cwd));
    const link = path.join(directory, "link.json"); fs.symlinkSync(file, link);
    assert.throws(() => readPrivateSnapshot(link));
    const checksum = path.join(directory, "fixture.sha256");
    writePrivateFile(checksum, `${"a".repeat(64)}  fixture.json\n`);
    assert.equal(readChecksumFile(checksum, file), "a".repeat(64));
    assert.throws(() => readChecksumFile(checksum, path.join(directory, "different.json")));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
