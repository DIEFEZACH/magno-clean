import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { rootCertificates } from "node:tls";
import test from "node:test";
import {
  PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF, PRODUCTION_CONFIRMATION, STAGING_CONFIRMATION,
  ProductFamilyPlanConfigError, loadProductFamilyPlanConfig, parseProductFamilyPlanArgs,
  type ProductFamilyPlanArgs,
} from "./productFamilyPlan/config";

const CWD = path.resolve(os.tmpdir(), "product-family-parser-fixture");
const HASH = "a".repeat(64);
const TEST_PASSWORD = "fixture-only-password-not-a-real-credential";
const CA = rootCertificates[0];

function flags(environment: "production" | "staging" = "staging", extra: string[] = []): string[] {
  return ["--plan", "plan.json", "--sha256", HASH, "--environment", environment,
    "--project-ref", environment === "production" ? PRODUCTION_PROJECT_REF : STAGING_PROJECT_REF,
    "--env-file", "explicit.env", "--ca-file", "ca.crt", "--expected-families", "25",
    "--expected-variants", "79", "--expected-individuals", "16", ...extra];
}

function replaceFlag(argv: string[], name: string, value: string): string[] {
  const next = argv.slice();
  next[next.indexOf(name) + 1] = value;
  return next;
}

function removeFlag(argv: string[], name: string): string[] {
  const next = argv.slice();
  next.splice(next.indexOf(name), 2);
  return next;
}

function uri(ref: string, query = ""): string {
  return `postgresql://postgres:${TEST_PASSWORD}@db.${ref}.supabase.co:5432/postgres${query}`;
}

async function fixture(t: { after(fn: () => unknown): void }, environment: "production" | "staging" = "staging") {
  const directory = await mkdtemp(path.join(os.tmpdir(), "product-family-config-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const args = parseProductFamilyPlanArgs(flags(environment), directory);
  await writeFile(args.envFile, `DATABASE_URL=${uri(args.projectRef)}\nSUPABASE_URL=https://${args.projectRef}.supabase.co\n`, { mode: 0o600 });
  await writeFile(args.caFile, CA);
  return { directory, args };
}

function safeError(error: Error): boolean {
  assert.ok(error instanceof ProductFamilyPlanConfigError);
  assert.equal(error.message.includes(TEST_PASSWORD), false);
  assert.equal(error.message.includes("postgresql://"), false);
  return true;
}

test("family plan arguments require explicit plan, checksum, environment, project, files and counts; dry-run is the default", () => {
  const args = parseProductFamilyPlanArgs(flags(), CWD);
  assert.deepEqual(args, {
    plan: path.join(CWD, "plan.json"), sha256: HASH,
    environment: "staging", projectRef: STAGING_PROJECT_REF,
    envFile: path.join(CWD, "explicit.env"), caFile: path.join(CWD, "ca.crt"),
    expectedFamilies: 25, expectedVariants: 79, expectedIndividuals: 16,
    mode: "dry-run", confirm: undefined, preMigration: false,
  });
  assert.equal(parseProductFamilyPlanArgs(flags("production", ["--dry-run"]), CWD).mode, "dry-run");
  for (const name of ["plan", "sha256", "environment", "project-ref", "env-file", "ca-file", "expected-families", "expected-variants", "expected-individuals"]) {
    assert.throws(() => parseProductFamilyPlanArgs(removeFlag(flags(), `--${name}`), CWD), /obligatorio/);
  }
});

test("family plan parser refuses unknown, duplicate and malformed arguments without reflecting arbitrary values", () => {
  assert.throws(() => parseProductFamilyPlanArgs(flags("staging", ["--plan", "other.json"]), CWD), /duplicado/);
  assert.throws(() => parseProductFamilyPlanArgs(flags("staging", ["--execute", "--dry-run"]), CWD), /mutuamente/);
  assert.throws(() => parseProductFamilyPlanArgs(flags("staging", ["--dry-run", "--dry-run"]), CWD), /duplicado/);
  for (const extra of [[`--${TEST_PASSWORD}`], [TEST_PASSWORD], ["--env-file=secret"], ["--confirm"], ["--checksum-file", "hash.txt"]]) {
    assert.throws(() => parseProductFamilyPlanArgs(flags("staging", extra), CWD), safeError);
  }
  assert.throws(() => parseProductFamilyPlanArgs(replaceFlag(flags(), "--env-file", "   "), CWD), /Falta/);
  assert.throws(() => parseProductFamilyPlanArgs(replaceFlag(flags(), "--env-file", "bad\0path"), CWD), /ruta explícita/);
});

test("family plan rejects wrong environments, mixed project references and environment-specific confirmation tokens", () => {
  for (const environment of ["staging", "production"] as const) {
    const other = environment === "staging" ? PRODUCTION_PROJECT_REF : STAGING_PROJECT_REF;
    assert.throws(() => parseProductFamilyPlanArgs(replaceFlag(flags(environment), "--project-ref", other), CWD), /entorno y Project Ref/);
    assert.throws(() => parseProductFamilyPlanArgs(replaceFlag(flags(environment), "--project-ref", "unknown"), CWD), /entorno y Project Ref/);
    assert.throws(() => parseProductFamilyPlanArgs(flags(environment, ["--execute"]), CWD), /requiere --confirm/);
    const correct = environment === "staging" ? STAGING_CONFIRMATION : PRODUCTION_CONFIRMATION;
    const incorrect = environment === "staging" ? PRODUCTION_CONFIRMATION : STAGING_CONFIRMATION;
    assert.throws(() => parseProductFamilyPlanArgs(flags(environment, ["--execute", "--confirm", incorrect]), CWD), /requiere --confirm/);
    assert.throws(() => parseProductFamilyPlanArgs(flags(environment, ["--execute", "--confirm", TEST_PASSWORD]), CWD), safeError);
    assert.throws(() => parseProductFamilyPlanArgs(flags(environment, ["--confirm", correct]), CWD), /sólo puede/);
    assert.equal(parseProductFamilyPlanArgs(flags(environment, ["--execute", "--confirm", correct]), CWD).mode, "execute");
  }
  for (const environment of ["local", "Production", "STAGING", TEST_PASSWORD]) {
    assert.throws(() => parseProductFamilyPlanArgs(replaceFlag(flags(), "--environment", environment), CWD), safeError);
  }
});

test("family plan checksum syntax and required count expectations are strict", () => {
  assert.equal(parseProductFamilyPlanArgs(replaceFlag(flags(), "--sha256", HASH.toUpperCase()), CWD).sha256, HASH);
  for (const value of ["a".repeat(63), "a".repeat(65), "z".repeat(64), "a ".repeat(32), TEST_PASSWORD]) {
    assert.throws(() => parseProductFamilyPlanArgs(replaceFlag(flags(), "--sha256", value), CWD), /64 caracteres/);
  }
  for (const name of ["--expected-families", "--expected-variants", "--expected-individuals"]) {
    for (const value of ["-1", "1.5", "1e2", "01", "9007199254740992", "NaN"]) {
      assert.throws(() => parseProductFamilyPlanArgs(replaceFlag(flags(), name, value), CWD), /entero no negativo/);
    }
  }
  assert.equal(parseProductFamilyPlanArgs(replaceFlag(flags(), "--expected-individuals", "0"), CWD).expectedIndividuals, 0);
});

test("pre-migration mode is an explicit dry-run-only option", () => {
  for (const environment of ["staging", "production"] as const) {
    assert.equal(parseProductFamilyPlanArgs(flags(environment, ["--pre-migration"]), CWD).preMigration, true);
    const confirm = environment === "staging" ? STAGING_CONFIRMATION : PRODUCTION_CONFIRMATION;
    assert.throws(() => parseProductFamilyPlanArgs(flags(environment, ["--pre-migration", "--execute", "--confirm", confirm]), CWD), /sólo puede usarse en dry-run/);
  }
});

test("family plan config builds an explicit strict TLS read-only connection for both environments", async (t) => {
  for (const environment of ["staging", "production"] as const) {
    const { args } = await fixture(t, environment);
    const config = loadProductFamilyPlanConfig(args);
    assert.deepEqual(Object.keys(config).sort(), ["connection", "environment", "projectRef"]);
    assert.equal(config.environment, environment);
    assert.equal(config.connection.host, `db.${args.projectRef}.supabase.co`);
    assert.equal(config.connection.user, "postgres");
    assert.equal(config.connection.port, 5432);
    assert.equal(config.connection.database, "postgres");
    assert.equal(config.connection.password, TEST_PASSWORD);
    assert.equal(config.connection.options, "-c default_transaction_read_only=on");
    assert.equal(config.connection.connectionString, undefined);
    assert.equal(config.connection.application_name, "magno-clean-product-family-plan");
    assert.deepEqual(config.connection.ssl, { rejectUnauthorized: true, ca: CA });
    const confirm = environment === "production" ? PRODUCTION_CONFIRMATION : STAGING_CONFIRMATION;
    assert.equal(loadProductFamilyPlanConfig({ ...args, mode: "execute", confirm }).connection.options, "-c default_transaction_read_only=off");
  }
});

test("family plan loader rechecks authorization before filesystem reads even when argument parsing is bypassed", () => {
  const args = parseProductFamilyPlanArgs(flags(), CWD);
  const mutations: Partial<ProductFamilyPlanArgs>[] = [
    { environment: "production" }, { projectRef: PRODUCTION_PROJECT_REF }, { mode: "execute" },
    { mode: "execute", confirm: PRODUCTION_CONFIRMATION },
    { mode: "execute", confirm: STAGING_CONFIRMATION, preMigration: true },
    { mode: "unexpected" as ProductFamilyPlanArgs["mode"] }, { confirm: STAGING_CONFIRMATION },
    { envFile: undefined }, { envFile: "" }, { caFile: "" }, { plan: "" }, { sha256: "" },
    { expectedFamilies: undefined }, { expectedVariants: -1 }, { expectedIndividuals: NaN },
    { preMigration: undefined },
  ];
  for (const mutation of mutations) {
    assert.throws(() => loadProductFamilyPlanConfig({ ...args, ...mutation }), (error: Error) => {
      assert.equal(error.message.includes("leer o analizar"), false);
      return safeError(error);
    });
  }
});

test("family plan env loading never falls back to ambient variables, another file, or dotenv expansion", async (t) => {
  const { directory, args } = await fixture(t);
  const before = { ...process.env };
  process.env.DATABASE_URL = uri(PRODUCTION_PROJECT_REF);
  process.env.SUPABASE_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
  process.env.PGHOST = "ambient-host.invalid";
  process.env.PGUSER = "ambient-user";
  process.env.PGPASSWORD = "ambient-fixture-password";
  process.env.PGOPTIONS = "-c default_transaction_read_only=off";
  process.env.PGSSLMODE = "disable";
  t.after(() => {
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  });
  const expectedEnvironment = { ...process.env };
  await writeFile(args.envFile, `DATABASE_URL=${uri(STAGING_PROJECT_REF)}\nDATABASE_SSL_REJECT_UNAUTHORIZED=false\nSUPABASE_SERVICE_ROLE_KEY=fixture-unused-role\nJWT_ACCESS_SECRET=fixture-unused-jwt\n`);
  const config = loadProductFamilyPlanConfig(args);
  assert.equal(config.connection.host, `db.${STAGING_PROJECT_REF}.supabase.co`);
  assert.equal(config.connection.options, "-c default_transaction_read_only=on");
  assert.deepEqual(config.connection.ssl, { rejectUnauthorized: true, ca: CA });
  assert.equal(JSON.stringify(config).includes("fixture-unused"), false);
  assert.deepEqual({ ...process.env }, expectedEnvironment);
  await writeFile(path.join(directory, ".env"), `DATABASE_URL=${uri(STAGING_PROJECT_REF)}\n`);
  await writeFile(path.join(directory, ".env.staging"), `DATABASE_URL=${uri(STAGING_PROJECT_REF)}\n`);
  await writeFile(args.envFile, "ADMIN_EMAIL=fixture-only\n");
  assert.throws(() => loadProductFamilyPlanConfig(args), /DATABASE_URL está ausente/);
  assert.throws(() => loadProductFamilyPlanConfig({ ...args, envFile: path.join(directory, "missing.env") }), /archivo de entorno explícito/);
  await writeFile(args.envFile, 'DATABASE_URL=${DATABASE_URL}\n');
  assert.throws(() => loadProductFamilyPlanConfig(args), /formato PostgreSQL/);
  assert.deepEqual({ ...process.env }, expectedEnvironment);
});

test("family plan accepts session pooler 5432 with exact reference and percent-encoded credentials", async (t) => {
  for (const environment of ["staging", "production"] as const) {
    const { args } = await fixture(t, environment);
    const password = "fixture:p@ss/word?&%#";
    await writeFile(args.envFile, `DATABASE_URL=postgresql://postgres.${args.projectRef}:${encodeURIComponent(password)}@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require\n`);
    const config = loadProductFamilyPlanConfig(args);
    assert.equal(config.connection.user, `postgres.${args.projectRef}`);
    assert.equal(config.connection.password, password);
    assert.equal(config.connection.host, "aws-0-us-west-1.pooler.supabase.com");
    assert.deepEqual(config.connection.ssl, { rejectUnauthorized: true, ca: CA });
  }
});

test("family plan rejects cross-environment database routes, transaction poolers and spoofed hosts", async (t) => {
  const { args } = await fixture(t);
  const invalid = [
    uri(PRODUCTION_PROJECT_REF),
    uri(STAGING_PROJECT_REF).replace(":5432/", ":6543/"),
    uri(STAGING_PROJECT_REF).replace(":5432/", "/"),
    uri(STAGING_PROJECT_REF).replace("/postgres", "/other"),
    uri(STAGING_PROJECT_REF).replace("postgresql:", "https:"),
    uri(STAGING_PROJECT_REF).replace(".supabase.co:", ".supabase.co.evil.invalid:"),
    uri(STAGING_PROJECT_REF).replace("postgres:", "other:"),
    uri(STAGING_PROJECT_REF).replace(TEST_PASSWORD, ""),
    uri(STAGING_PROJECT_REF).replace(TEST_PASSWORD, "%ZZ"),
    uri(STAGING_PROJECT_REF).replace(TEST_PASSWORD, "%00fixture"),
    uri(STAGING_PROJECT_REF).replace(TEST_PASSWORD, "%5BYOUR-PASSWORD%5D"),
    `${uri(STAGING_PROJECT_REF)}#fixture-secret-fragment`,
    `postgres://postgres.${PRODUCTION_PROJECT_REF}:${TEST_PASSWORD}@aws-0-us-west-1.pooler.supabase.com:5432/postgres`,
    `postgres://postgres:${TEST_PASSWORD}@aws-0-us-west-1.pooler.supabase.com:5432/postgres`,
    `postgres://postgres.${STAGING_PROJECT_REF}:${TEST_PASSWORD}@aws-0-us-west-1.pooler.supabase.com.evil.invalid:5432/postgres`,
  ];
  for (const bad of invalid) {
    await writeFile(args.envFile, `DATABASE_URL=${JSON.stringify(bad)}\n`);
    assert.throws(() => loadProductFamilyPlanConfig(args), safeError);
  }
  const production = await fixture(t, "production");
  await writeFile(production.args.envFile, `DATABASE_URL=${uri(STAGING_PROJECT_REF)}\n`);
  assert.throws(() => loadProductFamilyPlanConfig(production.args), /host y usuario/);
});

test("family plan validates SUPABASE_URL independently and rejects conflicting identity in either URL", async (t) => {
  const { args } = await fixture(t);
  for (const value of [`https://${PRODUCTION_PROJECT_REF}.supabase.co`, `http://${STAGING_PROJECT_REF}.supabase.co`,
    `https://${STAGING_PROJECT_REF}.supabase.co/other`, `https://${STAGING_PROJECT_REF}.supabase.co?x=1`,
    `https://${STAGING_PROJECT_REF}.supabase.co.evil.invalid`, `https://user:password@${STAGING_PROJECT_REF}.supabase.co`, ""]) {
    await writeFile(args.envFile, `DATABASE_URL=${uri(STAGING_PROJECT_REF)}\nSUPABASE_URL=${value}\n`);
    assert.throws(() => loadProductFamilyPlanConfig(args), /SUPABASE_URL/);
  }
  await writeFile(args.envFile, `DATABASE_URL=${uri(PRODUCTION_PROJECT_REF)}\nSUPABASE_URL=https://${STAGING_PROJECT_REF}.supabase.co\n`);
  assert.throws(() => loadProductFamilyPlanConfig(args), /host y usuario/);
  await writeFile(args.envFile, `SUPABASE_URL=https://${STAGING_PROJECT_REF}.supabase.co\n`);
  assert.throws(() => loadProductFamilyPlanConfig(args), /DATABASE_URL está ausente/);
});

test("family plan identities come from resolved file contents, not misleading filenames or symlink names", async (t) => {
  const { directory, args } = await fixture(t);
  const productionFile = path.join(directory, "production-fixture.env");
  await writeFile(productionFile, `DATABASE_URL=${uri(PRODUCTION_PROJECT_REF)}\n`);
  const alias = path.join(directory, ".env.staging");
  await symlink(productionFile, alias);
  assert.throws(() => loadProductFamilyPlanConfig({ ...args, envFile: alias }), /host y usuario/);
  assert.throws(() => loadProductFamilyPlanConfig({ ...args, envFile: directory }), /archivo de entorno explícito/);
  await writeFile(args.envFile, "x".repeat(256 * 1024 + 1));
  assert.throws(() => loadProductFamilyPlanConfig(args), /archivo de entorno explícito/);
});

test("family plan TLS cannot be weakened or overridden through URL connection parameters", async (t) => {
  const { args } = await fixture(t);
  for (const query of ["sslmode=require", "sslmode=verify-full", "sslmode=verify-ca", "ssl=true&sslrejectunauthorized=true"]) {
    await writeFile(args.envFile, `DATABASE_URL=${uri(STAGING_PROJECT_REF, `?${query}`)}\n`);
    assert.deepEqual(loadProductFamilyPlanConfig(args).connection.ssl, { rejectUnauthorized: true, ca: CA });
  }
  for (const query of ["sslmode=disable", "sslmode=no-verify", "sslmode=prefer", "ssl=false", "sslrejectunauthorized=false",
    "sslmode=require&sslmode=disable", "host=evil.invalid", "hostaddr=127.0.0.1", "options=-c%20default_transaction_read_only%3Doff",
    "user=other", "password=other", "port=6543", "sslrootcert=other.crt", "sslcert=other.crt", "pgbouncer=true", "connection_limit=4"]) {
    await writeFile(args.envFile, `DATABASE_URL=${uri(STAGING_PROJECT_REF, `?${query}`)}\n`);
    assert.throws(() => loadProductFamilyPlanConfig(args), /parámetros/);
  }
});

test("family plan rejects missing or invalid CA content without exposing raw certificate errors", async (t) => {
  const { directory, args } = await fixture(t);
  assert.throws(() => loadProductFamilyPlanConfig({ ...args, caFile: path.join(directory, "missing.crt") }), /CA PEM/);
  assert.throws(() => loadProductFamilyPlanConfig({ ...args, caFile: directory }), /CA PEM/);
  for (const content of ["", TEST_PASSWORD, "-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----",
    `${CA}\n-----BEGIN PRIVATE KEY-----\n${TEST_PASSWORD}\n-----END PRIVATE KEY-----`, "x".repeat(256 * 1024 + 1)]) {
    await writeFile(args.caFile, content);
    assert.throws(() => loadProductFamilyPlanConfig(args), safeError);
  }
  await writeFile(args.caFile, `${CA}\n${CA}`);
  assert.equal((loadProductFamilyPlanConfig(args).connection.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized, true);
});

test("family plan config and parser produce no logs even when input contains secrets", async (t) => {
  const { args } = await fixture(t);
  const captured: unknown[][] = [];
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    t.mock.method(console, method, (...values: unknown[]) => captured.push(values));
  }
  loadProductFamilyPlanConfig(args);
  await writeFile(args.envFile, `DATABASE_URL=invalid-${TEST_PASSWORD}\nSUPABASE_SERVICE_ROLE_KEY=fixture-unused-role\nJWT_ACCESS_SECRET=fixture-unused-jwt\n`);
  assert.throws(() => loadProductFamilyPlanConfig(args), safeError);
  assert.throws(() => parseProductFamilyPlanArgs(flags("production", ["--execute", "--confirm", TEST_PASSWORD]), CWD), safeError);
  assert.deepEqual(captured, []);
});
