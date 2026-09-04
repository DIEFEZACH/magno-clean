import { X509Certificate } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { parse as parseDotenv } from "dotenv";
import type { ClientConfig } from "pg";

export const PRODUCTION_PROJECT_REF = "fxbgxjpgfkeuapbmgpmv";
export const STAGING_PROJECT_REF = "heqneuhptatgybddoply";
export const PRODUCTION_CONFIRMATION = "APPLY_PRODUCT_FAMILY_PLAN_PRODUCTION";
export const STAGING_CONFIRMATION = "APPLY_PRODUCT_FAMILY_PLAN_STAGING";

export type ProductFamilyPlanArgs = {
  plan: string;
  sha256: string;
  environment: "production" | "staging";
  projectRef: string;
  envFile: string;
  caFile: string;
  expectedFamilies: number;
  expectedVariants: number;
  expectedIndividuals: number;
  mode: "dry-run" | "execute";
  confirm?: string;
  preMigration: boolean;
};

/** Contains credentials; never serialize this configuration into logs or reports. */
export type ProductFamilyPlanConfig = {
  environment: ProductFamilyPlanArgs["environment"];
  projectRef: string;
  connection: ClientConfig;
};

/** Only fixed, non-sensitive messages may be constructed with this error. */
export class ProductFamilyPlanConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductFamilyPlanConfigError";
  }
}

const VALUE_FLAGS = new Set([
  "plan", "sha256", "environment", "project-ref", "env-file", "ca-file",
  "expected-families", "expected-variants", "expected-individuals", "confirm",
]);
const BOOLEAN_FLAGS = new Set(["dry-run", "execute", "pre-migration"]);
type Flags = Map<string, string | true>;

function fail(message: string): never {
  throw new ProductFamilyPlanConfigError(message);
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith("--")) fail("Usa argumentos con formato --nombre valor");
    const name = raw.slice(2);
    // Unknown input can be a misplaced secret: never echo its name or value.
    if (!VALUE_FLAGS.has(name) && !BOOLEAN_FLAGS.has(name)) fail("Argumento no permitido");
    if (flags.has(name)) fail(`Argumento duplicado: --${name}`);
    if (BOOLEAN_FLAGS.has(name)) {
      flags.set(name, true);
      continue;
    }
    const value = argv[index + 1];
    if (typeof value !== "string" || !value.trim() || value.startsWith("--")) {
      fail(`Falta el valor de --${name}`);
    }
    flags.set(name, value);
    index += 1;
  }
  return flags;
}

function required(flags: Flags, name: string): string {
  const value = flags.get(name);
  if (typeof value !== "string") fail(`Falta el argumento obligatorio --${name}`);
  return value;
}

function count(flags: Flags, name: string): number {
  const value = required(flags, name);
  if (!/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) {
    fail(`--${name} debe ser un entero no negativo`);
  }
  return Number(value);
}

function assertTarget(environment: string, projectRef: string): void {
  const expectedRef = environment === "production" ? PRODUCTION_PROJECT_REF
    : environment === "staging" ? STAGING_PROJECT_REF : undefined;
  if (expectedRef === undefined || projectRef !== expectedRef) {
    fail("El entorno y Project Ref no corresponden exactamente a un proyecto autorizado");
  }
}

function assertArgs(args: ProductFamilyPlanArgs): void {
  // Revalidate at the loading boundary before touching files, even without the CLI parser.
  assertTarget(args.environment, args.projectRef);
  if (args.mode !== "dry-run" && args.mode !== "execute") fail("Modo de aplicación no autorizado");
  const confirmation = args.environment === "production" ? PRODUCTION_CONFIRMATION : STAGING_CONFIRMATION;
  if (args.mode === "execute" && args.confirm !== confirmation) {
    fail(`--execute requiere --confirm ${confirmation}`);
  }
  if (args.mode === "dry-run" && args.confirm !== undefined) fail("--confirm sólo puede usarse con --execute");
  if (typeof args.preMigration !== "boolean") fail("Modo de pre-migración no válido");
  if (args.preMigration && args.mode !== "dry-run") fail("--pre-migration sólo puede usarse en dry-run");
  if (typeof args.sha256 !== "string" || !/^[0-9a-fA-F]{64}$/.test(args.sha256)) {
    fail("--sha256 debe contener 64 caracteres hexadecimales");
  }
  for (const [name, value] of [
    ["plan", args.plan], ["env-file", args.envFile], ["ca-file", args.caFile],
  ] as const) {
    if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
      fail(`Se requiere una ruta explícita válida para --${name}`);
    }
  }
  for (const [name, value] of [
    ["expected-families", args.expectedFamilies], ["expected-variants", args.expectedVariants],
    ["expected-individuals", args.expectedIndividuals],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) fail(`--${name} debe ser un entero no negativo`);
  }
}

/** Pure parsing: no files, connection, credential loading or ambient environment access. */
export function parseProductFamilyPlanArgs(argv: string[], cwd = process.cwd()): ProductFamilyPlanArgs {
  const flags = parseFlags(argv);
  if (flags.has("execute") && flags.has("dry-run")) fail("--dry-run y --execute son mutuamente excluyentes");
  const args: ProductFamilyPlanArgs = {
    plan: path.resolve(cwd, required(flags, "plan")),
    sha256: required(flags, "sha256").toLowerCase(),
    environment: required(flags, "environment") as ProductFamilyPlanArgs["environment"],
    projectRef: required(flags, "project-ref"),
    // All paths are required: no implicit .env, .env.staging or CA defaults.
    envFile: path.resolve(cwd, required(flags, "env-file")),
    caFile: path.resolve(cwd, required(flags, "ca-file")),
    expectedFamilies: count(flags, "expected-families"),
    expectedVariants: count(flags, "expected-variants"),
    expectedIndividuals: count(flags, "expected-individuals"),
    mode: flags.has("execute") ? "execute" : "dry-run",
    confirm: flags.get("confirm") as string | undefined,
    preMigration: flags.has("pre-migration"),
  };
  assertArgs(args);
  return args;
}

function readEnvironment(envFile: string): Record<string, string> {
  try {
    const resolved = realpathSync(envFile);
    const stat = statSync(resolved);
    if (!stat.isFile() || stat.size > 256 * 1024) throw new Error();
    // parse(), never config(): only this file, without interpolation or process.env mutation.
    return parseDotenv(readFileSync(resolved));
  } catch {
    fail("No fue posible leer o analizar el archivo de entorno explícito");
  }
}

function loadCertificate(caFile: string): string {
  try {
    const stat = statSync(caFile);
    if (!stat.isFile() || stat.size > 256 * 1024) throw new Error();
    const pem = readFileSync(caFile, "utf8");
    const pattern = /-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\s]+?-----END CERTIFICATE-----/g;
    const blocks = pem.match(pattern);
    if (!blocks?.length || pem.replace(pattern, "").trim()) throw new Error();
    for (const block of blocks) if (!new X509Certificate(block).ca) throw new Error();
    return pem;
  } catch {
    fail("--ca-file debe contener exclusivamente certificados CA PEM válidos");
  }
}

function assertSupabaseUrl(raw: string, projectRef: string): void {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== `${projectRef}.supabase.co` || url.port ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
  } catch {
    fail("SUPABASE_URL no coincide exactamente con el proyecto autorizado");
  }
}

function databaseIdentity(raw: string | undefined, projectRef: string): Pick<ClientConfig, "host" | "port" | "user" | "password" | "database"> {
  if (!raw?.trim()) fail("DATABASE_URL está ausente en el archivo de entorno explícito");
  let url: URL;
  let user: string;
  let password: string;
  try {
    url = new URL(raw);
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    if (!["postgresql:", "postgres:"].includes(url.protocol) || url.hash || url.port !== "5432" ||
      url.pathname !== "/postgres" || !user || !password.trim() ||
      /[\u0000-\u001f\u007f]/.test(user + password) || /\[YOUR-PASSWORD\]/i.test(password)) throw new Error();
  } catch {
    fail("DATABASE_URL tiene formato PostgreSQL no permitido; se exige puerto 5432 y base postgres");
  }
  const direct = url.hostname === `db.${projectRef}.supabase.co` && user === "postgres";
  const sessionPooler = /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && user === `postgres.${projectRef}`;
  if (!direct && !sessionPooler) fail("DATABASE_URL no corresponde al host y usuario del proyecto autorizado");
  const seen = new Set<string>();
  for (const [key, value] of url.searchParams) {
    if (seen.has(key)) fail("DATABASE_URL contiene parámetros repetidos no permitidos");
    seen.add(key);
    const permitted = (key === "sslmode" && ["require", "verify-ca", "verify-full"].includes(value)) ||
      (key === "ssl" && value === "true") || (key === "sslrejectunauthorized" && value === "true");
    if (!permitted) fail("DATABASE_URL contiene parámetros SSL o de conexión no permitidos");
  }
  return { host: url.hostname, port: 5432, user, password, database: "postgres" };
}

export function loadProductFamilyPlanConfig(args: ProductFamilyPlanArgs): ProductFamilyPlanConfig {
  assertArgs(args);
  const parsed = readEnvironment(args.envFile);
  if (parsed.SUPABASE_URL !== undefined) assertSupabaseUrl(parsed.SUPABASE_URL, args.projectRef);
  const identity = databaseIdentity(parsed.DATABASE_URL, args.projectRef);
  const ca = loadCertificate(args.caFile);
  return {
    environment: args.environment,
    projectRef: args.projectRef,
    connection: {
      ...identity,
      // Do not provide connectionString: URL flags cannot replace strict certificate verification.
      ssl: { rejectUnauthorized: true, ca },
      connectionTimeoutMillis: 15_000,
      application_name: "magno-clean-product-family-plan",
      // Validated --execute and its environment-specific confirmation are the only writable route.
      options: `-c default_transaction_read_only=${args.mode === "dry-run" ? "on" : "off"}`,
    },
  };
}
