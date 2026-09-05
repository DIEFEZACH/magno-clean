import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build, loadConfigFromFile } from "vite";
import { generateSitemap } from "./generateSitemap.mjs";

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));
const configFile = join(frontendRoot, "vite.config.ts");
const previewOrigin = "https://build-test.magno-clean-staging.pages.dev";
const productionOrigin = "https://www.magnoclean.com.mx";
const runtimeMarker = "AUTH_RUNTIME_ONLY_TEST_SENTINEL_NOT_A_SECRET";

// Production below is a local build simulation. Its catalogue is synthetic and
// generated through an injected fetch, never fetched from a deployed backend.
function syntheticCatalog(environment) {
  return {
    items: [
      { type: "FAMILY", id: `${environment}-family`, slug: `mock-${environment}-family`, category: "Prueba", variantCount: 1, variants: [{ id: `${environment}-variant`, slug: `mock-${environment}-variant` }] },
      { type: "PRODUCT", id: `${environment}-product`, slug: `mock-${environment}-product`, category: "Prueba" },
    ],
    pagination: { page: 1, pageSize: 48, total: 2, pages: 1 },
    filters: { categories: ["Prueba"], brands: [] },
  };
}

async function isolatedEnvironment(environment, run) {
  const directory = await mkdtemp(join(tmpdir(), "magno-build-config-"));
  const previousDirectory = process.cwd();
  const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  try {
    // The existing config resolves loadEnv and dist/_headers from cwd. Keep
    // both in this private temporary directory, away from repository .env/dist.
    process.chdir(directory);
    Object.assign(process.env, environment);
    return await run(directory);
  } finally {
    process.chdir(previousDirectory);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

for (const demo of [true, false]) {
  test(`isolated real Vite build: DEMO=${demo}; ${demo ? "preview" : "future production MOCK only"}`, async () => {
    const environment = demo ? "staging" : "production";
    const origin = demo ? previewOrigin : productionOrigin;
    const api = demo ? "https://magno-clean-api-staging.onrender.com" : "https://magno-clean-api.onrender.com";
    const env = {
      VITE_DEMO_PREVIEW: String(demo), VITE_AUTH_PROXY_ENABLED: "true", VITE_SITE_URL: origin, VITE_API_URL: api,
      SITEMAP_ENVIRONMENT: environment, SITEMAP_ALLOW_STALE: "false",
      AUTH_DEPLOYMENT_ENVIRONMENT: environment, AUTH_UPSTREAM_URL: runtimeMarker, AUTH_ALLOWED_FRONTEND_ORIGINS: runtimeMarker,
    };
    await isolatedEnvironment(env, async (directory) => {
      const publicDirectory = join(directory, "public");
      await mkdir(publicDirectory);
      await copyFile(join(frontendRoot, "public/_headers"), join(publicDirectory, "_headers"));
      const requests = [];
      await generateSitemap({
        env, publicDirectory: pathToFileURL(`${publicDirectory}/`), logger: { log() {}, warn() { assert.fail("Stale fallback must not run"); } },
        fetchImplementation: async (url) => {
          requests.push(url);
          assert.equal(url, `${api}/api/catalog?page=1&pageSize=48`);
          return { ok: true, json: async () => syntheticCatalog(environment) };
        },
      });
      assert.equal(requests.length, 1, "Exactly one injected mock request; no live catalogue access");
      const dist = join(directory, "dist");
      await build({ root: frontendRoot, configFile, mode: "test", envDir: false, publicDir: publicDirectory, logLevel: "silent", build: { outDir: dist, emptyOutDir: true } });
      const [html, headers, xml, robots] = await Promise.all(["index.html", "_headers", "sitemap.xml", "robots.txt"].map((file) => readFile(join(dist, file), "utf8")));
      assert.ok(html.includes(`name="robots" content="${demo ? "noindex,nofollow" : "index,follow"}"`));
      assert.ok(html.includes(`rel="canonical" href="${origin}/"`));
      assert.equal(headers.includes("X-Robots-Tag: noindex, nofollow"), demo);
      assert.ok(xml.includes(`${origin}/producto/mock-${environment}-family`));
      assert.ok(xml.includes(`${origin}/producto/mock-${environment}-product`));
      assert.ok(!xml.includes(`mock-${environment}-variant`), "Grouped variants stay excluded");
      assert.equal((xml.match(/<loc>/g) || []).length, 9, "6 static + 1 category + 2 synthetic commercial items");
      for (const path of ["/admin", "/admin/", "/checkout", "/checkout/", "/carrito"]) {
        assert.ok(robots.split("\n").includes(`Disallow: ${path}`));
      }
      assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
      assert.ok(!xml.includes(demo ? "mock-production-" : "staging"));
      const scripts = (await readdir(join(dist, "assets"))).filter((file) => file.endsWith(".js"));
      const browserCode = (await Promise.all(scripts.map((file) => readFile(join(dist, "assets", file), "utf8")))).join("\n");
      assert.equal(browserCode.includes("VERSIÓN DE PRUEBA"), demo, "Production simulation omits the demo banner");
      assert.ok(!browserCode.includes(runtimeMarker), "Server-side auth configuration must not enter browser assets");
    });
  });
}

test("DEMO=true rejects production and the stable staging alias", async () => {
  for (const origin of [productionOrigin, "https://magno-clean.pages.dev", "https://magno-clean-staging.pages.dev"]) {
    await isolatedEnvironment({ VITE_DEMO_PREVIEW: "true", VITE_SITE_URL: origin }, async () => {
      await assert.rejects(loadConfigFromFile({ command: "build", mode: "test" }, configFile, frontendRoot, "silent"), /hostname Preview explícito de staging/);
    });
  }
});
