import { Client, type ClientConfig } from "pg";
import { PRODUCT_FIELDS } from "./types";

// Fixed identifiers, never supplied by CLI, environment, snapshot, or database rows.
export const PRODUCT_READ_SQL = `SELECT ${PRODUCT_FIELDS.map(field => `"${field}"`).join(", ")} FROM "public"."Product" ORDER BY "code" ASC`;

export interface ReadOnlyClient {
  connect(): Promise<unknown>;
  query(text: string): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<unknown>;
}

export async function readOnlyProductCatalog(
  connection: ClientConfig,
  factory: (config: ClientConfig) => ReadOnlyClient = config => new Client(config),
): Promise<Record<string, unknown>[]> {
  const client = factory({
    ...connection,
    options: "-c default_transaction_read_only=on",
    application_name: "magno_catalog_read_only",
    connectionTimeoutMillis: 15_000,
    statement_timeout: 30_000,
    query_timeout: 35_000,
  });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const state = await client.query("SHOW transaction_read_only");
    if (state.rows[0]?.transaction_read_only !== "on") throw new Error("READ_ONLY_REQUIRED");
    return (await client.query(PRODUCT_READ_SQL)).rows;
  } finally {
    if (connected) await client.query("ROLLBACK").catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}
