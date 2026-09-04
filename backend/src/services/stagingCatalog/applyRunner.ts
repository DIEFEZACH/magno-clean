import type { CatalogPlan, CatalogProduct } from "./types";
import { PRODUCT_FIELDS } from "./types";
import { buildCatalogPlan } from "./plan";
import { APPLY_CONFIRMATION, STAGING_PROJECT_REF } from "./config";

export type ApplyGate = {
  environment: string;
  projectRef: string;
  mode: "dry-run" | "execute";
  confirm?: string;
};

export interface StagingTransaction {
  readProducts(): Promise<CatalogProduct[]>;
  upsertProduct(code: string, create: Record<string, unknown>, update: Record<string, unknown>): Promise<unknown>;
}
export interface StagingWriter {
  serializable<T>(work: (transaction: StagingTransaction) => Promise<T>): Promise<T>;
}

export function assertApplyGate(gate: ApplyGate) {
  if (gate.environment !== "staging" || gate.projectRef !== STAGING_PROJECT_REF) throw new Error("STAGING_TARGET_REQUIRED");
  if (!["dry-run", "execute"].includes(gate.mode)) throw new Error("EXPLICIT_MODE_REQUIRED");
  if (gate.mode === "execute" && gate.confirm !== APPLY_CONFIRMATION) throw new Error("EXECUTION_CONFIRMATION_REQUIRED");
}

export function productCreateData(product: CatalogProduct) {
  return {
    ...Object.fromEntries(PRODUCT_FIELDS.map(field => [field, product[field]])),
    stock: 0,
    reservedStock: 0,
    familyId: null,
    variantLabel: null,
    // id, timestamps, minStock, variantSortOrder and internal prices use schema defaults.
  };
}

export function productUpdateData(product: CatalogProduct) {
  return Object.fromEntries(PRODUCT_FIELDS.filter(field => field !== "code").map(field => [field, product[field]]));
}

// Dry-run intentionally has no writer parameter: it cannot invoke a mutation adapter.
export async function previewCatalog(
  products: CatalogProduct[],
  read: () => Promise<CatalogProduct[]>,
  gate: ApplyGate,
) {
  assertApplyGate(gate);
  if (gate.mode !== "dry-run") throw new Error("DRY_RUN_REQUIRED");
  return { plan: buildCatalogPlan(products, await read()), writeOperations: 0 as const };
}

export async function executeCatalog(
  products: CatalogProduct[],
  writer: StagingWriter,
  gate: ApplyGate,
): Promise<{ plan: CatalogPlan; writeOperations: number }> {
  assertApplyGate(gate);
  if (gate.mode !== "execute") throw new Error("EXECUTE_REQUIRED");
  return writer.serializable(async transaction => {
    // Recompute under the transaction; never trust an earlier preview.
    const plan = buildCatalogPlan(products, await transaction.readProducts());
    if (!plan.canExecute) throw new Error("CATALOG_CONFLICTS_REQUIRE_HUMAN_REVIEW");
    let writeOperations = 0;
    const byCode = new Map(products.map(product => [product.code, product]));
    for (const entry of plan.entries) {
      if (entry.status !== "CREATE" && entry.status !== "UPDATE") continue;
      const product = byCode.get(entry.code)!;
      await transaction.upsertProduct(product.code, productCreateData(product), productUpdateData(product));
      writeOperations += 1;
    }
    return { plan, writeOperations };
  });
}
