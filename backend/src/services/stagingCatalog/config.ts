import { X509Certificate } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { parse as parseDotenv } from "dotenv";
import type { ClientConfig } from "pg";

export const PRODUCTION_PROJECT_REF = "fxbgxjpgfkeuapbmgpmv";
export const STAGING_PROJECT_REF = "heqneuhptatgybddoply";
export const APPLY_CONFIRMATION = "APPLY_SANITIZED_CATALOG_TO_STAGING";

type ExpectedCounts = {
  expectedCount?: number;
  expectedActive?: number;
  expectedInactive?: number;
};

type CommonArgs = ExpectedCounts & {
  projectRef: string;
  envFile: string;
  caFile: string;
  outputDir: string;
};

export type ExportArgs = CommonArgs & { environment: "production" };
export type ApplyArgs = CommonArgs & {
  environment: "staging";
  snapshot: string;
  sha256?: string;
  checksumFile?: string;
  mode: "dry-run" | "execute";
  confirm?: string;
};

export type IsolatedCatalogConfig = {
  environment: "production" | "staging";
  projectRef: string;
  connection: ClientConfig;
};

const COMMON_FLAGS = [
  "environment", "project-ref", "env-file", "ca-file", "output-dir",
  "expected-count", "expected-active", "expected-inactive",
];
type Flags = Map<string, string | true>;

function parseFlags(argv: string[], operation: "export" | "apply"): Flags {
  const values = new Set([
    ...COMMON_FLAGS,
    ...(operation === "apply" ? ["snapshot", "sha256", "checksum-file", "confirm"] : []),
  ]);
  const booleans = new Set(operation === "apply" ? ["dry-run", "execute"] : []);
  const flags: Flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith("--")) throw new Error("Usa argumentos con formato --nombre valor");
    const name = raw.slice(2);
    // Do not echo unknown arguments: a misplaced credential could be one.
    if (!values.has(name) && !booleans.has(name)) throw new Error("Argumento no permitido");
    if (flags.has(name)) throw new Error(`Argumento duplicado: --${name}`);
    if (booleans.has(name)) {
      flags.set(name, true);
      continue;
    }
    const value = argv[index + 1];
    if (typeof value !== "string" || !value.trim() || value.startsWith("--")) {
      throw new Error(`Falta el valor de --${name}`);
    }
    flags.set(name, value);
    index += 1;
  }
  return flags;
}

function required(flags: Flags, name: string): string {
  const value = flags.get(name);
  if (typeof value !== "string") throw new Error(`Falta el argumento obligatorio --${name}`);
  return value;
}

function optional(flags: Flags, name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function assertTarget(environment: string, projectRef: string, operation: "export" | "apply"): void {
  const expectedEnvironment = operation === "export" ? "production" : "staging";
  const expectedRef = operation === "export" ? PRODUCTION_PROJECT_REF : STAGING_PROJECT_REF;
  if (environment !== expectedEnvironment || projectRef !== expectedRef) {
    throw new Error(operation === "export"
      ? "Exportación permitida únicamente desde el proyecto de producción autorizado"
      : "Aplicación permitida únicamente al proyecto de staging autorizado; producción rechazada");
  }
}

function counts(flags: Flags): ExpectedCounts {
  const parseCount = (flag: string): number | undefined => {
    const raw = optional(flags, flag);
    if (raw === undefined) return undefined;
    if (!/^(0|[1-9][0-9]*)$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
      throw new Error(`--${flag} debe ser un entero no negativo`);
    }
    return Number(raw);
  };
  const expectedCount = parseCount("expected-count");
  const expectedActive = parseCount("expected-active");
  const expectedInactive = parseCount("expected-inactive");
  if (expectedCount !== undefined && (
    (expectedActive !== undefined && expectedActive > expectedCount) ||
    (expectedInactive !== undefined && expectedInactive > expectedCount) ||
    (expectedActive !== undefined && expectedInactive !== undefined && expectedActive + expectedInactive !== expectedCount)
  )) throw new Error("Los conteos esperados son inconsistentes");
  return { expectedCount, expectedActive, expectedInactive };
}

function commonArgs(flags: Flags, cwd: string, operation: "export" | "apply"): CommonArgs {
  const projectRef = required(flags, "project-ref");
  assertTarget(required(flags, "environment"), projectRef, operation);
  const envFile = operation === "export" ? required(flags, "env-file") : optional(flags, "env-file") ?? ".env.staging";
  const allowedNames = operation === "export" ? [".env", ".env.production"] : [".env.staging"];
  if (!allowedNames.includes(path.basename(envFile))) throw new Error("Nombre de archivo de entorno no permitido para esta operación");
  return {
    projectRef,
    envFile: path.resolve(cwd, envFile),
    caFile: path.resolve(cwd, required(flags, "ca-file")),
    outputDir: path.resolve(cwd, optional(flags, "output-dir") ?? "../.local/staging-baseline"),
    ...counts(flags),
  };
}

/** Pure argument parsing: no files, environment credentials or network are read. */
export function parseExportArgs(argv: string[], cwd = process.cwd()): ExportArgs {
  const flags = parseFlags(argv, "export");
  return { ...commonArgs(flags, cwd, "export"), environment: "production" };
}

/** --execute requires a separate confirmation; exactly one digest source is required. */
export function parseApplyArgs(argv: string[], cwd = process.cwd()): ApplyArgs {
  const flags = parseFlags(argv, "apply");
  const common = commonArgs(flags, cwd, "apply");
  const dryRun = flags.get("dry-run") === true;
  const execute = flags.get("execute") === true;
  if (dryRun === execute) throw new Error("Indica exactamente uno de --dry-run o --execute");
  const confirm = optional(flags, "confirm");
  if (execute && confirm !== APPLY_CONFIRMATION) throw new Error(`--execute requiere --confirm ${APPLY_CONFIRMATION}`);
  if (!execute && confirm !== undefined) throw new Error("--confirm sólo puede usarse con --execute");
  const sha256 = optional(flags, "sha256");
  const checksumFile = optional(flags, "checksum-file");
  if ((sha256 === undefined) === (checksumFile === undefined)) throw new Error("Indica exactamente uno de --sha256 o --checksum-file");
  if (sha256 !== undefined && !/^[0-9a-fA-F]{64}$/.test(sha256)) throw new Error("--sha256 debe contener 64 caracteres hexadecimales");
  return {
    ...common,
    environment: "staging",
    snapshot: path.resolve(cwd, required(flags, "snapshot")),
    sha256: sha256?.toLowerCase(),
    checksumFile: checksumFile === undefined ? undefined : path.resolve(cwd, checksumFile),
    mode: execute ? "execute" : "dry-run",
    confirm,
  };
}

function readEnvironment(envFile: string, operation: "export" | "apply"): Record<string, string> {
  let resolved: string;
  try {
    resolved = realpathSync(envFile);
  } catch {
    throw new Error("No fue posible leer el archivo de entorno explícito");
  }
  const allowedNames = operation === "export" ? [".env", ".env.production"] : [".env.staging"];
  if (!allowedNames.includes(path.basename(resolved))) throw new Error("El archivo de entorno real no corresponde a la operación autorizada");
  try {
    const stat = statSync(resolved);
    if (!stat.isFile() || stat.size > 256 * 1024) throw new Error();
    // parse(), never config(): no process.env fallback, expansion or mutation.
    return parseDotenv(readFileSync(resolved));
  } catch {
    throw new Error("No fue posible analizar el archivo de entorno explícito");
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
    for (const block of blocks) {
      if (!new X509Certificate(block).ca) throw new Error();
    }
    return pem;
  } catch {
    throw new Error("--ca-file debe contener exclusivamente certificados CA PEM válidos");
  }
}

function assertSupabaseUrl(raw: string, projectRef: string): void {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== `${projectRef}.supabase.co` || url.port ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
  } catch {
    throw new Error("SUPABASE_URL no coincide exactamente con el proyecto autorizado");
  }
}

function databaseIdentity(raw: string | undefined, projectRef: string): Pick<ClientConfig, "host" | "port" | "user" | "password" | "database"> {
  if (!raw?.trim()) throw new Error("DATABASE_URL está ausente en el archivo de entorno explícito");
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
    throw new Error("DATABASE_URL tiene formato PostgreSQL no permitido; se exige puerto 5432 y base postgres");
  }
  const direct = url.hostname === `db.${projectRef}.supabase.co` && user === "postgres";
  const sessionPooler = /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && user === `postgres.${projectRef}`;
  if (!direct && !sessionPooler) throw new Error("DATABASE_URL no corresponde al host y usuario del proyecto autorizado");
  const seen = new Set<string>();
  for (const [key, value] of url.searchParams) {
    if (seen.has(key)) throw new Error("DATABASE_URL contiene parámetros repetidos no permitidos");
    seen.add(key);
    const permitted = (key === "sslmode" && ["require", "verify-ca", "verify-full"].includes(value)) ||
      (key === "ssl" && value === "true") || (key === "sslrejectunauthorized" && value === "true");
    if (!permitted) throw new Error("DATABASE_URL contiene parámetros SSL o de conexión no permitidos");
  }
  // Never pass connectionString: URL query options must not override this driver TLS config.
  return { host: url.hostname, port: 5432, user, password, database: "postgres" };
}

function loadConfig(args: ExportArgs | ApplyArgs, operation: "export" | "apply"): IsolatedCatalogConfig {
  // This check intentionally precedes any filesystem read even when called without the parser.
  assertTarget(args.environment, args.projectRef, operation);
  if (operation === "apply") {
    const apply = args as ApplyArgs;
    if (!["dry-run", "execute"].includes(apply.mode) || (apply.mode === "execute" && apply.confirm !== APPLY_CONFIRMATION)) {
      throw new Error("Modo o confirmación de aplicación no autorizado");
    }
  }
  const parsed = readEnvironment(args.envFile, operation);
  if (parsed.SUPABASE_URL !== undefined) assertSupabaseUrl(parsed.SUPABASE_URL, args.projectRef);
  const identity = databaseIdentity(parsed.DATABASE_URL, args.projectRef);
  const ca = loadCertificate(args.caFile);
  const readOnly = operation === "export" || (args as ApplyArgs).mode === "dry-run";
  return {
    environment: args.environment,
    projectRef: args.projectRef,
    connection: {
      ...identity,
      ssl: { rejectUnauthorized: true, ca },
      connectionTimeoutMillis: 15_000,
      application_name: "magno-clean-sanitized-catalog",
      options: `-c default_transaction_read_only=${readOnly ? "on" : "off"}`,
    },
  };
}

export function loadExportConfig(args: ExportArgs): IsolatedCatalogConfig {
  return loadConfig(args, "export");
}

export function loadApplyConfig(args: ApplyArgs): IsolatedCatalogConfig {
  return loadConfig(args, "apply");
}
