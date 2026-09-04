import { createHash } from "node:crypto";
import {
  reconcileProductFamilyPlan, type ProductFamilyPlan, type CurrentProduct, type CurrentFamily,
  type FamilyCreateData, type VariantLink,
} from "./plan";
import {
  PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF, PRODUCTION_CONFIRMATION, STAGING_CONFIRMATION,
} from "./config";
import type { FamilyPlanState } from "./readState";

export type FamilyExecutionGate = {
  environment: "production" | "staging";
  projectRef: string;
  mode: "dry-run" | "execute";
  confirm?: string;
  preMigration?: boolean;
};
export function assertFamilyGate(gate: FamilyExecutionGate, mode: "dry-run" | "execute") {
  const expectedRef = gate.environment === "staging" ? STAGING_PROJECT_REF :
    gate.environment === "production" ? PRODUCTION_PROJECT_REF : null;
  const expectedToken = gate.environment === "staging" ? STAGING_CONFIRMATION : PRODUCTION_CONFIRMATION;
  if (!expectedRef || gate.projectRef !== expectedRef) throw new Error("FAMILY_TARGET_MISMATCH");
  if (gate.mode !== mode) throw new Error("FAMILY_MODE_MISMATCH");
  if (mode === "execute" && (gate.confirm !== expectedToken || gate.preMigration)) throw new Error("FAMILY_EXECUTION_CONFIRMATION_REQUIRED");
  if (mode === "dry-run" && gate.confirm !== undefined) throw new Error("FAMILY_DRY_RUN_CONFIRMATION_REJECTED");
}

export interface FamilyPlanTransaction {
  readProducts(): Promise<CurrentProduct[]>;
  readFamilies(): Promise<CurrentFamily[]>;
  createFamily(data: FamilyCreateData): Promise<{ id: string; slug: string }>;
  linkVariant(productId: string, data: { familyId: string; variantLabel: string; variantSortOrder: number }): Promise<unknown>;
}
export interface FamilyPlanWriter {
  serializable<T>(work: (transaction: FamilyPlanTransaction) => Promise<T>): Promise<T>;
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  }
  return value;
}
/** In-memory invariant only. Never log these values/digest or include them in the report. */
function protectedDigest(products: CurrentProduct[]) {
  const permitted = new Set(["familyId", "variantLabel", "variantSortOrder", "updatedAt"]);
  const data = [...products].sort((a, b) => a.code.localeCompare(b.code)).map(product =>
    Object.fromEntries(Object.entries(product).filter(([key]) => !permitted.has(key))));
  return createHash("sha256").update(JSON.stringify(canonical(data))).digest("hex");
}

export async function previewProductFamilies(plan: ProductFamilyPlan, read: () => Promise<FamilyPlanState>, gate: FamilyExecutionGate) {
  assertFamilyGate(gate, "dry-run");
  const state = await read();
  const { report } = reconcileProductFamilyPlan(plan, state.products, state.families);
  return { schema: state.schema, report, writeOperations: 0 };
}

export async function executeProductFamilies(plan: ProductFamilyPlan, writer: FamilyPlanWriter, gate: FamilyExecutionGate) {
  assertFamilyGate(gate, "execute");
  return writer.serializable(async tx => {
    // Fresh deterministic reads under Serializable. Never trust an earlier dry-run.
    const productsBefore = await tx.readProducts();
    const familiesBefore = await tx.readFamilies();
    const pending = reconcileProductFamilyPlan(plan, productsBefore, familiesBefore);
    if (pending.report.summary.conflicts !== 0) throw new Error("FAMILY_PLAN_CONFLICTS_ABORTED");
    const beforeDigest = protectedDigest(productsBefore);
    const familyIds = new Map(familiesBefore.map(f => [f.slug, f.id]));
    let familiesCreated = 0;
    let variantsLinked = 0;
    for (const data of [...pending.familiesToCreate].sort((a, b) => a.slug.localeCompare(b.slug))) {
      const saved = await tx.createFamily(data);
      if (saved.slug !== data.slug || !saved.id) throw new Error("FAMILY_WRITE_RESULT_INVALID");
      familyIds.set(saved.slug, saved.id); familiesCreated++;
    }
    for (const variant of [...pending.variantsToLink].sort((a: VariantLink, b: VariantLink) => a.code.localeCompare(b.code))) {
      const familyId = familyIds.get(variant.familySlug);
      if (!familyId) throw new Error("FAMILY_WRITE_RESULT_INVALID");
      // The only Product data payload emitted by this tool. No spread of plan/db fields.
      await tx.linkVariant(variant.productId, {
        familyId, variantLabel: variant.variantLabel, variantSortOrder: variant.variantSortOrder,
      });
      variantsLinked++;
    }
    const productsAfter = await tx.readProducts();
    const familiesAfter = await tx.readFamilies();
    const final = reconcileProductFamilyPlan(plan, productsAfter, familiesAfter);
    if (protectedDigest(productsAfter) !== beforeDigest) throw new Error("FAMILY_PROTECTED_FIELDS_CHANGED_ABORTED");
    if (final.report.summary.conflicts !== 0 || final.familiesToCreate.length || final.variantsToLink.length ||
      productsAfter.length !== productsBefore.length || familiesAfter.length !== familiesBefore.length + familiesCreated ||
      familiesCreated !== pending.familiesToCreate.length || variantsLinked !== pending.variantsToLink.length) {
      throw new Error("FAMILY_FINAL_RECONCILIATION_ABORTED");
    }
    return {
      schema: "CURRENT" as const,
      report: { ...pending.report, summary: { ...pending.report.summary, writesPerformed: familiesCreated + variantsLinked } },
      finalReport: final.report,
      familiesCreated, variantsLinked, writeOperations: familiesCreated + variantsLinked,
    };
  });
}
