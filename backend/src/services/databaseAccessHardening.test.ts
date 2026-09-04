import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const backendRoot = resolve(__dirname, "../..");
const migrationRoot = resolve(backendRoot, "prisma/migrations");
const migration = readFileSync(resolve(migrationRoot, "20260904090000_application_data_access_hardening/migration.sql"), "utf8");
const sql = migration.replace(/--[^\n]*/g, "");
const schema = readFileSync(resolve(backendRoot, "prisma/schema.prisma"), "utf8");

function protectedTables() {
  const list = sql.match(/application_tables\s+CONSTANT\s+TEXT\[\]\s*:=\s*ARRAY\[([^\]]+)\]/)?.[1];
  assert.ok(list, "The migration must use a fixed application-table allowlist");
  return [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

test("hardening covers every Prisma model and migration metadata exactly once", () => {
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);
  assert.equal(models.length, 19, "Review the security allowlist whenever the schema grows");
  assert.doesNotMatch(schema, /@@(?:map|schema)\s*\(/, "Mapped models need explicit table/schema handling");
  assert.deepEqual([...protectedTables()].sort(), [...models, "_prisma_migrations"].sort());
  assert.equal(new Set(protectedTables()).size, 20);
});

test("hardening enables default-deny RLS and revokes both direct and PUBLIC grants", () => {
  assert.match(sql, /FOREACH application_table IN ARRAY application_tables LOOP/);
  assert.match(sql, /ALTER TABLE %I\.%I ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE %I\.%I FROM PUBLIC/);
  assert.match(sql, /SELECT rolname FROM pg_roles WHERE rolname IN \('anon', 'authenticated'\)/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE %I\.%I FROM %I/);
  assert.match(sql, /IF has_table_privilege\(client_role, target_relation,/);
  assert.match(sql, /OR has_any_column_privilege\(client_role, target_relation,/);
  assert.match(sql, /RAISE EXCEPTION 'Application access hardening found remaining client privileges'/);
});

test("hardening is portable, atomic, fail-closed and uses identifier quoting", () => {
  assert.match(sql, /^\s*DO \$application_data_access\$/);
  assert.match(sql, /END;\s*\$application_data_access\$;\s*$/);
  assert.match(sql, /to_regclass\(format\('%I\.%I', 'public', application_table\)\)/);
  assert.match(sql, /IF target_relation IS NULL THEN\s*RAISE EXCEPTION/);
  assert.equal((sql.match(/EXECUTE format\(/g) || []).length, 3);
  assert.doesNotMatch(sql, /EXCEPTION\s+WHEN|IF\s+EXISTS\s+.*TABLE/i, "Never swallow failures or skip missing tables");
});

test("hardening preserves backend owner and service-role access and does not widen scope", () => {
  assert.doesNotMatch(sql, /FORCE ROW LEVEL SECURITY|DISABLE ROW LEVEL SECURITY|CREATE POLICY|ALTER POLICY/i);
  assert.doesNotMatch(sql, /\bGRANT\b|ALTER DEFAULT PRIVILEGES|ALL TABLES IN SCHEMA|\bCASCADE\b/i);
  assert.doesNotMatch(sql, /CREATE ROLE|ALTER ROLE|DROP ROLE|OWNER TO|SET ROLE|SET SESSION AUTHORIZATION/i);
  assert.doesNotMatch(sql, /'service_role'|'postgres'|'auth'|'storage'/);
  assert.doesNotMatch(sql, /\b(?:INSERT\s+INTO|UPDATE\s+"|DELETE\s+FROM|TRUNCATE\s+TABLE|DROP\s+TABLE)\b/i);
  assert.equal((sql.match(/'public'/g) || []).length, 4, "Every dynamic target must stay in public");
});

test("already-applied migrations 7–9 remain byte-for-byte unchanged", () => {
  const expected: Record<string, string> = {
    "20260831090000_product_families": "239756027d333272b70779cd832154f2571817e985d4da8f4bdf6261a215fbea",
    "20260901033000_editorial_website_content": "abdff24943e5c5d3806f3f9e8b2a932611e41a7c2d4ccc7ec13b3144e90e1baf",
    "20260902090000_editorial_media": "1b16f8f1be3e130f23e75955bb6a4db76a43e68e7d836c3284cd071a77f679a4",
  };
  for (const [directory, checksum] of Object.entries(expected)) {
    const bytes = readFileSync(resolve(migrationRoot, directory, "migration.sql"));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), checksum);
  }
});

// PGlite is already locked transitively through Prisma's development tooling.
// Loading it with require keeps this optional test helper out of runtime code.
// No dataDir, URLs, environment credentials or filesystem-backed database.
async function withMemoryDatabase(work: (db: any) => Promise<void>) {
  const { PGlite } = require("@electric-sql/pglite");
  const db = new PGlite();
  try {
    await work(db);
  } finally {
    await db.close();
  }
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

async function createFixture(db: any, options: { clientRoles?: boolean; omitLastTable?: boolean } = {}) {
  await db.exec("CREATE ROLE app_backend_owner; CREATE ROLE service_role BYPASSRLS;");
  if (options.clientRoles !== false) await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  const tables = options.omitLastTable ? protectedTables().slice(0, -1) : protectedTables();
  for (const table of tables) {
    const target = `public.${quoteIdentifier(table)}`;
    await db.exec(`
      CREATE TABLE ${target} (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO ${target} VALUES (1, 'synthetic-baseline');
      ALTER TABLE ${target} OWNER TO app_backend_owner;
      GRANT ALL PRIVILEGES ON TABLE ${target} TO service_role, PUBLIC;
    `);
    if (options.clientRoles !== false) {
      await db.exec(`GRANT ALL PRIVILEGES ON TABLE ${target} TO anon, authenticated;`);
      await db.exec(`GRANT SELECT(value), UPDATE(value) ON ${target} TO anon, authenticated;`);
    }
  }
}

async function asRole(db: any, role: string, work: () => Promise<void>) {
  await db.exec(`SET ROLE ${quoteIdentifier(role)}`);
  try {
    await work();
  } finally {
    await db.exec("RESET ROLE");
  }
}

test("embedded SQL denies anon/authenticated CRUD on all 20 tables and preserves backend roles", async () => {
  await withMemoryDatabase(async (db) => {
    await createFixture(db);
    await db.exec(migration);
    // A repeated execution remains safe; this does not amend Prisma history.
    await db.exec(migration);
    for (const table of protectedTables()) {
      const target = `public.${quoteIdentifier(table)}`;
      const state = await db.query("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = $1::regclass", [target]);
      assert.deepEqual(state.rows, [{ relrowsecurity: true, relforcerowsecurity: false }]);
      for (const role of ["anon", "authenticated"]) {
        const grants = await db.query(
          "SELECT has_table_privilege($1::name, $2::regclass, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') AS table_access, has_any_column_privilege($1::name, $2::regclass, 'SELECT, INSERT, UPDATE, REFERENCES') AS column_access",
          [role, target],
        );
        assert.deepEqual(grants.rows, [{ table_access: false, column_access: false }]);
        await asRole(db, role, async () => {
          for (const statement of [
            `SELECT * FROM ${target}`,
            `INSERT INTO ${target} VALUES (2, 'denied')`,
            `UPDATE ${target} SET value = 'denied' WHERE id = 1`,
            `DELETE FROM ${target} WHERE id = 1`,
            `TRUNCATE TABLE ${target}`,
          ]) await assert.rejects(db.exec(statement), (error: any) => error.code === "42501");
        });
      }
      for (const role of ["app_backend_owner", "service_role"]) {
        await asRole(db, role, async () => {
          assert.deepEqual((await db.query(`SELECT * FROM ${target}`)).rows, [{ id: 1, value: "synthetic-baseline" }]);
          await db.exec(`INSERT INTO ${target} VALUES (2, 'backend-fixture'); UPDATE ${target} SET value = 'updated-fixture' WHERE id = 2; DELETE FROM ${target} WHERE id = 2;`);
          assert.deepEqual((await db.query(`SELECT * FROM ${target}`)).rows, [{ id: 1, value: "synthetic-baseline" }]);
        });
      }
    }
  });
});

test("embedded row-level access remains default-deny if client grants are accidentally restored", async () => {
  await withMemoryDatabase(async (db) => {
    await createFixture(db);
    await db.exec(migration);
    await db.exec('GRANT ALL PRIVILEGES ON TABLE public."WebsiteContentSource" TO anon, authenticated;');
    for (const role of ["anon", "authenticated"]) {
      await asRole(db, role, async () => {
        assert.deepEqual((await db.query('SELECT * FROM public."WebsiteContentSource"')).rows, []);
        await assert.rejects(db.exec('INSERT INTO public."WebsiteContentSource" VALUES (2, \'denied\')'), (error: any) => error.code === "42501");
        await db.exec('UPDATE public."WebsiteContentSource" SET value = \'denied\'; DELETE FROM public."WebsiteContentSource";');
      });
    }
    assert.deepEqual((await db.query('SELECT * FROM public."WebsiteContentSource"')).rows, [{ id: 1, value: "synthetic-baseline" }]);
  });
});

test("embedded hardening succeeds without Supabase client roles", async () => {
  await withMemoryDatabase(async (db) => {
    await createFixture(db, { clientRoles: false });
    await db.exec(migration);
    const state = await db.query("SELECT count(*)::int AS protected FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity");
    assert.deepEqual(state.rows, [{ protected: 20 }]);
    await db.exec("CREATE ROLE unrelated_client;");
    await asRole(db, "unrelated_client", async () => {
      await assert.rejects(db.exec('SELECT * FROM public."User"'), (error: any) => error.code === "42501");
    });
  });
});

test("embedded hardening aborts atomically on missing tables or inherited client grants", async () => {
  await withMemoryDatabase(async (db) => {
    await createFixture(db, { omitLastTable: true });
    await assert.rejects(db.exec(migration), /requires every expected table/);
    assert.deepEqual((await db.query('SELECT relrowsecurity FROM pg_class WHERE oid = \'public."User"\'::regclass')).rows, [{ relrowsecurity: false }]);
  });
  await withMemoryDatabase(async (db) => {
    await createFixture(db);
    await db.exec('CREATE ROLE inherited_reader; GRANT SELECT ON public."User" TO inherited_reader; GRANT inherited_reader TO anon;');
    await assert.rejects(db.exec(migration), /remaining client privileges/);
    assert.deepEqual((await db.query('SELECT relrowsecurity FROM pg_class WHERE oid = \'public."User"\'::regclass')).rows, [{ relrowsecurity: false }]);
    assert.deepEqual((await db.query('SELECT has_table_privilege(\'anon\', \'public."User"\', \'SELECT\') AS access')).rows, [{ access: true }]);
  });
});
