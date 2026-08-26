import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_SECONDS: z.coerce.number().int().positive(),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().int().positive(),
  JSON_BODY_LIMIT: z.string().min(1).default("100kb"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(200),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  CHECKOUT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  WEBHOOK_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
  ADMIN_NAME: z.string().min(2),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(12),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().min(1),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().min(16),
  DEFAULT_CURRENCY: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  MAX_ORDER_ITEMS: z.coerce.number().int().positive().max(500),
  MAX_ITEM_QUANTITY: z.coerce.number().int().positive().max(10000),
  INVENTORY_RESERVATION_MINUTES: z.coerce.number().int().positive().max(1440).default(30),
  API_PUBLIC_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_PRODUCT_IMAGES_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/).default("product-images"),
  PRODUCT_IMAGE_MAX_BYTES: z.coerce.number().int().positive().default(5_242_880),
  PRODUCT_IMAGE_MAX_COUNT: z.coerce.number().int().positive().max(50).default(20),
  DATABASE_SSL_REJECT_UNAUTHORIZED: z.enum(["true", "false"])
    .optional()
    .transform((value) => value === undefined ? process.env.NODE_ENV === "production" : value === "true"),
  ERROR_TRACKING_DSN: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error(JSON.stringify({
    level: "fatal",
    message: "Variables de entorno inválidas",
    errors: result.error.flatten().fieldErrors,
  }));
  throw new Error("Configuración de entorno inválida");
}

export const env = result.data;
export const corsOrigins = env.CORS_ORIGIN.split(",").map((origin) => origin.trim());
export const frontendOrigin = corsOrigins[0];

if (env.NODE_ENV === "production") {
  const invalidOrigins = corsOrigins.filter((origin) => {
    try {
      const url = new URL(origin);
      return url.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(url.hostname);
    } catch {
      return true;
    }
  });
  if (!env.API_PUBLIC_URL || new URL(env.API_PUBLIC_URL).protocol !== "https:" || invalidOrigins.length > 0) {
    throw new Error("En producción, API_PUBLIC_URL y todos los CORS_ORIGIN deben ser URLs HTTPS públicas válidas");
  }
}
