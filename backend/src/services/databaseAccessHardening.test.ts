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
const clients = ["anon", "authenticated", "service_role"];
function allowlist(name: string): string[] {
  const list = sql.match(new RegExp(`${name}\\s+CONSTANT\\s+TEXT\\[\\]\\s*:=\\s*ARRAY\\[([^\\]]+)\\]`))?.[1];
  assert.ok(list);
  return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}
const tables = allowlist("application_tables");
const routines = allowlist("application_functions");
const q = (value: string) => `"${value.replace(/"/g, '""')}"`;
const relation = (name: string) => `public.${q(name)}`;
const routine = (name: string) => `${relation(name)}()`;

test("hardening covers the exact 19 Prisma models, migration history and three trigger functions", () => {
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
  assert.equal(models.length, 19);
  assert.doesNotMatch(schema, /@@(?:map|schema)\s*\(/);
  assert.deepEqual([...tables].sort(), [...models, "_prisma_migrations"].sort());
  assert.equal(new Set(tables).size, 20);
  assert.equal(new Set(routines).size, 3);
  assert.match(sql, /REVOKE ALL PRIVILEGES \(%s\) ON TABLE/);
  assert.match(sql, /TRUNCATE, REFERENCES, TRIGGER, MAINTAIN/);
  assert.match(sql, /has_any_column_privilege/);
  assert.match(sql, /has_function_privilege/);
});

test("hardening has one atomic statement, explicit creator scope and no runtime or managed-object changes", () => {
  assert.match(sql, /^\s*DO \$application_data_access\$/);
  assert.match(sql, /END;\s*\$application_data_access\$;\s*$/);
  assert.match(sql, /current_user <> 'postgres' OR session_user <> 'postgres'/);
  assert.match(sql, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;/);
  assert.match(sql, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES/);
  assert.match(sql, /ARRAY\['TABLES', 'SEQUENCES', 'FUNCTIONS'\]/);
  assert.doesNotMatch(sql, /FORCE ROW LEVEL SECURITY|DISABLE ROW LEVEL SECURITY|CREATE POLICY|ALTER POLICY|DROP POLICY/i);
  assert.doesNotMatch(sql, /\bGRANT\b|\bCASCADE\b|ALL TABLES IN SCHEMA/i);
  assert.doesNotMatch(sql, /CREATE ROLE|ALTER ROLE|DROP ROLE|OWNER TO|SET ROLE|SET SESSION AUTHORIZATION/i);
  assert.doesNotMatch(sql, /IN SCHEMA (?:auth|storage|extensions)|'auth'|'storage'|'extensions'|'supabase_admin'/i);
  assert.doesNotMatch(sql, /\b(?:INSERT\s+INTO|UPDATE\s+"|DELETE\s+FROM|TRUNCATE\s+TABLE|DROP\s+TABLE)\b/i);
  assert.doesNotMatch(sql, /EXCEPTION\s+WHEN/i);
});

test("already-applied migrations 7–9 remain byte-for-byte unchanged", () => {
  const expected: Record<string, string> = {
    "20260831090000_product_families": "239756027d333272b70779cd832154f2571817e985d4da8f4bdf6261a215fbea",
    "20260901033000_editorial_website_content": "abdff24943e5c5d3806f3f9e8b2a932611e41a7c2d4ccc7ec13b3144e90e1baf",
    "20260902090000_editorial_media": "1b16f8f1be3e130f23e75955bb6a4db76a43e68e7d836c3284cd071a77f679a4",
  };
  for (const [directory, checksum] of Object.entries(expected)) {
    assert.equal(createHash("sha256").update(readFileSync(resolve(migrationRoot, directory, "migration.sql"))).digest("hex"), checksum);
  }
});

// Already locked through Prisma; no dependency change. No dataDir, credentials,
// network or persistent DB. Tests fail rather than silently skipping this helper.
async function memory(work: (db: any) => Promise<void>) {
  const { PGlite } = require("@electric-sql/pglite");
  const db = new PGlite();
  try { await work(db); } finally { await db.close(); }
}
async function asRole(db: any, role: string, work: () => Promise<void>) {
  await db.exec(`SET ROLE ${q(role)}`);
  try { await work(); } finally { await db.exec("RESET ROLE"); }
}
const denied = (promise: Promise<any>) => assert.rejects(promise, (e: any) => e.code === "42501");
async function snapshot(db: any) {
  return (await db.query(`SELECT json_build_object(
    'relations', (SELECT json_agg(x ORDER BY x.oid) FROM
      (SELECT oid, relname, relowner, relacl, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace) x),
    'columns', (SELECT json_agg(x ORDER BY x.attrelid,x.attnum) FROM
      (SELECT attrelid,attnum,attacl FROM pg_attribute WHERE attrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)) x),
    'functions', (SELECT json_agg(x ORDER BY x.oid) FROM
      (SELECT oid,proacl FROM pg_proc WHERE pronamespace='public'::regnamespace) x),
    'defaults', (SELECT json_agg(x ORDER BY x.oid) FROM pg_default_acl x),
    'policies', (SELECT json_agg(x ORDER BY x.oid) FROM pg_policy x)
  ) AS state`)).rows[0].state;
}
async function fixture(db: any, withClients = true) {
  if (withClients) await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;");
  // Model the real creator's schema-specific Supabase defaults, not a synthetic
  // owner substituted after creation. postgres is also the fixture connection.
  if (withClients) for (const kind of ["TABLES", "SEQUENCES", "FUNCTIONS"]) {
    await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ${kind} TO anon, authenticated, service_role;`);
  }
  for (const name of tables) {
    await db.exec(`CREATE TABLE ${relation(name)} (id TEXT PRIMARY KEY, value TEXT NOT NULL, status TEXT DEFAULT 'DRAFT', "revisionId" TEXT DEFAULT '1');
      INSERT INTO ${relation(name)}(id,value) VALUES ('1','synthetic-baseline');
      GRANT ALL ON ${relation(name)} TO PUBLIC;
      GRANT SELECT(value), INSERT(value), UPDATE(value), REFERENCES(value) ON ${relation(name)} TO PUBLIC;`);
    if (withClients) await db.exec(`GRANT SELECT(value), INSERT(value), UPDATE(value), REFERENCES(value) ON ${relation(name)} TO anon,authenticated,service_role WITH GRANT OPTION;`);
  }
  const definitions = new Map<string, string>();
  for (const directory of ["20260901033000_editorial_website_content", "20260902090000_editorial_media"]) {
    const source = readFileSync(resolve(migrationRoot, directory, "migration.sql"), "utf8");
    for (const match of source.matchAll(/CREATE(?: OR REPLACE)? FUNCTION "([^"]+)"\(\)[\s\S]*?\$\$;/g)) definitions.set(match[1], match[0]);
  }
  assert.deepEqual([...definitions.keys()].sort(), [...routines].sort());
  for (const definition of definitions.values()) await db.exec(definition);
  await db.exec(`CREATE TRIGGER fixture_revision_guard BEFORE UPDATE OR DELETE ON public."WebsiteContentRevision"
    FOR EACH ROW EXECUTE FUNCTION public.prevent_published_website_content_revision_mutation();
    CREATE TRIGGER fixture_media_guard BEFORE INSERT OR UPDATE OR DELETE ON public."WebsiteContentMedia"
    FOR EACH ROW EXECUTE FUNCTION public.prevent_published_website_content_media_mutation();`);
}

test("actual SQL denies all three Data API roles on 20 tables/columns while postgres CRUD survives", async () => {
  await memory(async (db) => {
    await fixture(db);
    await db.exec(migration);
    await db.exec(migration); // idempotent SQL; no Prisma history amendments
    for (const name of tables) {
      const target = relation(name);
      assert.deepEqual((await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass", [target])).rows,
        [{ relrowsecurity: true, relforcerowsecurity: false }]);
      for (const role of clients) {
        assert.deepEqual((await db.query("SELECT has_table_privilege($1::name,$2::regclass,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS t, has_any_column_privilege($1::name,$2::regclass,'SELECT,INSERT,UPDATE,REFERENCES') AS c", [role, target])).rows, [{ t: false, c: false }]);
        await asRole(db, role, async () => {
          for (const statement of [`SELECT * FROM ${target}`, `SELECT value FROM ${target}`, `INSERT INTO ${target}(id,value) VALUES('2','denied')`, `UPDATE ${target} SET value='denied'`, `DELETE FROM ${target}`, `TRUNCATE TABLE ${target}`]) await denied(db.exec(statement));
        });
      }
      await db.exec(`INSERT INTO ${target}(id,value) VALUES('2','owner'); UPDATE ${target} SET value='updated' WHERE id='2'; DELETE FROM ${target} WHERE id='2';`);
      assert.equal((await db.query(`SELECT value FROM ${target}`)).rows[0].value, "synthetic-baseline");
    }
  });
});

test("current trigger functions lose client EXECUTE and preserve real PUBLISHED immutability", async () => {
  await memory(async (db) => {
    await fixture(db);
    await db.exec(migration);
    for (const name of routines) for (const role of clients) {
      assert.equal((await db.query("SELECT has_function_privilege($1::name,$2::regprocedure,'EXECUTE') AS allowed", [role, routine(name)])).rows[0].allowed, false);
      await asRole(db, role, async () => { await denied(db.exec(`SELECT ${routine(name)}`)); });
    }
    await db.exec('UPDATE public."WebsiteContentRevision" SET status=\'PUBLISHED\' WHERE id=\'1\';');
    for (const statement of ['UPDATE public."WebsiteContentRevision" SET value=\'denied\' WHERE id=\'1\'', 'DELETE FROM public."WebsiteContentRevision" WHERE id=\'1\'', 'UPDATE public."WebsiteContentMedia" SET value=\'denied\' WHERE id=\'1\'', 'DELETE FROM public."WebsiteContentMedia" WHERE id=\'1\'']) {
      await assert.rejects(db.exec(statement), /immutable/);
    }
    assert.equal((await db.query('SELECT value FROM public."WebsiteContentRevision"')).rows[0].value, "synthetic-baseline");
  });
});

test("RLS remains a second row-level barrier for anon/authenticated after accidental grants", async () => {
  await memory(async (db) => {
    await fixture(db); await db.exec(migration);
    await db.exec('GRANT ALL ON public."WebsiteContentSource" TO anon,authenticated;');
    for (const role of clients.slice(0, 2)) await asRole(db, role, async () => {
      assert.deepEqual((await db.query('SELECT * FROM public."WebsiteContentSource"')).rows, []);
      await denied(db.exec('INSERT INTO public."WebsiteContentSource"(id,value) VALUES(\'2\',\'denied\')'));
      await db.exec('UPDATE public."WebsiteContentSource" SET value=\'denied\'; DELETE FROM public."WebsiteContentSource";');
    });
    assert.equal((await db.query('SELECT value FROM public."WebsiteContentSource"')).rows[0].value, "synthetic-baseline");
  });
});

test("postgres future tables, views, sequences and invoker/definer functions have no client grants", async () => {
  await memory(async (db) => {
    await fixture(db); await db.exec(migration);
    await db.exec(`CREATE TABLE public.future_table(id INTEGER); INSERT INTO public.future_table VALUES(7);
      CREATE VIEW public.future_view AS SELECT * FROM public.future_table;
      CREATE MATERIALIZED VIEW public.future_materialized AS SELECT * FROM public.future_table;
      CREATE SEQUENCE public.future_sequence;
      CREATE FUNCTION public.future_rpc() RETURNS INTEGER LANGUAGE SQL AS 'SELECT 7';
      CREATE FUNCTION public.future_rpc(integer) RETURNS INTEGER LANGUAGE SQL SECURITY DEFINER AS 'SELECT $1';`);
    for (const role of clients) await asRole(db, role, async () => {
      for (const statement of ["SELECT * FROM public.future_table", "SELECT * FROM public.future_view", "SELECT * FROM public.future_materialized", "SELECT * FROM public.future_sequence", "SELECT nextval('public.future_sequence')", "SELECT currval('public.future_sequence')", "SELECT setval('public.future_sequence',9)", "SELECT public.future_rpc()", "SELECT public.future_rpc(7)"]) await denied(db.exec(statement));
    });
    assert.equal((await db.query("SELECT public.future_rpc(7) AS value")).rows[0].value, 7);
    assert.equal((await db.query("SELECT * FROM public.future_view")).rows[0].id, 7);
    await db.exec("SELECT nextval('public.future_sequence'); INSERT INTO public.future_table VALUES(8);");
    // Default ACLs do not turn on RLS automatically; denial on newly created
    // tables is ACL-based until their own reviewed migration enables RLS.
    assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.future_table'::regclass")).rows[0].relrowsecurity, false);
  });
});

test("managed existing ACLs and other creators/storage defaults remain identical", async () => {
  await memory(async (db) => {
    await fixture(db);
    await db.exec(`CREATE ROLE supabase_managed_creator; CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions; CREATE SCHEMA graphql_public;
      GRANT USAGE ON SCHEMA auth,storage,extensions,graphql_public TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_managed_creator IN SCHEMA public GRANT ALL ON TABLES TO service_role;
      CREATE TABLE storage.fixture_objects(id INTEGER); INSERT INTO storage.fixture_objects VALUES(1);
      CREATE TABLE auth.fixture_users(id INTEGER); GRANT SELECT ON auth.fixture_users TO service_role;
      CREATE FUNCTION extensions.fixture_managed() RETURNS INTEGER LANGUAGE SQL AS 'SELECT 42';
      ALTER EXTENSION plpgsql ADD FUNCTION extensions.fixture_managed();
      CREATE FUNCTION graphql_public.fixture_resolver() RETURNS INTEGER LANGUAGE SQL AS 'SELECT 42';`);
    const outside = async () => (await db.query(`SELECT json_build_object(
      'r',(SELECT json_agg(x ORDER BY x.oid) FROM (SELECT oid,relacl,relowner,relrowsecurity FROM pg_class WHERE relnamespace IN ('auth'::regnamespace,'storage'::regnamespace,'extensions'::regnamespace,'graphql_public'::regnamespace)) x),
      'f',(SELECT json_agg(x ORDER BY x.oid) FROM (SELECT oid,proacl,proowner FROM pg_proc WHERE pronamespace IN ('auth'::regnamespace,'storage'::regnamespace,'extensions'::regnamespace,'graphql_public'::regnamespace)) x),
      'd',(SELECT json_agg(x ORDER BY x.oid) FROM pg_default_acl x WHERE defaclrole <> 'postgres'::regrole OR defaclnamespace NOT IN (0,'public'::regnamespace))
    ) AS state`)).rows[0].state;
    const before = await outside(); await db.exec(migration); assert.deepEqual(await outside(), before);
    await db.exec("CREATE FUNCTION storage.future_storage() RETURNS INTEGER LANGUAGE SQL AS 'SELECT 43'; CREATE SEQUENCE storage.future_sequence;");
    for (const role of clients) await asRole(db, role, async () => {
      assert.equal((await db.query("SELECT extensions.fixture_managed() AS value")).rows[0].value, 42);
      assert.equal((await db.query("SELECT storage.future_storage() AS value")).rows[0].value, 43);
      await db.exec("SELECT nextval('storage.future_sequence');");
    });
    await asRole(db, "service_role", async () => { await db.exec("INSERT INTO storage.fixture_objects VALUES(2); DELETE FROM storage.fixture_objects WHERE id=2;"); });
    // This is the explicitly documented global effect, not an assertion that
    // extension upgrades creating new postgres functions are unaffected.
    await db.exec("CREATE FUNCTION extensions.future_managed() RETURNS INTEGER LANGUAGE SQL AS 'SELECT 44';");
    await asRole(db, "anon", async () => { await denied(db.exec("SELECT extensions.future_managed()")); });
  });
});

test("hardening fails closed when any reviewed Supabase client role is absent", async () => {
  await memory(async (db) => {
    await fixture(db, false);
    const before = await snapshot(db);
    await assert.rejects(db.exec(migration), /unexpected client role capabilities/);
    assert.deepEqual(await snapshot(db), before);
  });
});

const driftCases = [
  ["missing final table", 'DROP TABLE public."_prisma_migrations";', /requires every expected table/],
  ["missing final routine", 'DROP FUNCTION public.prevent_published_website_content_child_mutation();', /requires every expected trigger function/],
  ["changed table owner", 'CREATE ROLE unexpected_owner; ALTER TABLE public."User" OWNER TO unexpected_owner;', /unexpected public relation inventory/],
  ["unexpected view", 'CREATE VIEW public.unreviewed AS SELECT * FROM public."User";', /unexpected public relation inventory/],
  ["unexpected materialized view", 'CREATE MATERIALIZED VIEW public.unreviewed AS SELECT * FROM public."User";', /unexpected public relation inventory/],
  ["unexpected sequence", 'CREATE SEQUENCE public.unreviewed;', /unexpected public relation inventory/],
  ["unexpected definer RPC", "CREATE FUNCTION public.unreviewed() RETURNS INTEGER LANGUAGE SQL SECURITY DEFINER AS 'SELECT 1';", /unexpected public routine inventory/],
  ["extension-owned target", 'ALTER EXTENSION plpgsql ADD FUNCTION public.prevent_published_website_content_child_mutation();', /unexpected public routine inventory/],
  ["last table policy", 'CREATE POLICY unexpected_policy ON public."_prisma_migrations" FOR SELECT TO PUBLIC USING(true);', /unexpected row security policies/],
  ["FORCE RLS", 'ALTER TABLE public."_prisma_migrations" FORCE ROW LEVEL SECURITY;', /unexpected FORCE RLS/],
  ["inherited MAINTAIN", 'CREATE ROLE inherited_reader; GRANT MAINTAIN ON public."_prisma_migrations" TO inherited_reader; GRANT inherited_reader TO anon;', /unexpected client role capabilities/],
  ["inherited column", 'CREATE ROLE inherited_reader; GRANT SELECT(value) ON public."User" TO inherited_reader; GRANT inherited_reader TO authenticated;', /unexpected client role capabilities/],
  ["elevated client", 'ALTER ROLE anon BYPASSRLS;', /unexpected client role capabilities/],
  ["unknown public default grantee", 'CREATE ROLE inherited_reader; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO inherited_reader;', /unexpected creator default privileges/],
  ["global direct client default", 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO anon;', /unexpected creator default privileges/],
] as const;
for (const [name, setup, error] of driftCases) test(`hardening aborts atomically and preserves all ACLs on ${name}`, async () => {
  await memory(async (db) => {
    await fixture(db); await db.exec(setup); const before = await snapshot(db);
    await assert.rejects(db.exec(migration), error); assert.deepEqual(await snapshot(db), before);
  });
});

test("late default-ACL failure rolls back table/RLS/routine/default changes together", async () => {
  await memory(async (db) => {
    await fixture(db);
    await db.exec(`CREATE SCHEMA test_hooks; CREATE FUNCTION test_hooks.reject_defaults() RETURNS event_trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fixture refuses changed defaults'; END; $$;
      CREATE EVENT TRIGGER fixture_reject_defaults ON ddl_command_end WHEN TAG IN ('ALTER DEFAULT PRIVILEGES') EXECUTE FUNCTION test_hooks.reject_defaults();`);
    const before = await snapshot(db);
    await assert.rejects(db.exec(migration), /fixture refuses changed defaults/);
    assert.deepEqual(await snapshot(db), before);
  });
});
