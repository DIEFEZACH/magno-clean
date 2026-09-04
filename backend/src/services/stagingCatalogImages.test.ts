import test, { mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { imageReferenceCounts, isAuthorizedSCN20Image, PUBLIC_PRODUCTION_ASSET_HOST, SCN20_PUBLIC_URL_SHA256, verifyPublicProductionAssetReferences } from "./stagingCatalog/imagePolicy";
import { sanitizeProductRows, validateCatalogProduct, validateSnapshot } from "./stagingCatalog/snapshot";
import { buildCatalogPlan } from "./stagingCatalog/plan";
import { safeCatalogError } from "./stagingCatalog/safeError";
import type { CatalogProduct } from "./stagingCatalog/types";

// Do not embed the actual production object path/URL or query a remote service in CI.
const fixtureUrl = `https://${PUBLIC_PRODUCTION_ASSET_HOST}/storage/v1/object/public/qa-images/fixture.png`;
const cloudinaryUrl = "https://res.cloudinary.com/qa/image/upload/fixture.webp";
function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return { slug: "neutro-car", code: "SCN20", brand: "QA", name: "QA", category: "QA", description: "QA", imageUrl: fixtureUrl, badge: null, price: 1, oldPrice: null, digitalPrice: 1, retailPrice: 1, active: true, featured: false, ...overrides };
}
async function withApprovedFixture(run: () => void | Promise<void>, constantFingerprint = false) {
  // Mock only the URL fingerprint boundary; live code uses node:crypto with the fixed approved hash.
  const hash = mock.method(crypto, "createHash", () => ({
    update: (value: unknown) => ({ digest: () => constantFingerprint || value === fixtureUrl ? SCN20_PUBLIC_URL_SHA256 : "0".repeat(64) }),
  }));
  try { await run(); } finally { hash.mock.restore(); }
}

test("SCN20 exception accepts only the pinned URL and exact case-sensitive code", async () => {
  assert.equal(isAuthorizedSCN20Image("SCN20", fixtureUrl), false, "a different public object is rejected by the real hash");
  await withApprovedFixture(() => {
    assert.equal(isAuthorizedSCN20Image("SCN20", fixtureUrl), true);
    for (const code of ["SCN21", "scn20", " SCN20", "SCN20 "]) assert.equal(isAuthorizedSCN20Image(code, fixtureUrl), false);
    assert.equal(isAuthorizedSCN20Image("SCN20", fixtureUrl.replace("fixture.png", "different.png")), false);
    assert.equal(validateCatalogProduct(product()).imageUrl, fixtureUrl);
    assert.equal(buildCatalogPlan([product()], []).summary.CREATE, 1);
    assert.equal(buildCatalogPlan([product()], [product()]).summary.UNCHANGED, 1);
    assert.throws(() => validateCatalogProduct(product({ code: "OTHER" })));
    assert.throws(() => validateCatalogProduct(product({ description: fixtureUrl })), "the exception never applies to free text");
  });
});

test("SCN20 rejects signed/authenticated paths, credentials, delimiters, spoofed hosts and encoding tricks", async () => {
  await withApprovedFixture(() => {
    for (const value of [
      fixtureUrl + "?", fixtureUrl + "#", fixtureUrl + "?token=hidden", fixtureUrl + "#hidden",
      fixtureUrl.replace("https:", "http:"), fixtureUrl.replace("https://", "https://user:password@"),
      fixtureUrl.replace("https://", "https://@"), fixtureUrl.replace(PUBLIC_PRODUCTION_ASSET_HOST, PUBLIC_PRODUCTION_ASSET_HOST + ":443"),
      fixtureUrl.replace(PUBLIC_PRODUCTION_ASSET_HOST, PUBLIC_PRODUCTION_ASSET_HOST + ".attacker.invalid"),
      fixtureUrl.replace("/object/public/", "/object/sign/"), fixtureUrl.replace("/object/public/", "/object/authenticated/"),
      fixtureUrl.replace("fixture.png", "token.png"), fixtureUrl.replace("fixture.png", "service_role.png"),
      fixtureUrl.replace("fixture.png", "%2e%2e/file.png"), fixtureUrl.replace("fixture.png", "%252e%252e.png"),
      fixtureUrl.replace("fixture.png", "%2Ffile.png"), fixtureUrl.replace("fixture.png", "password%3Dprivate.png"),
      fixtureUrl.replace("/fixture.png", "/"), fixtureUrl + "\n",
    ]) assert.equal(isAuthorizedSCN20Image("SCN20", value), false);
  }, true); // Structural protections must reject even if a fingerprint check were to match.
});

test("a second production Storage reference stops validation before any HTTP call", async () => {
  await withApprovedFixture(async () => {
    const other = product({ code: "OTHER", slug: "other" });
    assert.throws(() => sanitizeProductRows([product(), other]));
    assert.throws(() => validateSnapshot({ schemaVersion: 1, exportedAt: "2026-09-04T00:00:00.000Z", source: { environment: "production", projectRef: "fxbgxjpgfkeuapbmgpmv" }, products: [product(), other] }));
    let calls = 0;
    await assert.rejects(verifyPublicProductionAssetReferences([product(), other], async () => { calls++; throw new Error("Must not be called"); }), /UNAUTHORIZED_IMAGE_REFERENCE/);
    assert.equal(calls, 0);
    assert.throws(() => imageReferenceCounts([product(), product()]), /UNAUTHORIZED_IMAGE_REFERENCE/);
  });
});

test("exception uses only credential-free HEAD, no redirect/body read, and reports warning outside Product", async () => {
  await withApprovedFixture(async () => {
    const rows = [product(), product({ code: "CLOUD", imageUrl: cloudinaryUrl }), product({ code: "NONE", imageUrl: null })];
    const before = structuredClone(rows);
    let calls = 0;
    const result = await verifyPublicProductionAssetReferences(rows, async (url, init) => {
      calls++;
      assert.equal(url, fixtureUrl);
      assert.equal(init.method, "HEAD");
      assert.equal(init.redirect, "manual");
      assert.equal(init.credentials, "omit");
      assert.equal(init.headers, undefined);
      assert.equal(init.body, undefined);
      assert.ok(init.signal instanceof AbortSignal);
      return { status: 200, headers: new Headers({ "content-type": "image/png; charset=binary" }) };
    });
    assert.equal(calls, 1);
    assert.deepEqual(rows, before);
    assert.deepEqual(result.imageUrlCounts, { Cloudinary: 1, SupabasePublicProduction: 1, null: 1 });
    const warning = result.PUBLIC_PRODUCTION_ASSET_REFERENCE;
    assert.equal(warning.count, 1);
    assert.equal(warning.code, "SCN20");
    assert.match(warning.risk!, /dependencia visual temporal/);
    assert.match(warning.followUp!, /asset propio de staging/);
    assert.equal(warning.validation?.httpStatus, 200);
    assert.equal(warning.validation?.contentType, "image/png");
    assert.ok(!JSON.stringify(result).includes(fixtureUrl));
    assert.ok(!("PUBLIC_PRODUCTION_ASSET_REFERENCE" in rows[0]));
  });
});

test("HTTP failures, redirects, timeouts and non-image MIME block export with sanitized errors", async () => {
  await withApprovedFixture(async () => {
    for (const status of [301, 302, 307, 308, 403, 404, 500]) {
      await assert.rejects(verifyPublicProductionAssetReferences([product()], async () => ({ status, headers: new Headers({ "content-type": "image/png" }) })), /PUBLIC_ASSET_HTTP_NOT_200/);
    }
    for (const type of ["", "text/html", "application/octet-stream", "image/svg+xml", "image/unknown"]) {
      await assert.rejects(verifyPublicProductionAssetReferences([product()], async () => ({ status: 200, headers: new Headers({ "content-type": type }) })), /PUBLIC_ASSET_UNSUPPORTED_CONTENT_TYPE/);
    }
    await assert.rejects(verifyPublicProductionAssetReferences([product()], async () => { throw new Error("network details must not be logged"); }), error => {
      assert.equal(safeCatalogError(error), "PUBLIC_ASSET_CHECK_FAILED"); return true;
    });
  });
});

test("catalog without the exception requires no remote asset request", async () => {
  let calls = 0;
  const result = await verifyPublicProductionAssetReferences([product({ imageUrl: cloudinaryUrl }), product({ code: "NONE", imageUrl: null })], async () => { calls++; throw new Error(); });
  assert.equal(calls, 0);
  assert.deepEqual(result.PUBLIC_PRODUCTION_ASSET_REFERENCE, { count: 0 });
});
