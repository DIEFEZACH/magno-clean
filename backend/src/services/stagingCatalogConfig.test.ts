import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { rootCertificates } from "node:tls";
import test from "node:test";
import {
  APPLY_CONFIRMATION, PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF,
  loadApplyConfig, loadExportConfig, parseApplyArgs, parseExportArgs,
  type ApplyArgs, type ExportArgs,
} from "./stagingCatalog/config";

const CWD = "/virtual/backend";
const HASH = "a".repeat(64);
const TEST_PASSWORD = "fixture-only-password-not-a-real-credential";
const CA = rootCertificates[0];

function exportFlags(extra: string[] = []): string[] {
  return ["--environment", "production", "--project-ref", PRODUCTION_PROJECT_REF,
    "--env-file", ".env.production", "--ca-file", "production-ca.crt", ...extra];
}

function applyFlags(extra: string[] = []): string[] {
  return ["--environment", "staging", "--project-ref", STAGING_PROJECT_REF,
    "--snapshot", "snapshot.json", "--sha256", HASH, "--ca-file", "staging-ca.crt", "--dry-run", ...extra];
}

function replaceFlag(flags: string[], name: string, value: string): string[] {
  const next = flags.slice();
  next[next.indexOf(name) + 1] = value;
  return next;
}

function uri(ref: string, query = ""): string {
  return `postgresql://postgres:${TEST_PASSWORD}@db.${ref}.supabase.co:5432/postgres${query}`;
}

async function fixture(t: { after(fn: () => unknown): void }, environment: "production" | "staging" = "staging") {
  const directory = await mkdtemp(path.join(os.tmpdir(), "staging-catalog-config-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const ref = environment === "production" ? PRODUCTION_PROJECT_REF : STAGING_PROJECT_REF;
  const envFile = path.join(directory, environment === "production" ? ".env.production" : ".env.staging");
  const caFile = path.join(directory, "ca.crt");
  await writeFile(envFile, `DATABASE_URL=${uri(ref)}\nSUPABASE_URL=https://${ref}.supabase.co\n`, { mode: 0o600 });
  await writeFile(caFile, CA);
  const base = { projectRef: ref, envFile, caFile, outputDir: path.join(directory, "reports") };
  const apply: ApplyArgs = { ...base, environment: "staging", snapshot: path.join(directory, "snapshot.json"), sha256: HASH, mode: "dry-run" };
  const exportArgs: ExportArgs = { ...base, environment: "production" };
  return { directory, envFile, caFile, apply, exportArgs, ref };
}

test("catalog export parser requires explicit production/ref/env/CA and accepts generic optional counts", () => {
  const parsed = parseExportArgs(exportFlags(["--expected-count", "3", "--expected-active", "2", "--expected-inactive", "1"]), CWD);
  assert.deepEqual(parsed, {
    environment: "production", projectRef: PRODUCTION_PROJECT_REF,
    envFile: "/virtual/backend/.env.production", caFile: "/virtual/backend/production-ca.crt",
    outputDir: "/virtual/.local/staging-baseline", expectedCount: 3, expectedActive: 2, expectedInactive: 1,
  });
  assert.equal(parseExportArgs(exportFlags(), CWD).expectedCount, undefined);
  assert.equal(parseExportArgs(replaceFlag(exportFlags(), "--env-file", ".env"), CWD).envFile, "/virtual/backend/.env");
});

test("catalog parser rejects missing, duplicate, unknown and malformed flags without echoing arbitrary input", () => {
  assert.throws(() => parseExportArgs(exportFlags().filter((_, i) => i !== 4 && i !== 5), CWD), /env-file/);
  assert.throws(() => parseExportArgs(exportFlags(["--env-file", ".env"]), CWD), /duplicado/);
  assert.throws(() => parseExportArgs(exportFlags(["--dry-run"]), CWD), /no permitido/);
  assert.throws(() => parseExportArgs([...exportFlags(), "--output-dir"], CWD), /Falta/);
  assert.throws(() => parseExportArgs([...exportFlags(), TEST_PASSWORD], CWD), (e: Error) => !e.message.includes(TEST_PASSWORD));
  assert.throws(() => parseApplyArgs(applyFlags([`--${TEST_PASSWORD}`]), CWD), (e: Error) => !e.message.includes(TEST_PASSWORD));
  assert.throws(() => parseApplyArgs(applyFlags(["--snapshot", "other.json"]), CWD), /duplicado/);
});

test("catalog parsers reject wrong environments and refs before filesystem access", () => {
  assert.throws(() => parseExportArgs(replaceFlag(exportFlags(), "--environment", "staging"), CWD), /producción autorizado/);
  assert.throws(() => parseExportArgs(replaceFlag(exportFlags(), "--project-ref", STAGING_PROJECT_REF), CWD), /producción autorizado/);
  assert.throws(() => parseApplyArgs(replaceFlag(applyFlags(), "--project-ref", PRODUCTION_PROJECT_REF), CWD), /producción rechazada/);
  assert.throws(() => parseApplyArgs(replaceFlag(applyFlags(), "--environment", "production"), CWD), /staging autorizado/);
  assert.throws(() => parseApplyArgs(replaceFlag(applyFlags(), "--project-ref", "unknown"), CWD), /staging autorizado/);
  assert.throws(() => loadApplyConfig({ environment: "staging", projectRef: PRODUCTION_PROJECT_REF } as ApplyArgs), /staging autorizado/);
  assert.throws(() => loadExportConfig({ environment: "production", projectRef: STAGING_PROJECT_REF } as ExportArgs), /producción autorizado/);
});

test("catalog counts are optional, non-negative integers and mutually consistent", () => {
  for (const raw of ["-1", "1.5", "1e2", "02", "9007199254740992", "abc"]) {
    assert.throws(() => parseExportArgs(exportFlags(["--expected-count", raw]), CWD), /entero/);
  }
  assert.equal(parseExportArgs(exportFlags(["--expected-count", "0"]), CWD).expectedCount, 0);
  assert.throws(() => parseApplyArgs(applyFlags(["--expected-count", "2", "--expected-active", "3"]), CWD), /inconsistentes/);
  assert.throws(() => parseApplyArgs(applyFlags(["--expected-count", "3", "--expected-active", "2", "--expected-inactive", "2"]), CWD), /inconsistentes/);
});

test("catalog apply defaults to exact .env.staging and requires one digest and one mode", () => {
  const args = parseApplyArgs(applyFlags(), CWD);
  assert.equal(args.envFile, "/virtual/backend/.env.staging");
  assert.equal(args.mode, "dry-run");
  assert.equal(args.snapshot, "/virtual/backend/snapshot.json");
  assert.equal(args.sha256, HASH);
  assert.throws(() => parseApplyArgs(applyFlags().filter(x => x !== "--dry-run"), CWD), /exactamente uno/);
  assert.throws(() => parseApplyArgs(applyFlags(["--execute"]), CWD), /exactamente uno/);
  assert.throws(() => parseApplyArgs(applyFlags(["--checksum-file", "hash.txt"]), CWD), /exactamente uno/);
  assert.throws(() => parseApplyArgs(applyFlags().filter((_, i) => i !== 6 && i !== 7), CWD), /sha256/);
  assert.throws(() => parseApplyArgs(replaceFlag(applyFlags(), "--sha256", "invalid"), CWD), /64 caracteres/);
  const alternate = applyFlags().filter((_, i) => i !== 6 && i !== 7).concat(["--checksum-file", "snapshot.sha256"]);
  assert.equal(parseApplyArgs(alternate, CWD).checksumFile, "/virtual/backend/snapshot.sha256");
  assert.equal(parseApplyArgs(replaceFlag(applyFlags(), "--sha256", HASH.toUpperCase()), CWD).sha256, HASH);
});

test("catalog execute requires exact separate confirmation and dry-run rejects it", () => {
  const execute = applyFlags().map(x => x === "--dry-run" ? "--execute" : x);
  assert.throws(() => parseApplyArgs(execute, CWD), /requiere --confirm/);
  assert.throws(() => parseApplyArgs(execute.concat(["--confirm", "yes"]), CWD), /requiere --confirm/);
  assert.throws(() => parseApplyArgs(applyFlags(["--confirm", APPLY_CONFIRMATION]), CWD), /sólo puede/);
  assert.equal(parseApplyArgs(execute.concat(["--confirm", APPLY_CONFIRMATION]), CWD).mode, "execute");
});

test("catalog strict env file names block export staging/apply production and require explicit CA", () => {
  assert.throws(() => parseExportArgs(replaceFlag(exportFlags(), "--env-file", ".env.staging"), CWD), /entorno/);
  assert.throws(() => parseApplyArgs(applyFlags(["--env-file", ".env"]), CWD), /entorno/);
  assert.throws(() => parseApplyArgs(applyFlags(["--env-file", ".env.staging.backup"]), CWD), /entorno/);
  assert.throws(() => parseApplyArgs(applyFlags().filter((_, i) => i !== 8 && i !== 9), CWD), /ca-file/);
});

test("catalog loader builds explicit strict TLS and read-only connection, never a URL", async (t) => {
  const f = await fixture(t, "production");
  const value = loadExportConfig(f.exportArgs);
  assert.deepEqual(Object.keys(value).sort(), ["connection", "environment", "projectRef"]);
  assert.equal(value.connection.host, `db.${PRODUCTION_PROJECT_REF}.supabase.co`);
  assert.equal(value.connection.user, "postgres");
  assert.equal(value.connection.port, 5432);
  assert.equal(value.connection.database, "postgres");
  assert.equal(value.connection.password, TEST_PASSWORD);
  assert.equal(value.connection.options, "-c default_transaction_read_only=on");
  assert.equal(value.connection.connectionString, undefined);
  assert.deepEqual(value.connection.ssl, { rejectUnauthorized: true, ca: CA });
});

test("catalog isolated loader has no ambient env fallback and does not modify process.env", async (t) => {
  const f = await fixture(t);
  const before = { ...process.env };
  process.env.DATABASE_URL = uri(PRODUCTION_PROJECT_REF);
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
  await writeFile(f.envFile, `DATABASE_URL=${uri(STAGING_PROJECT_REF)}\nDATABASE_SSL_REJECT_UNAUTHORIZED=false\nSUPABASE_SERVICE_ROLE_KEY=fixture-unused\nJWT_ACCESS_SECRET=fixture-unused\n`);
  const config = loadApplyConfig(f.apply);
  assert.equal(config.connection.host, `db.${STAGING_PROJECT_REF}.supabase.co`);
  assert.equal(config.connection.options, "-c default_transaction_read_only=on");
  assert.equal((config.connection.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized, true);
  assert.equal(JSON.stringify(config).includes("fixture-unused"), false);
  assert.deepEqual({ ...process.env }, expectedEnvironment);
  await writeFile(f.envFile, "ADMIN_EMAIL=fixture-only\n");
  assert.throws(() => loadApplyConfig(f.apply), /DATABASE_URL está ausente/);
  assert.deepEqual({ ...process.env }, expectedEnvironment);
});

test("catalog loader accepts exact staging Session Pooler and percent-encoded password", async (t) => {
  const f = await fixture(t);
  const password = "fixture:p@ss/word?&%#";
  await writeFile(f.envFile, `DATABASE_URL=postgresql://postgres.${STAGING_PROJECT_REF}:${encodeURIComponent(password)}@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require\n`);
  const config = loadApplyConfig(f.apply);
  assert.equal(config.connection.user, `postgres.${STAGING_PROJECT_REF}`);
  assert.equal(config.connection.password, password);
  assert.equal(config.connection.host, "aws-0-us-west-1.pooler.supabase.com");
  assert.equal((config.connection.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized, true);
  assert.equal(loadApplyConfig({ ...f.apply, mode: "execute", confirm: APPLY_CONFIRMATION }).connection.options, "-c default_transaction_read_only=off");
});

test("catalog loader rejects production routing, transaction pooler, malformed URI and host spoofing", async (t) => {
  const f = await fixture(t);
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
    uri(STAGING_PROJECT_REF).replace(TEST_PASSWORD, "%5BYOUR-PASSWORD%5D"),
    `${uri(STAGING_PROJECT_REF)}#secret-fragment`,
    `postgres://postgres.${PRODUCTION_PROJECT_REF}:${TEST_PASSWORD}@aws-0-us-west-1.pooler.supabase.com:5432/postgres`,
    `postgres://postgres:${TEST_PASSWORD}@aws-0-us-west-1.pooler.supabase.com:5432/postgres`,
  ];
  for (const bad of invalid) {
    await writeFile(f.envFile, `DATABASE_URL=${JSON.stringify(bad)}\n`);
    assert.throws(() => loadApplyConfig(f.apply), (e: Error) => !e.message.includes(TEST_PASSWORD) && !e.message.includes(bad));
  }
});

test("catalog SSL URL whitelist never permits weakening TLS or routing overrides", async (t) => {
  const f = await fixture(t);
  for (const query of ["sslmode=require", "sslmode=verify-full", "sslmode=verify-ca", "ssl=true&sslrejectunauthorized=true"]) {
    await writeFile(f.envFile, `DATABASE_URL=${uri(STAGING_PROJECT_REF, `?${query}`)}\n`);
    assert.equal((loadApplyConfig(f.apply).connection.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized, true);
  }
  for (const query of ["sslmode=disable", "sslmode=no-verify", "sslmode=prefer", "ssl=false", "sslrejectunauthorized=false",
    "sslmode=require&sslmode=disable", "host=evil.invalid", "hostaddr=127.0.0.1", "options=-c%20ssl%3Doff",
    "user=other", "password=other", "port=6543", "sslrootcert=other.crt", "sslcert=other.crt", "pgbouncer=true", "connection_limit=4"]) {
    await writeFile(f.envFile, `DATABASE_URL=${uri(STAGING_PROJECT_REF, `?${query}`)}\n`);
    assert.throws(() => loadApplyConfig(f.apply), /parámetros/);
  }
});

test("catalog SUPABASE_URL, if provided, must be the exact authorized HTTPS project", async (t) => {
  const f = await fixture(t);
  for (const url of [`https://${PRODUCTION_PROJECT_REF}.supabase.co`, `http://${STAGING_PROJECT_REF}.supabase.co`,
    `https://${STAGING_PROJECT_REF}.supabase.co/other`, `https://${STAGING_PROJECT_REF}.supabase.co?x=1`, ""]) {
    await writeFile(f.envFile, `DATABASE_URL=${uri(STAGING_PROJECT_REF)}\nSUPABASE_URL=${url}\n`);
    assert.throws(() => loadApplyConfig(f.apply), /SUPABASE_URL/);
  }
});

test("catalog realpath validation rejects disguised production/staging env symlinks", async (t) => {
  const f = await fixture(t);
  const disguised = path.join(f.directory, "copy.env");
  await writeFile(disguised, `DATABASE_URL=${uri(STAGING_PROJECT_REF)}\n`);
  const alias = path.join(f.directory, "subdir.env.staging");
  await symlink(disguised, alias);
  assert.throws(() => loadApplyConfig({ ...f.apply, envFile: alias }), /archivo de entorno real/);
  assert.throws(() => loadExportConfig({ ...f.exportArgs, projectRef: PRODUCTION_PROJECT_REF, envFile: f.envFile }), /archivo de entorno real/);
});

test("catalog loader rejects missing/bad CA and never falls back to insecure TLS", async (t) => {
  const f = await fixture(t);
  assert.throws(() => loadApplyConfig({ ...f.apply, caFile: path.join(f.directory, "missing.crt") }), /CA PEM/);
  for (const content of ["", "not a cert", "-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----", `${CA}\n-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----`]) {
    await writeFile(f.caFile, content);
    assert.throws(() => loadApplyConfig(f.apply), /CA PEM/);
  }
  await writeFile(f.caFile, `${CA}\n${CA}`);
  assert.equal((loadApplyConfig(f.apply).connection.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized, true);
});

test("catalog loader rejects unauthorized execute even when parsing is bypassed", async (t) => {
  const f = await fixture(t);
  assert.throws(() => loadApplyConfig({ ...f.apply, mode: "execute" }), /no autorizado/);
  assert.throws(() => loadApplyConfig({ ...f.apply, mode: "unexpected" as ApplyArgs["mode"] }), /no autorizado/);
});
