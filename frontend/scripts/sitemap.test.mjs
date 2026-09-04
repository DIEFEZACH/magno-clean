import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { JSDOM } from "jsdom";
import { CatalogUnavailableError, createSitemap, escapeXml, fetchCatalog, PAGE_SIZE, readSitemapConfig, STATIC_PATHS, validateStaleSitemap } from "./sitemap.mjs";
import { generateSitemap } from "./generateSitemap.mjs";

const SITE = "https://shop.example.invalid";
const API = "https://api.example.invalid";
const CATEGORY = "Limpieza & cuidado";
const product = (index, extra = {}) => ({ type: "PRODUCT", id: `product-${index}`, slug: `producto-${index}`, category: CATEGORY, ...extra });
const family = (index, extra = {}) => ({ type: "FAMILY", id: `family-${index}`, slug: `familia-${index}`, category: CATEGORY,
  variantCount: 2, variants: [{ id: `variant-${index}-1`, slug: `variante-${index}-1` }, { id: `variant-${index}-2`, slug: `variante-${index}-2` }], ...extra });
const catalog = (items = [family(1), product(1)]) => ({ items, categories: [...new Set(items.map((item) => item.category))] });
function pageResponse(all, page = 1) {
  return { items: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    pagination: { page, pageSize: PAGE_SIZE, total: all.length, pages: Math.ceil(all.length / PAGE_SIZE) },
    filters: { categories: [...new Set(all.map((item) => item.category))], brands: [] } };
}
const response = (data) => ({ ok: true, status: 200, json: async () => data });
function locations(xml) {
  const dom = new JSDOM(xml, { contentType: "application/xml" });
  try {
    assert.equal(dom.window.document.documentElement.namespaceURI, "http://www.sitemaps.org/schemas/sitemap/0.9");
    return [...dom.window.document.querySelectorAll("url > loc")].map((node) => node.textContent);
  } finally { dom.window.close(); }
}

test("fetches every /api/catalog page at maximum pageSize and stops exactly at pagination.pages", async () => {
  const all = [family(1), ...Array.from({ length: 97 }, (_, index) => product(index))];
  const requests = [];
  const result = await fetchCatalog(API, async (address) => {
    const url = new URL(address);
    requests.push(url);
    return response(pageResponse(all, Number(url.searchParams.get("page"))));
  });
  assert.equal(result.items.length, 98);
  assert.deepEqual(requests.map((url) => url.pathname), ["/api/catalog", "/api/catalog", "/api/catalog"]);
  assert.deepEqual(requests.map((url) => url.searchParams.get("page")), ["1", "2", "3"]);
  assert.ok(requests.every((url) => url.searchParams.get("pageSize") === "48"));
});

test("empty catalog makes only one request and keeps all six static pages", async () => {
  let calls = 0;
  const result = await fetchCatalog(API, async () => { calls += 1; return response(pageResponse([])); });
  assert.equal(calls, 1);
  assert.deepEqual(locations(createSitemap(result, SITE).xml), STATIC_PATHS.map((path) => `${SITE}${path}`));
});

test("FAMILY and PRODUCT URLs preserve categories, exclude variants, and never invent lastmod", async () => {
  const result = createSitemap(catalog([family(1), product(1, { updatedAt: "2026-01-01" })]), SITE);
  const urls = locations(result.xml);
  assert.deepEqual(result.counts, { families: 1, products: 1, categories: 1, urls: 9 });
  assert.ok(urls.includes(`${SITE}/producto/familia-1`));
  assert.ok(urls.includes(`${SITE}/producto/producto-1`));
  assert.ok(urls.includes(`${SITE}/productos?category=${encodeURIComponent(CATEGORY)}`));
  assert.ok(urls.every((url) => new URL(url).origin === SITE));
  assert.doesNotMatch(result.xml, /variante-1-|\?variant=|<lastmod>|localhost|staging|<loc>[^<]*\/(admin|checkout|carrito)/);
  await validateStaleSitemap(result.xml, result.robots, SITE);
});

test("canonical plan yields 25 families + 16 individuals, excluding all 79 grouped and 3 inactive slugs", async () => {
  const plan = JSON.parse(await readFile(new URL("../../docs/product-data/product-family-plan.json", import.meta.url), "utf8"));
  const families = plan.families.map((entry) => family(entry.familySlug, { slug: entry.familySlug, category: entry.category,
    variantCount: entry.variants.length, variants: entry.variants.map((variant) => ({ id: variant.code, slug: variant.productSlug })) }));
  const individuals = plan.individuals.map((entry) => product(entry.code, { slug: entry.slug, category: "Individuales de prueba" }));
  const result = createSitemap(catalog([...families, ...individuals]), SITE);
  const urls = locations(result.xml);
  assert.equal(result.counts.families, 25);
  assert.equal(result.counts.products, 16);
  assert.equal(result.counts.urls, 41 + result.counts.categories + 6);
  for (const item of [...families, ...individuals]) assert.equal(urls.filter((url) => url === `${SITE}/producto/${item.slug}`).length, 1);
  const variants = families.flatMap((entry) => entry.variants);
  assert.equal(variants.length, 79);
  for (const item of [...variants, ...plan.inactive]) assert.ok(!urls.includes(`${SITE}/producto/${item.slug}`));
});

for (const [label, data] of [
  ["missing items", {}],
  ["legacy products response", { products: [product(1)] }],
  ["missing categories", { ...pageResponse([product(1)]), filters: {} }],
  ["invalid total", { ...pageResponse([product(1)]), pagination: { page: 1, pageSize: 48, total: -1, pages: 0 } }],
  ["incorrect pages", { ...pageResponse([product(1)]), pagination: { page: 1, pageSize: 48, total: 1, pages: 2 } }],
  ["incorrect page size", { ...pageResponse([product(1)]), pagination: { page: 1, pageSize: 24, total: 1, pages: 1 } }],
  ["empty partial page", { ...pageResponse([product(1)]), items: [] }],
  ["duplicate categories", { ...pageResponse([product(1)]), filters: { categories: [CATEGORY, CATEGORY] } }],
  ["category not represented by items", { ...pageResponse([product(1)]), filters: { categories: [CATEGORY, "Extra"] } }],
]) {
  test(`rejects invalid API response: ${label}`, async () => {
    await assert.rejects(fetchCatalog(API, async () => response(data)));
  });
}

for (const change of ["repeated page", "changed total", "changed categories", "repeated content"]) {
  test(`stops on inconsistent pagination: ${change}`, async () => {
    const all = Array.from({ length: 96 }, (_, index) => product(index));
    let calls = 0;
    await assert.rejects(fetchCatalog(API, async () => {
      calls += 1;
      const data = pageResponse(all, calls);
      if (calls === 2) {
        if (change === "repeated page") data.pagination.page = 1;
        if (change === "changed total") { data.pagination.total = 97; data.pagination.pages = 3; }
        if (change === "changed categories") data.filters.categories = [CATEGORY, "Nueva"];
        if (change === "repeated content") data.items = pageResponse(all, 1).items;
      }
      return response(data);
    }));
    assert.equal(calls, 2);
  });
}

for (const [label, items] of [
  ["duplicate slug across types", [family(1), product(1, { slug: "familia-1" })]],
  ["duplicate identity", [product(1), product(2, { id: "product-1" })]],
  ["unknown item type", [product(1, { type: "VARIANT" })]],
  ["invalid slug", [product(1, { slug: "bad?variant=1" })]],
  ["empty family", [family(1, { variants: [], variantCount: 0 })]],
  ["inconsistent variant count", [family(1, { variantCount: 4 })]],
  ["inactive product", [product(1, { active: false })]],
  ["inactive family", [family(1, { active: false })]],
  ["grouped product", [product(1, { familyId: "family-1" })]],
  ["grouped variant slug as PRODUCT", [family(1), product(1, { slug: "variante-1-1" })]],
  ["grouped variant identity as PRODUCT", [family(1), product(1, { id: "variant-1-1" })]],
  ["duplicate variant", [family(1), family(2, { variants: family(1).variants })]],
]) {
  test(`rejects unsafe commercial items: ${label}`, () => {
    assert.throws(() => createSitemap(catalog(items), SITE));
  });
}

test("unavailable API is distinguished from invalid data and client errors", async () => {
  await assert.rejects(fetchCatalog(API, async () => { throw new Error("hidden upstream failure"); }), CatalogUnavailableError);
  await assert.rejects(fetchCatalog(API, async () => ({ ok: false, status: 503 })), CatalogUnavailableError);
  for (const implementation of [async () => ({ ok: false, status: 404 }), async () => ({ ok: true, json: async () => { throw new Error("secret payload"); } })]) {
    await assert.rejects(fetchCatalog(API, implementation), (error) => !(error instanceof CatalogUnavailableError) && !error.message.includes("secret payload"));
  }
});

for (const siteUrl of [undefined, "", "not-a-url", "http://localhost:5173", "https://sub.localhost", "http://127.0.0.1", "http://[::1]", "https://shop.example.invalid/path", "https://shop.example.invalid?variant=1", "https://user:password@shop.example.invalid", "file:///tmp/sitemap"]) {
  test(`rejects invalid VITE_SITE_URL: ${String(siteUrl).replace("user:password@", "credentials@")}`, () => {
    assert.throws(() => readSitemapConfig({ VITE_SITE_URL: siteUrl }));
  });
}

test("explicit production guard rejects stale and staging origin; current staging config remains compatible", () => {
  assert.throws(() => readSitemapConfig({ VITE_SITE_URL: SITE, SITEMAP_ENVIRONMENT: "production", SITEMAP_ALLOW_STALE: "true" }));
  assert.throws(() => readSitemapConfig({ VITE_SITE_URL: "https://staging.example.invalid", SITEMAP_ENVIRONMENT: "production" }));
  assert.deepEqual(readSitemapConfig({ VITE_SITE_URL: `${SITE}/`, VITE_API_URL: "http://127.0.0.1:4000", SITEMAP_ALLOW_STALE: "true" }),
    { siteUrl: SITE, apiUrl: "http://127.0.0.1:4000", allowStale: true });
  assert.equal(readSitemapConfig({ VITE_SITE_URL: SITE, SITEMAP_ENVIRONMENT: "production", SITEMAP_ALLOW_STALE: "false" }).allowStale, false);
});

for (const [label, transform] of [
  ["different origin", (result) => ({ ...result, xml: result.xml.replace(SITE, "https://other.example.invalid") })],
  ["localhost fallback", (result) => ({ ...result, xml: result.xml.replaceAll(SITE, "http://localhost:5173") })],
  ["different protocol", (result) => ({ ...result, xml: result.xml.replace(SITE, SITE.replace("https:", "http:")) })],
  ["variant parameter", (result) => ({ ...result, xml: result.xml.replace("/producto/familia-1</loc>", "/producto/familia-1?variant=1</loc>") })],
  ["admin route", (result) => ({ ...result, xml: result.xml.replace("/producto/familia-1</loc>", "/admin</loc>") })],
  ["duplicate URL", (result) => ({ ...result, xml: result.xml.replace("/producto/familia-1</loc>", "/producto/producto-1</loc>") })],
  ["missing static page", (result) => ({ ...result, xml: result.xml.replace("/soporte</loc>", "/producto/extra</loc>") })],
  ["malformed XML", (result) => ({ ...result, xml: result.xml.replace("</urlset>", "</broken>") })],
  ["wrong namespace", (result) => ({ ...result, xml: result.xml.replace("http://www.sitemaps.org/schemas/sitemap/0.9", "https://example.invalid") })],
  ["entity declaration", (result) => ({ ...result, xml: result.xml.replace("<urlset", '<!DOCTYPE urlset [<!ENTITY x "unsafe">]><urlset') })],
  ["wrong robots origin", (result) => ({ ...result, robots: result.robots.replace(SITE, "https://other.example.invalid") })],
  ["multiple robots sitemap directives", (result) => ({ ...result, robots: `${result.robots}Sitemap: ${SITE}/sitemap.xml\n` })],
]) {
  test(`stale fallback rejects ${label}`, async () => {
    const { xml, robots } = transform(createSitemap(catalog(), SITE));
    await assert.rejects(validateStaleSitemap(xml, robots, SITE));
  });
}

test("XML escaping is valid for all reserved characters and unicode", () => {
  assert.equal(escapeXml("<&>\"'"), "&lt;&amp;&gt;&quot;&apos;");
  const result = createSitemap(catalog([product(1, { slug: "esponja-'ñ'", category: "Jabón <suave> & \"fácil\" de O'Neill" })]), SITE);
  assert.equal(locations(result.xml).length, 8);
  assert.match(result.xml, /&apos;/);
  assert.throws(() => escapeXml("bad\u0000xml"));
});

for (const scenario of ["fresh catalog", "matching stale", "wrong-origin stale", "invalid response", "production unavailable"]) {
  test(`generator integration: ${scenario}`, async (context) => {
    const directory = await mkdtemp(join(tmpdir(), "magno-sitemap-test-"));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const publicDirectory = pathToFileURL(`${directory}/`);
    const sitemapFile = new URL("sitemap.xml", publicDirectory);
    const robotsFile = new URL("robots.txt", publicDirectory);
    const previous = createSitemap(catalog(), scenario === "wrong-origin stale" ? "https://other.example.invalid" : SITE);
    await Promise.all([writeFile(sitemapFile, previous.xml), writeFile(robotsFile, previous.robots)]);
    const messages = [];
    const options = {
      publicDirectory,
      env: { VITE_SITE_URL: SITE, VITE_API_URL: API, SITEMAP_ALLOW_STALE: scenario === "production unavailable" ? "false" : "true" },
      logger: { log: (message) => messages.push(message), warn: (message) => messages.push(message) },
      fetchImplementation: async () => {
        if (scenario === "fresh catalog") return response(pageResponse([product(2)]));
        if (scenario === "invalid response") return response({ products: [] });
        throw new Error("API unavailable; this upstream message must not leak");
      },
    };
    if (["wrong-origin stale", "invalid response", "production unavailable"].includes(scenario)) await assert.rejects(generateSitemap(options));
    else await generateSitemap(options);
    const [xml, robots] = await Promise.all([readFile(sitemapFile, "utf8"), readFile(robotsFile, "utf8")]);
    if (scenario === "fresh catalog") {
      assert.notEqual(xml, previous.xml);
      assert.ok(locations(xml).includes(`${SITE}/producto/producto-2`));
      await validateStaleSitemap(xml, robots, SITE);
    } else {
      assert.equal(xml, previous.xml);
      assert.equal(robots, previous.robots);
    }
    assert.ok(messages.every((message) => !message.includes("upstream")));
  });
}
