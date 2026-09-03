import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { parse as parseDotenv } from "dotenv";
import type { MediaSyncArguments, MediaSyncStagingConfig } from "./types";

export const MEDIA_SYNC_STAGING_PROJECT_REF = "heqneuhptatgybddoply";
export const MEDIA_SYNC_PRODUCTION_PROJECT_REF = "fxbgxjpgfkeuapbmgpmv";
export const MEDIA_SYNC_BUCKET = "product-media";
export const MEDIA_SYNC_EXECUTION_CONFIRMATION = "SYNC_PRODUCT_MEDIA_STAGING";

type ParsedFlags = Map<string, string | true>;

const VALUE_FLAGS = new Set([
  "manifest",
  "source-root",
  "environment",
  "project-ref",
  "bucket",
  "confirm",
  "env-file",
  "report-dir",
  "concurrency",
]);
const BOOLEAN_FLAGS = new Set(["dry-run", "execute"]);

function parseFlags(argv: string[]): ParsedFlags {
  const flags: ParsedFlags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith("--")) throw new Error("Todos los argumentos deben usar el formato --nombre valor");
    const name = raw.slice(2);
    if (!VALUE_FLAGS.has(name) && !BOOLEAN_FLAGS.has(name)) throw new Error(`Argumento desconocido: --${name}`);
    if (flags.has(name)) throw new Error(`Argumento duplicado: --${name}`);
    if (BOOLEAN_FLAGS.has(name)) {
      flags.set(name, true);
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Falta el valor de --${name}`);
    flags.set(name, value);
    index += 1;
  }
  return flags;
}

function requiredValue(flags: ParsedFlags, name: string) {
  const value = flags.get(name);
  if (typeof value !== "string" || !value.trim()) throw new Error(`Falta el argumento obligatorio --${name}`);
  return value;
}

export function parseMediaSyncArgs(argv: string[], cwd = process.cwd()): MediaSyncArguments {
  const flags = parseFlags(argv);
  const dryRun = flags.get("dry-run") === true;
  const execute = flags.get("execute") === true;
  if (dryRun === execute) throw new Error("Indica exactamente uno de --dry-run o --execute");

  const environment = requiredValue(flags, "environment");
  const projectRef = requiredValue(flags, "project-ref");
  const bucket = requiredValue(flags, "bucket");
  if (environment !== "staging") throw new Error("Media sync sólo permite --environment staging");
  if (projectRef === MEDIA_SYNC_PRODUCTION_PROJECT_REF) throw new Error("Destino de producción rechazado");
  if (projectRef !== MEDIA_SYNC_STAGING_PROJECT_REF) throw new Error("Project Ref de staging no autorizado");
  if (bucket !== MEDIA_SYNC_BUCKET) throw new Error("Bucket no autorizado; debe ser product-media");

  const confirmation = typeof flags.get("confirm") === "string" ? String(flags.get("confirm")) : undefined;
  if (execute && confirmation !== MEDIA_SYNC_EXECUTION_CONFIRMATION) {
    throw new Error(`--execute requiere --confirm ${MEDIA_SYNC_EXECUTION_CONFIRMATION}`);
  }
  if (!execute && confirmation !== undefined) throw new Error("--confirm sólo puede usarse con --execute");

  const concurrencyRaw = typeof flags.get("concurrency") === "string" ? String(flags.get("concurrency")) : "4";
  const concurrency = Number(concurrencyRaw);
  if (!Number.isSafeInteger(concurrency) || concurrency < 3 || concurrency > 5) {
    throw new Error("--concurrency debe ser un entero entre 3 y 5");
  }

  return {
    manifestPath: path.resolve(cwd, requiredValue(flags, "manifest")),
    sourceRoot: path.resolve(cwd, requiredValue(flags, "source-root")),
    environment: "staging",
    projectRef,
    bucket,
    mode: execute ? "execute" : "dry-run",
    confirmation,
    envFilePath: path.resolve(cwd, typeof flags.get("env-file") === "string" ? String(flags.get("env-file")) : ".env.staging"),
    reportDirectory: path.resolve(cwd, typeof flags.get("report-dir") === "string" ? String(flags.get("report-dir")) : "../.local/reports"),
    concurrency,
  };
}

export function loadExactStagingConfig(
  envFilePath: string,
  expectedProjectRef = MEDIA_SYNC_STAGING_PROJECT_REF,
): MediaSyncStagingConfig {
  let resolvedPath: string;
  try {
    resolvedPath = realpathSync(envFilePath);
  } catch {
    throw new Error("No fue posible leer el archivo .env.staging indicado");
  }
  if (path.basename(resolvedPath) !== ".env.staging") {
    throw new Error("El archivo de entorno debe llamarse exactamente .env.staging");
  }

  let parsed: Record<string, string>;
  try {
    parsed = parseDotenv(readFileSync(resolvedPath));
  } catch {
    throw new Error("No fue posible analizar .env.staging");
  }

  const supabaseUrlRaw = parsed.SUPABASE_URL?.trim();
  const serviceRoleKey = parsed.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrlRaw || !serviceRoleKey) throw new Error(".env.staging no contiene la configuración requerida de Supabase");
  if (supabaseUrlRaw.includes(MEDIA_SYNC_PRODUCTION_PROJECT_REF)) throw new Error("Destino de producción rechazado");

  let supabaseUrl: URL;
  try {
    supabaseUrl = new URL(supabaseUrlRaw);
  } catch {
    throw new Error("SUPABASE_URL de staging no es una URL válida");
  }
  const expectedHost = `${expectedProjectRef}.supabase.co`;
  if (
    supabaseUrl.protocol !== "https:" ||
    supabaseUrl.hostname !== expectedHost ||
    supabaseUrl.port ||
    supabaseUrl.pathname !== "/" ||
    supabaseUrl.search ||
    supabaseUrl.hash ||
    supabaseUrl.username ||
    supabaseUrl.password
  ) {
    throw new Error("SUPABASE_URL no coincide exactamente con el proyecto staging autorizado");
  }
  if (parsed.SUPABASE_PRODUCT_MEDIA_BUCKET && parsed.SUPABASE_PRODUCT_MEDIA_BUCKET !== MEDIA_SYNC_BUCKET) {
    throw new Error("SUPABASE_PRODUCT_MEDIA_BUCKET no coincide con product-media");
  }

  return {
    supabaseUrl: supabaseUrl.origin,
    serviceRoleKey,
    projectRef: expectedProjectRef,
  };
}
