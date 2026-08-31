import assert from "node:assert/strict";
import test from "node:test";
import { Role, type Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError";
import { authenticate, authorize } from "../middleware/auth";
import { adjustProductInventoryInTransaction } from "./inventory";
import {
  buildInventoryImportPreview,
  executeInventoryPreview,
  MAX_INVENTORY_IMPORT_BYTES,
  parseInventoryCsv,
  type InventoryCatalogProduct,
} from "./inventoryImport";

const catalog: InventoryCatalogProduct[] = [
  { id: "p1", code: "MC-001", name: "Producto 1", stock: 2, reservedStock: 0 },
  { id: "p2", code: "MC-002", name: "Producto 2", stock: 4, reservedStock: 1 },
];
const csv = (body: string) => Buffer.from(`code,newStock,reason\n${body}`, "utf8");

test("CSV válido y preview no realiza escrituras", () => {
  const preview = buildInventoryImportPreview(csv("MC-001,5,Conteo inicial\nMC-002,4,Conteo inicial\n"), catalog, true);
  assert.equal(preview.valid, true);
  assert.deepEqual(preview.summary, { rows: 2, adjusted: 1, unchanged: 1, errors: 0 });
  assert.equal(preview.results[0].previousStock, 2);
  assert.equal(preview.results[0].quantity, 3);
});

test("modo normal permite catálogo parcial y modo estricto exige cobertura total", () => {
  const file = csv("MC-001,5,Conteo inicial\n");
  assert.equal(buildInventoryImportPreview(file, catalog.filter((item) => item.code === "MC-001"), false).valid, true);
  const strict = buildInventoryImportPreview(file, catalog, true);
  assert.equal(strict.valid, false);
  assert.ok(strict.errors.some((error) => error.code === "MC-002" && error.message.includes("faltante")));
});

test("rechaza encabezado incorrecto", () => {
  assert.throws(() => parseInventoryCsv(Buffer.from("code,stock,reason\nMC-001,1,Conteo")), /Encabezados inválidos/);
});

test("rechaza columna extra", () => {
  const parsed = parseInventoryCsv(Buffer.from("code,newStock,reason\nMC-001,1,Conteo,extra"));
  assert.ok(parsed.errors.some((error) => error.message.includes("exactamente 3 columnas")));
});

test("rechaza código duplicado sin normalizar mayúsculas", () => {
  const parsed = parseInventoryCsv(csv("MC-001,1,Conteo\nMC-001,2,Conteo\nmc-001,3,Conteo\n"));
  assert.ok(parsed.errors.some((error) => error.message === "Código duplicado"));
  assert.ok(parsed.rows.some((row) => row.code === "mc-001"));
});

test("rechaza código inexistente", () => {
  const preview = buildInventoryImportPreview(csv("NO-EXISTE,1,Conteo\n"), catalog, false);
  assert.ok(preview.errors.some((error) => error.message === "Código inexistente"));
});

test("rechaza newStock negativo o decimal", () => {
  assert.equal(parseInventoryCsv(csv("MC-001,-1,Conteo\n")).rows.length, 0);
  assert.equal(parseInventoryCsv(csv("MC-001,1.5,Conteo\n")).rows.length, 0);
});

test("rechaza razón inválida", () => {
  assert.ok(parseInventoryCsv(csv("MC-001,1,no\n")).errors.some((error) => error.message.includes("reason")));
});

test("rechaza archivo demasiado grande", () => {
  assert.throws(() => parseInventoryCsv(Buffer.alloc(MAX_INVENTORY_IMPORT_BYTES + 1, 65)), (error) => error instanceof AppError && error.statusCode === 413);
});

function fakeTransaction(initialStock: number, reservedStock: number) {
  const state = { stock: initialStock, reservedStock, updates: 0, movements: [] as Array<Record<string, unknown>> };
  const tx = {
    $queryRaw: async () => [{ stock: state.stock, reservedStock: state.reservedStock }],
    product: { update: async ({ data }: { data: { stock: number } }) => { state.updates += 1; state.stock = data.stock; return { stock: state.stock, reservedStock: state.reservedStock }; } },
    inventoryMovement: { create: async ({ data }: { data: Record<string, unknown> }) => { state.movements.push(data); return { id: `m${state.movements.length}`, ...data }; } },
  } as unknown as Prisma.TransactionClient;
  return { tx, state };
}

test("newStock menor que reservedStock se rechaza", async () => {
  const { tx } = fakeTransaction(5, 3);
  await assert.rejects(adjustProductInventoryInTransaction(tx, { productId: "p1", newStock: 2, reason: "Conteo", createdById: "admin" }), /stock reservado/);
});

test("UNCHANGED no actualiza producto ni crea movimiento", async () => {
  const { tx, state } = fakeTransaction(5, 1);
  const result = await adjustProductInventoryInTransaction(tx, { productId: "p1", newStock: 5, reason: "Conteo", createdById: "admin" });
  assert.equal(result.changed, false);
  assert.equal(result.movement, null);
  assert.equal(state.updates, 0);
  assert.equal(state.movements.length, 0);
});

test("ADJUSTED crea exactamente un ADJUSTMENT con createdBy y saldos", async () => {
  const { tx, state } = fakeTransaction(2, 1);
  const result = await adjustProductInventoryInTransaction(tx, { productId: "p1", newStock: 7, reason: "Conteo", createdById: "admin-1" });
  assert.equal(result.changed, true);
  assert.equal(state.updates, 1);
  assert.equal(state.movements.length, 1);
  assert.deepEqual(state.movements[0], {
    productId: "p1", type: "ADJUSTMENT", quantity: 5, reason: "Conteo",
    createdById: "admin-1", stockAfter: 7, reservedStockAfter: 1,
  });
});

test("repetir el mismo ajuste termina en UNCHANGED sin movimiento adicional", async () => {
  const { tx, state } = fakeTransaction(2, 0);
  await adjustProductInventoryInTransaction(tx, { productId: "p1", newStock: 7, reason: "Conteo", createdById: "admin" });
  await adjustProductInventoryInTransaction(tx, { productId: "p1", newStock: 7, reason: "Conteo", createdById: "admin" });
  assert.equal(state.movements.length, 1);
});

test("execute usa el stock real del ajustador aunque cambie después del preview", async () => {
  const preview = buildInventoryImportPreview(csv("MC-001,5,Conteo\n"), [{ ...catalog[0], stock: 0 }], false);
  let receivedCreatedBy = "";
  const report = await executeInventoryPreview(preview as never, "admin-real", async (input) => {
    receivedCreatedBy = input.createdById;
    return { changed: true as const, previousStock: 2, product: { stock: 5, reservedStock: 0 }, movement: { id: "m1" } } as never;
  });
  assert.equal(receivedCreatedBy, "admin-real");
  assert.equal(report.results[0].previousStock, 2);
  assert.equal(report.results[0].quantity, 3);
});

test("sin JWT produce 401 y CUSTOMER produce 403", () => {
  let unauthenticated: unknown;
  authenticate({ headers: {} } as never, {} as never, (error) => { unauthenticated = error; });
  assert.equal((unauthenticated as AppError).statusCode, 401);

  let forbidden: unknown;
  authorize(Role.ADMIN)({ user: { id: "u1", email: "customer@example.com", role: Role.CUSTOMER } } as never, {} as never, (error) => { forbidden = error; });
  assert.equal((forbidden as AppError).statusCode, 403);
});
