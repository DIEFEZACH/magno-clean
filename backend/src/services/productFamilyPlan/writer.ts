import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ProductFamilyPlanConfig } from "./config";
import { assertFamilyGate, type FamilyExecutionGate, type FamilyPlanWriter } from "./runner";

/** Deliberately imported only on an explicitly confirmed --execute. */
export function createFamilyPlanWriter(config: ProductFamilyPlanConfig, gate: FamilyExecutionGate) {
  assertFamilyGate(gate, "execute");
  const c = config.connection;
  const direct = c.host === `db.${gate.projectRef}.supabase.co` && c.user === "postgres";
  const pooler = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(c.host || "") && c.user === `postgres.${gate.projectRef}`;
  if (config.environment !== gate.environment || config.projectRef !== gate.projectRef || (!direct && !pooler) ||
    c.port !== 5432 || c.database !== "postgres" || !c.password || c.connectionString ||
    !c.ssl || typeof c.ssl !== "object" || c.ssl.rejectUnauthorized !== true || !c.ssl.ca ||
    c.options !== "-c default_transaction_read_only=off") throw new Error("FAMILY_STRICT_WRITER_REQUIRED");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ ...c, application_name: "magno_family_plan_apply" }), log: [] });
  const writer: FamilyPlanWriter = {
    serializable: work => prisma.$transaction(async tx => {
      // Serialize cooperating executions; locks ordered by code also protect the linked Product rows.
      // executeRaw avoids decoding PostgreSQL's void return through the Prisma PG adapter.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1937006964, 1717660012)`;
      await tx.$queryRaw`SELECT "id" FROM "public"."Product" ORDER BY "code" ASC FOR UPDATE`;
      return work({
        // All scalar fields, including prices and stock, are compared in memory before commit.
        readProducts: () => tx.product.findMany({ orderBy: { code: "asc" } }),
        readFamilies: () => tx.productFamily.findMany({ orderBy: { slug: "asc" } }),
        createFamily: data => tx.productFamily.create({ data, select: { id: true, slug: true } }),
        linkVariant: (id, data) => tx.product.update({ where: { id, familyId: null },
          data: { familyId: data.familyId, variantLabel: data.variantLabel, variantSortOrder: data.variantSortOrder },
          select: { id: true },
        }),
      });
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 120_000 }),
  };
  return { writer, disconnect: () => prisma.$disconnect() };
}
