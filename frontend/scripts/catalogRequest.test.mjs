import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { CATALOG_FETCH_LIMITS, CatalogUnavailableError } from "./catalogRequest.mjs";
import { fetchCatalog, PAGE_SIZE, createSitemap, validateStaleSitemap } from "./sitemap.mjs";
import { generateSitemap } from "./generateSitemap.mjs";
import { fakeCatalogRuntime } from "./testSupport/fakeCatalogRuntime.mjs";

const API = "https://api.example.invalid";
const SITE = "https://shop.example.invalid";
const products = (count) => Array.from({ length: count }, (_, index) => ({ type: "PRODUCT", id: `p-${index}`, slug: `product-${index}`, category: "Limpieza" }));
const data = (count = 1, page = 1) => ({
  items: products(count).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
  pagination: { page, pageSize: PAGE_SIZE, total: count, pages: Math.ceil(count / PAGE_SIZE) },
  filters: { categories: count ? ["Limpieza"] : [] },
});
const ok = (body = data()) => ({ ok: true, status: 200, json: async () => body });
const unavailable = (status, retryAfter = null) => ({ ok: false, status, headers: { get: () => retryAfter } });
function setup() {
  const clock = fakeCatalogRuntime();
  const logs = [];
  return { ...clock, logs, options: { runtime: clock.runtime, logger: { warn: (message) => logs.push(message) } } };
}

test("first attempt succeeds without sleeps and complete XML has no duplicates", async () => {
  const state = setup();
  let requests = 0;
  const result = await fetchCatalog(API, async () => { requests += 1; return ok(); }, state.options);
  assert.equal(requests, 1);
  assert.deepEqual(state.sleeps, []);
  assert.equal(state.timers.size, 0);
  const sitemap = createSitemap(result, SITE);
  await validateStaleSitemap(sitemap.xml, sitemap.robots, SITE);
  assert.equal(sitemap.counts.urls, 8);
});

test("timeout including a stalled fetch wakes on next attempt without real time", async () => {
  const state = setup();
  let calls = 0;
  let firstSignal;
  const result = await fetchCatalog(API, async (_, { signal }) => {
    calls += 1;
    if (calls === 1) {
      firstSignal = signal;
      state.advanceBy(CATALOG_FETCH_LIMITS.attemptMs);
      return new Promise(() => {});
    }
    return ok();
  }, state.options);
  assert.equal(result.items.length, 1);
  assert.equal(calls, 2);
  assert.equal(firstSignal.aborted, true);
  assert.deepEqual(state.sleeps, [2000]);
  assert.equal(state.runtime.now(), 22_000);
  assert.equal(state.timers.size, 0);
});

test("response body shares the request timeout and recovers after disconnect", async () => {
  const state = setup();
  let calls = 0;
  await fetchCatalog(API, async () => {
    calls += 1;
    return calls === 1 ? { ...ok(), json: async () => {
      state.advanceBy(20_000);
      return new Promise(() => {});
    } } : ok();
  }, state.options);
  assert.equal(calls, 2);
  assert.equal(state.runtime.now(), 22_000);
});

for (const responseKind of ["network", "body disconnect", 500, 502, 503, 599]) {
  test(`transient ${responseKind} recovers and sanitized logs omit raw errors`, async () => {
    const state = setup();
    let calls = 0;
    await fetchCatalog(API, async () => {
      calls += 1;
      if (calls > 1) return ok();
      if (responseKind === "network") throw new TypeError("upstream-sensitive-url-or-body");
      if (responseKind === "body disconnect") return { ...ok(), json: async () => { throw new TypeError("upstream-sensitive-body"); } };
      return unavailable(responseKind);
    }, state.options);
    assert.equal(calls, 2);
    assert.deepEqual(state.sleeps, [2000]);
    assert.ok(state.logs.every((message) => !message.includes("sensitive") && !message.includes(API)));
  });
}

for (const headerKind of ["seconds", "http-date"]) {
  test(`429 respects Retry-After ${headerKind}`, async () => {
    const state = setup();
    let calls = 0;
    const header = headerKind === "seconds" ? "12" : new Date(state.runtime.wallNow() + 12_000).toUTCString();
    await fetchCatalog(API, async () => ++calls === 1 ? unavailable(429, header) : ok(), state.options);
    assert.equal(calls, 2);
    assert.deepEqual(state.sleeps, [12_000]);
  });
}

test("Retry-After beyond remaining budget fails instead of retrying too early", async () => {
  const state = setup();
  let calls = 0;
  await assert.rejects(fetchCatalog(API, async () => { calls += 1; return unavailable(429, "120"); }, state.options), /presupuesto insuficiente/);
  assert.equal(calls, 1);
  assert.deepEqual(state.sleeps, []);
});

test("four failed attempts terminate with bounded exponential backoff", async () => {
  const state = setup();
  let calls = 0;
  await assert.rejects(fetchCatalog(API, async () => { calls += 1; return unavailable(503); }, state.options), /4 intentos agotados/);
  assert.equal(calls, 4);
  assert.deepEqual(state.sleeps, [2000, 4000, 8000]);
  assert.equal(state.runtime.now(), 14_000);
});

test("one shared 90 second budget covers attempts, waits, body and all pages", async () => {
  const state = setup();
  const pages = [];
  await assert.rejects(fetchCatalog(API, async (url) => {
    const page = Number(new URL(url).searchParams.get("page"));
    pages.push(page);
    if (page === 1) { state.advanceBy(15_000); return ok(data(96, 1)); }
    state.advanceBy(state.timeouts.at(-1));
    return new Promise(() => {});
  }, state.options), CatalogUnavailableError);
  assert.deepEqual(pages, [1, 2, 2, 2, 2]);
  assert.equal(state.runtime.now(), 90_000);
  assert.deepEqual(state.timeouts, [20_000, 20_000, 20_000, 20_000, 1000]);
  assert.equal(state.timers.size, 0);
});

for (const status of [400, 401, 403, 404, 422]) {
  test(`${status} is rejected after one request without fallback-eligible error`, async () => {
    const state = setup();
    let calls = 0;
    await assert.rejects(fetchCatalog(API, async () => { calls += 1; return unavailable(status); }, state.options),
      (error) => !(error instanceof CatalogUnavailableError) && error.message.includes(`HTTP ${status}`));
    assert.equal(calls, 1);
    assert.deepEqual(state.sleeps, []);
  });
}

for (const status of [403, 429]) {
  test(`HTTP ${status} remains authoritative even when response-body cancellation would hang`, async () => {
    const state = setup();
    let calls = 0;
    let cancellationCalls = 0;
    let signal;
    const operation = fetchCatalog(API, async (_, options) => {
      calls += 1;
      if (calls > 1) return ok();
      signal = options.signal;
      return { ...unavailable(status, "12"), body: { cancel: () => {
        cancellationCalls += 1;
        return new Promise(() => {});
      } } };
    }, state.options);
    if (status === 403) await assert.rejects(operation, (error) => !(error instanceof CatalogUnavailableError) && error.message.includes("HTTP 403"));
    else await operation;
    assert.equal(signal.aborted, true);
    assert.equal(cancellationCalls, 0);
    assert.equal(calls, status === 403 ? 1 : 2);
    assert.deepEqual(state.sleeps, status === 403 ? [] : [12_000]);
    assert.equal(state.timers.size, 0);
  });
}

for (const kind of ["json", "schema", "pagination", "duplicates"]) {
  test(`invalid ${kind} never retries`, async () => {
    const state = setup();
    let calls = 0;
    await assert.rejects(fetchCatalog(API, async () => {
      calls += 1;
      if (kind === "json") return { ...ok(), json: async () => { throw new SyntaxError("hidden invalid JSON"); } };
      if (kind === "schema") return ok({ products: [] });
      if (kind === "pagination") return ok({ ...data(), pagination: { ...data().pagination, pages: 2 } });
      return ok({ ...data(2), items: [products(1)[0], products(1)[0]] });
    }, state.options), (error) => !(error instanceof CatalogUnavailableError) && !error.message.includes("hidden"));
    assert.equal(calls, 1);
    assert.deepEqual(state.sleeps, []);
  });
}

test("a failed middle page never writes or replaces the previous complete sitemap", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "magno-sitemap-resilience-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const publicDirectory = pathToFileURL(`${directory}/`);
  const previous = createSitemap({ items: products(1), categories: ["Limpieza"] }, SITE);
  await writeFile(new URL("sitemap.xml", publicDirectory), previous.xml);
  await writeFile(new URL("robots.txt", publicDirectory), previous.robots);
  const state = setup();
  const pages = [];
  await assert.rejects(generateSitemap({ publicDirectory,
    env: { VITE_SITE_URL: SITE, VITE_API_URL: API, SITEMAP_ALLOW_STALE: "false", SITEMAP_ENVIRONMENT: "production" },
    requestRuntime: state.runtime, logger: { warn() {}, log() {} },
    fetchImplementation: async (url) => {
      const page = Number(new URL(url).searchParams.get("page"));
      pages.push(page);
      return page === 1 ? ok(data(98, 1)) : unavailable(503);
    },
  }), CatalogUnavailableError);
  assert.deepEqual(pages, [1, 2, 2, 2, 2]);
  assert.equal(await readFile(new URL("sitemap.xml", publicDirectory), "utf8"), previous.xml);
  assert.equal(await readFile(new URL("robots.txt", publicDirectory), "utf8"), previous.robots);
  assert.deepEqual((await readdir(directory)).sort(), ["robots.txt", "sitemap.xml"]);
});
