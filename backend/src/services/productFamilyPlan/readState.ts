import { Client, type ClientConfig } from "pg";
import type { CurrentFamily, CurrentProduct } from "./plan";

// All identifiers are fixed, never taken from the plan/CLI or database values.
export const FAMILY_SCHEMA_SQL = `SELECT
  to_regclass('public."ProductFamily"') IS NOT NULL AS "familyTable",
  (SELECT COUNT(*)::int FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Product'
      AND column_name IN ('familyId', 'variantLabel', 'variantSortOrder')) AS "associationColumns"`;
export const FAMILY_READ_SQL = `SELECT "id", "slug", "name", "brand", "category", "description",
  "imageUrl", "badge", "active", "featured", "variantType", "alwaysShowAsFamily"
  FROM "public"."ProductFamily" ORDER BY "slug" ASC`;
export const PRODUCT_READ_SQL = `SELECT "id", "code", "slug", "name", "active",
  "familyId", "variantLabel", "variantSortOrder" FROM "public"."Product" ORDER BY "code" ASC`;
export const LEGACY_PRODUCT_READ_SQL = `SELECT "id", "code", "slug", "name", "active",
  NULL::text AS "familyId", NULL::text AS "variantLabel", 0::int AS "variantSortOrder"
  FROM "public"."Product" ORDER BY "code" ASC`;

export type FamilyPlanState = {
  products: CurrentProduct[];
  families: CurrentFamily[];
  schema: "CURRENT" | "PRE_MIGRATION";
};
export interface FamilyReadClient {
  on?(event: "error", listener: (error: unknown) => void): unknown;
  connect(): Promise<unknown>;
  query(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<unknown>;
}

/** No mutation adapter or Prisma singleton is imported by the read-only path. */
export async function readOnlyFamilyPlanState(
  connection: ClientConfig,
  allowPreMigration: boolean,
  factory: (config: ClientConfig) => FamilyReadClient = config => new Client(config),
): Promise<FamilyPlanState> {
  const client = factory({ ...connection,
    options: "-c default_transaction_read_only=on",
    application_name: "magno_family_plan_read_only",
    connectionTimeoutMillis: 15_000, statement_timeout: 30_000, query_timeout: 35_000,
  });
  let transportFailed = false;
  // pg may emit socket errors outside a query promise; consume them without leaking raw stacks.
  client.on?.("error", () => { transportFailed = true; });
  let connected = false;
  try {
    await client.connect(); connected = true;
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const readOnly = await client.query("SHOW transaction_read_only");
    if (readOnly.rows[0]?.transaction_read_only !== "on") throw new Error("FAMILY_READ_ONLY_REQUIRED");
    const row = (await client.query(FAMILY_SCHEMA_SQL)).rows[0];
    const current = row?.familyTable === true && row?.associationColumns === 3;
    const legacy = row?.familyTable === false && row?.associationColumns === 0;
    if (!current && !legacy) throw new Error("FAMILY_SCHEMA_PARTIAL_ABORTED");
    if (legacy && !allowPreMigration) throw new Error("FAMILY_SCHEMA_MISSING_PRE_MIGRATION_REQUIRED");
    const productRows = (await client.query(current ? PRODUCT_READ_SQL : LEGACY_PRODUCT_READ_SQL)).rows;
    const familyRows = current ? (await client.query(FAMILY_READ_SQL)).rows : [];
    const text = (row: Record<string, unknown>, keys: string[]) => keys.every(key => typeof row[key] === "string" && row[key] !== "");
    if (productRows.some(p => !text(p, ["id", "code", "slug", "name"]) || typeof p.active !== "boolean" ||
      !(p.familyId === null || typeof p.familyId === "string") ||
      !(p.variantLabel === null || typeof p.variantLabel === "string") || !Number.isInteger(p.variantSortOrder))) {
      throw new Error("FAMILY_DATABASE_ROW_INVALID");
    }
    if (familyRows.some(f => !text(f, ["id", "slug", "name", "brand", "category", "description", "variantType"]) ||
      ["active", "featured", "alwaysShowAsFamily"].some(k => typeof f[k] !== "boolean") ||
      ["imageUrl", "badge"].some(k => !(f[k] === null || typeof f[k] === "string")))) {
      throw new Error("FAMILY_DATABASE_ROW_INVALID");
    }
    const products = productRows as unknown as CurrentProduct[];
    const families = familyRows as unknown as CurrentFamily[];
    if (transportFailed) throw new Error("FAMILY_DATABASE_CONNECTION_FAILED");
    return { products, families, schema: current ? "CURRENT" : "PRE_MIGRATION" };
  } finally {
    if (connected) await client.query("ROLLBACK").catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}
