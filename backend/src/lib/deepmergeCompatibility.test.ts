import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const backendRoot = path.resolve(__dirname, "../..");

// Prisma uses the ESM export. Resolve it through Prisma -> @prisma/config,
// including nested installations, rather than importing a top-level copy.
const dependencySetup = `
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const prismaRequire = createRequire(require.resolve('prisma/package.json'));
const configEntry = prismaRequire.resolve('@prisma/config');
const configRequire = createRequire(configEntry);
const mergeRoot = path.dirname(path.dirname(configRequire.resolve('deepmerge-ts')));
const mergePackage = JSON.parse(fs.readFileSync(path.join(mergeRoot, 'package.json'), 'utf8'));
const mergeEntry = path.resolve(mergeRoot, mergePackage.exports.import);
const merger = await import(pathToFileURL(mergeEntry).href);
const { deepmerge } = merger;
const resolution = { configEntry, mergeEntry, version: mergePackage.version };
const report = (value) => console.log(JSON.stringify(value, (_key, item) =>
  item === undefined ? '[undefined]' : typeof item === 'string' ? item.replaceAll(process.cwd(), '<backend>') : item));
`;

const consumerFixture = `
const configApi = configRequire(configEntry);
const configFile = path.resolve('prisma.config.ts');
const loaded = await configApi.loadConfigFromFile({ configRoot: process.cwd(), configFile });
assert.equal(loaded.error, undefined, 'The actual project Prisma config must load');
const main = configApi.defineConfig({ schema: 'prisma/schema.prisma' });
const single = deepmerge(undefined, main, undefined, undefined, undefined);
const { loadConfig } = await import(pathToFileURL(configRequire.resolve('c12')).href);
const layered = await loadConfig({
  cwd: process.cwd(), name: 'prisma', configFile,
  dotenv: false, rcFile: false, giget: false, extend: false, packageJson: false,
  merger: deepmerge, jitiOptions: { interopDefault: true, moduleCache: false },
  overrides: () => ({ experimental: { externalTables: true },
    migrations: { path: 'prisma/migrations', seed: 'node fixture-seed.js' },
    tables: { external: ['legacy'] }, enums: { external: ['legacy_enum'] },
    typedSql: { path: 'prisma/sql' }, views: { path: 'prisma/views' } }),
  defaultConfig: { tables: { external: ['audit'] }, migrations: { seed: undefined } },
});
const callback = () => 'overlay';
const base = { nested: { labels: ['base'], nullable: 'base', retained: 'present', missing: undefined } };
const merged = deepmerge(base, { nested: { labels: ['overlay'], nullable: null, retained: undefined, callback } });
report({ resolution, observations: {
  realConfig: loaded.config, resolvedPath: loaded.resolvedPath,
  diagnostics: loaded.diagnostics.map((item) => item._tag),
  singleInputIdentity: single === main,
  configBrandPreserved: single.__brand === Symbol.for('PrismaConfigInternal'),
  options: configApi.defineConfig(layered.config),
  merged: { ...merged, nested: { ...merged.nested, callback: merged.nested.callback() } },
  callbackIdentity: merged.nested.callback === callback,
  baseUnchanged: base.nested.labels.length === 1 && base.nested.nullable === 'base',
} });
`;

// Official GHSA-ggr8-5vv4-36mx PoC: two records pointing to themselves at
// the same key. Run each API separately; never use FastUnsafe variants.
// https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx
const circularFixture = `
const left = { a: 1 }; left.self = left;
const right = { b: 2 }; right.self = right;
try {
  const result = process.argv[1] === 'deepmergeInto'
    ? (merger.deepmergeInto(left, right), left) : deepmerge(left, right);
  report({ resolution, outcome: { status: 'handled', preservesCycle: result.self === result, a: result.a, b: result.b } });
} catch (error) {
  report({ resolution, outcome: { status: 'rejected', name: error.name, message: error.message } });
}
`;

function runFixture(fixture: string, api = "deepmerge", heapMb = 128) {
  const source = `(async () => { ${dependencySetup}\n${fixture} })().catch(error => { console.error(error.name, error.message); process.exitCode = 1; });`;
  const child = spawnSync(process.execPath, [`--max-old-space-size=${heapMb}`, "-e", source, api], {
    cwd: backendRoot, encoding: "utf8", timeout: 5000, maxBuffer: 64 * 1024, killSignal: "SIGKILL",
    env: {
      PATH: path.dirname(process.execPath), NODE_ENV: "test", JITI_FS_CACHE: "false",
      DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/deepmerge_fixture",
      DOTENV_CONFIG_PATH: "/dev/null", DOTENV_CONFIG_QUIET: "true",
    },
  });
  assert.equal(child.error, undefined, "Isolated dependency check must finish within its bounds");
  assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

test("dependency compatibility: Prisma's real config and c12 merger retain the v7 baseline", () => {
  const result = runFixture(consumerFixture);
  assert.equal(result.resolution.version, "8.0.2");
  assert.match(result.resolution.configEntry, /\/node_modules\/@prisma\/config\/dist\/index\.js$/);
  assert.match(result.resolution.mergeEntry, /\/node_modules\/deepmerge-ts\/dist\/index\.mjs$/);
  assert.deepEqual(result.observations, {
    realConfig: {
      loadedFromFile: "<backend>/prisma.config.ts", schema: "<backend>/prisma/schema.prisma",
      datasource: { url: "postgresql://fixture:fixture@127.0.0.1:1/deepmerge_fixture" },
      migrations: { path: "[undefined]" }, typedSql: { path: "[undefined]" }, views: { path: "[undefined]" },
    },
    resolvedPath: "<backend>/prisma.config.ts", diagnostics: ["log"],
    singleInputIdentity: true, configBrandPreserved: true,
    options: {
      loadedFromFile: null, experimental: { externalTables: true }, schema: "prisma/schema.prisma",
      datasource: { url: "postgresql://fixture:fixture@127.0.0.1:1/deepmerge_fixture" },
      migrations: { path: "prisma/migrations", seed: "node fixture-seed.js" },
      tables: { external: ["legacy", "audit"] }, enums: { external: ["legacy_enum"] },
      typedSql: { path: "prisma/sql" }, views: { path: "prisma/views" },
    },
    merged: { nested: { labels: ["base", "overlay"], nullable: null, retained: "present", missing: "[undefined]", callback: "overlay" } },
    callbackIdentity: true, baseUnchanged: true,
  });
});

for (const api of ["deepmerge", "deepmergeInto"]) {
  test(`dependency safety: ${api} handles the official circular input in a bounded process`, () => {
    const result = runFixture(circularFixture, api, 64);
    assert.equal(result.resolution.version, "8.0.2");
    assert.deepEqual(result.outcome, { status: "handled", preservesCycle: true, a: 1, b: 2 });
  });
}
