import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env";

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED,
  },
});

export const prisma = new PrismaClient({
  adapter,
});
