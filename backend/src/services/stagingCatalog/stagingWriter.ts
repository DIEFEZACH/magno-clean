import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ClientConfig } from "pg";
import { STAGING_PROJECT_REF } from "./config";
import { PRODUCT_SELECT, type CatalogProduct } from "./types";
import type { StagingWriter } from "./applyRunner";

export function createStagingWriter(config: { environment: string; projectRef: string; connection: ClientConfig }) {
  const c = config.connection;
  const allowedHost = c.host === `db.${STAGING_PROJECT_REF}.supabase.co` || /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(c.host || "");
  const allowedUser = c.host === `db.${STAGING_PROJECT_REF}.supabase.co` ? c.user === "postgres" : c.user === `postgres.${STAGING_PROJECT_REF}`;
  if (config.environment !== "staging" || config.projectRef !== STAGING_PROJECT_REF || !allowedHost || !allowedUser || c.port !== 5432 || c.database !== "postgres" || !c.password || !c.ssl || typeof c.ssl !== "object" || c.ssl.rejectUnauthorized !== true || !c.ssl.ca || c.connectionString) {
    throw new Error("STRICT_STAGING_WRITER_REQUIRED");
  }
  const adapter = new PrismaPg({ ...c, application_name: "magno_staging_catalog_apply" });
  const prisma = new PrismaClient({ adapter, log: [] });
  const writer: StagingWriter = {
    serializable: work => prisma.$transaction(async transaction => {
      // Cooperating baseline runs serialize; Serializable also detects concurrent admin races.
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(1937006964, 1667331188)`;
      return work({
        readProducts: async () => transaction.product.findMany({ select: PRODUCT_SELECT, orderBy: { code: "asc" } }) as Promise<CatalogProduct[]>,
        upsertProduct: (code, create, update) => transaction.product.upsert({
          where: { code },
          create: create as Prisma.ProductCreateInput,
          update: update as Prisma.ProductUpdateInput,
          select: { code: true },
        }),
      });
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 120_000 }),
  };
  return { writer, disconnect: () => prisma.$disconnect() };
}
