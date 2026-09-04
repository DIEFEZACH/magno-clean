import { createCatalogRequestBudget, requestCatalogPage } from "./catalogRequest.mjs";

export { CatalogUnavailableError } from "./catalogRequest.mjs";
export const PAGE_SIZE = 48;
export const STATIC_PATHS = ["/", "/productos", "/categorias", "/nosotros", "/contacto", "/soporte"];
const SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validText(value) {
  return typeof value === "string" && value.length > 0 && value === value.trim()
    && !/[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(value);
}

function validSlug(value) {
  return validText(value) && value !== "." && value !== ".." && !/[/?#\\]/.test(value);
}

function normalizeOrigin(value, name, publicSite = false) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} debe ser un origen HTTP(S) explícito.`); }
  invariant(typeof value === "string" && value === value.trim()
    && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
    && url.pathname === "/" && !url.search && !url.hash, `${name} debe contener sólo el origen, sin credenciales, ruta ni parámetros.`);
  if (publicSite) {
    const hostname = url.hostname.toLowerCase();
    invariant(!hostname.includes("localhost") && hostname !== "[::1]"
      && hostname !== "0.0.0.0" && !/^127\./.test(hostname), `${name} no puede usar localhost ni loopback.`);
  }
  return url.origin;
}

export function readSitemapConfig(env) {
  const siteUrl = normalizeOrigin(env.VITE_SITE_URL, "VITE_SITE_URL", true);
  const apiUrl = normalizeOrigin(env.VITE_API_URL || "http://localhost:4000", "VITE_API_URL");
  invariant(env.SITEMAP_ALLOW_STALE === undefined || ["true", "false"].includes(env.SITEMAP_ALLOW_STALE), "SITEMAP_ALLOW_STALE debe ser true o false.");
  const allowStale = env.SITEMAP_ALLOW_STALE === "true";
  // Optional explicit release guard; existing staging builds need no new variable.
  invariant(env.SITEMAP_ENVIRONMENT === undefined || ["staging", "production"].includes(env.SITEMAP_ENVIRONMENT), "SITEMAP_ENVIRONMENT debe ser staging o production.");
  if (env.SITEMAP_ENVIRONMENT === "production") {
    invariant(!allowStale, "Producción no permite SITEMAP_ALLOW_STALE=true en este release.");
    invariant(!new URL(siteUrl).hostname.toLowerCase().includes("staging"), "VITE_SITE_URL productivo no puede apuntar a staging.");
  }
  return { siteUrl, apiUrl, allowStale };
}

function parsePage(data, page) {
  invariant(isRecord(data) && Array.isArray(data.items) && isRecord(data.pagination)
    && isRecord(data.filters) && Array.isArray(data.filters.categories), "Respuesta de catálogo inválida.");
  const { pagination, items } = data;
  invariant([pagination.page, pagination.pageSize, pagination.total, pagination.pages].every(Number.isSafeInteger)
    && pagination.page === page && pagination.pageSize === PAGE_SIZE && pagination.total >= 0
    && pagination.pages === Math.ceil(pagination.total / PAGE_SIZE), "Paginación de catálogo inconsistente.");
  const expectedLength = Math.min(PAGE_SIZE, Math.max(0, pagination.total - (page - 1) * PAGE_SIZE));
  invariant(items.length === expectedLength, "Cantidad de elementos de página inconsistente.");
  const categories = data.filters.categories;
  invariant(categories.every(validText) && new Set(categories).size === categories.length, "Categorías del catálogo inválidas.");
  return { items, pagination, categories };
}

export async function fetchCatalog(apiUrl, fetchImplementation = fetch, requestOptions = {}) {
  const origin = normalizeOrigin(apiUrl, "VITE_API_URL");
  const budget = createCatalogRequestBudget(requestOptions);
  const items = [];
  let firstPage;
  let page = 1;
  // We advance our own counter; a repeated or changed API page never controls it.
  do {
    const url = new URL("/api/catalog", origin);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    const data = await requestCatalogPage(url.href, page, fetchImplementation, budget);
    const result = parsePage(data, page);
    if (!firstPage) firstPage = result;
    invariant(result.pagination.total === firstPage.pagination.total
      && result.pagination.pages === firstPage.pagination.pages
      && JSON.stringify([...result.categories].sort()) === JSON.stringify([...firstPage.categories].sort()),
    "El catálogo cambió durante la paginación; vuelva a generar el sitemap.");
    items.push(...result.items);
    // Validate cumulatively, so repeated content fails immediately rather than looping.
    validateItems(items, firstPage.categories);
    page += 1;
  } while (page <= firstPage.pagination.pages);
  invariant(items.length === firstPage.pagination.total, "Total de catálogo inconsistente.");
  const itemCategories = new Set(items.map((item) => item.category));
  invariant(firstPage.categories.every((category) => itemCategories.has(category)), "El catálogo contiene categorías sin publicaciones.");
  return { items, categories: firstPage.categories };
}

function validateItems(items, categories) {
  invariant(Array.isArray(items) && Array.isArray(categories) && categories.every(validText)
    && new Set(categories).size === categories.length, "Catálogo inválido.");
  const slugs = new Set();
  const identities = new Set();
  const variantSlugs = new Set();
  const variantIds = new Set();
  for (const item of items) {
    invariant(isRecord(item) && ["FAMILY", "PRODUCT"].includes(item.type) && validText(item.id)
      && validSlug(item.slug) && validText(item.category) && categories.includes(item.category), "Publicación de catálogo inválida.");
    // The public catalog omits active/familyId: its service already excludes these rows.
    // Fail closed if a future or malformed response explicitly contradicts that contract.
    invariant(item.active === undefined || item.active === true, "El catálogo contiene una publicación inactiva.");
    invariant(!slugs.has(item.slug) && !identities.has(`${item.type}:${item.id}`), "Publicación duplicada en el catálogo.");
    slugs.add(item.slug);
    identities.add(`${item.type}:${item.id}`);
    if (item.type === "PRODUCT") {
      invariant(item.familyId === undefined || item.familyId === null, "Una variante agrupada no puede publicarse como producto individual.");
      continue;
    }
    invariant(Array.isArray(item.variants) && item.variants.length > 0
      && Number.isSafeInteger(item.variantCount) && item.variantCount === item.variants.length, "Variantes de familia inválidas.");
    for (const variant of item.variants) {
      invariant(isRecord(variant) && validText(variant.id) && validSlug(variant.slug)
        && (variant.active === undefined || variant.active === true), "Variante de catálogo inválida.");
      invariant(!variantSlugs.has(variant.slug) && !variantIds.has(variant.id), "Variante duplicada en el catálogo.");
      variantSlugs.add(variant.slug);
      variantIds.add(variant.id);
    }
  }
  invariant([...variantSlugs].every((slug) => !slugs.has(slug))
    && [...variantIds].every((id) => !identities.has(`PRODUCT:${id}`)), "Una variante agrupada aparece como publicación comercial.");
}

export function escapeXml(value) {
  invariant(typeof value === "string" && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\uFFFE\uFFFF]/u.test(value), "Texto XML inválido.");
  return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character]);
}

function validateLocations(locations, siteUrl) {
  invariant(locations.length >= STATIC_PATHS.length && new Set(locations).size === locations.length, "Sitemap vacío, incompleto o con URLs duplicadas.");
  for (const location of locations) {
    let url;
    try { url = new URL(location); } catch { throw new Error("URL de sitemap inválida."); }
    invariant(url.origin === siteUrl && url.href === location && !url.username && !url.password
      && !url.hash && !location.toLowerCase().includes("localhost"), "Origen o URL del sitemap incompatible con VITE_SITE_URL.");
    const staticRoute = STATIC_PATHS.includes(url.pathname) && !url.search;
    const categoryRoute = url.pathname === "/productos" && [...url.searchParams.keys()].length === 1
      && url.searchParams.has("category") && validText(url.searchParams.get("category"));
    let productRoute = false;
    try {
      productRoute = /^\/producto\/[^/]+$/.test(url.pathname) && !url.search && validSlug(decodeURIComponent(url.pathname.slice("/producto/".length)));
    } catch { /* Invalid percent encoding is rejected below. */ }
    invariant(staticRoute || categoryRoute || productRoute, "El sitemap contiene una ruta no pública o parámetros no permitidos.");
  }
  invariant(STATIC_PATHS.every((path) => locations.includes(`${siteUrl}${path}`)), "Faltan rutas estáticas públicas en el sitemap.");
}

export function createSitemap(catalog, siteUrl) {
  const origin = normalizeOrigin(siteUrl, "VITE_SITE_URL", true);
  validateItems(catalog.items, catalog.categories);
  const urls = [
    ...STATIC_PATHS.map((path) => ({ loc: `${origin}${path}`, changefreq: path === "/" ? "daily" : "weekly", priority: path === "/" ? "1.0" : "0.8" })),
    ...catalog.categories.map((category) => ({ loc: new URL(`${origin}/productos?category=${encodeURIComponent(category)}`).href, changefreq: "weekly", priority: "0.7" })),
    ...catalog.items.map((item) => ({ loc: `${origin}/producto/${encodeURIComponent(item.slug)}`, changefreq: "weekly", priority: "0.8" })),
  ];
  validateLocations(urls.map((url) => url.loc), origin);
  // The catalog contract exposes no modification timestamp: do not invent lastmod.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_NAMESPACE}">\n${urls.map((url) => `  <url>\n    <loc>${escapeXml(url.loc)}</loc>\n    <changefreq>${url.changefreq}</changefreq>\n    <priority>${url.priority}</priority>\n  </url>`).join("\n")}\n</urlset>\n`;
  const robots = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin/\nDisallow: /checkout\nDisallow: /checkout/\nDisallow: /carrito\n\nSitemap: ${origin}/sitemap.xml\n`;
  return { xml, robots, counts: {
    families: catalog.items.filter((item) => item.type === "FAMILY").length,
    products: catalog.items.filter((item) => item.type === "PRODUCT").length,
    categories: catalog.categories.length,
    urls: urls.length,
  } };
}

export async function validateStaleSitemap(xml, robots, siteUrl) {
  const origin = normalizeOrigin(siteUrl, "VITE_SITE_URL", true);
  invariant(!/<!DOCTYPE|<!ENTITY/i.test(xml), "El sitemap existente contiene declaraciones XML no permitidas.");
  // jsdom is already a frontend build/test dependency; no external entities or network fetches.
  const { JSDOM } = await import("jsdom");
  let dom;
  try { dom = new JSDOM(xml, { contentType: "application/xml" }); } catch { throw new Error("El sitemap existente no es XML válido."); }
  try {
    const root = dom.window.document.documentElement;
    invariant(root.localName === "urlset" && root.namespaceURI === SITEMAP_NAMESPACE, "Raíz XML del sitemap inválida.");
    const locations = [...root.children].map((entry) => {
      invariant(entry.localName === "url" && entry.namespaceURI === SITEMAP_NAMESPACE, "Elemento XML del sitemap inválido.");
      const fields = [...entry.children];
      invariant(fields.every((field) => ["loc", "lastmod", "changefreq", "priority"].includes(field.localName)
        && field.namespaceURI === SITEMAP_NAMESPACE && field.children.length === 0)
        && new Set(fields.map((field) => field.localName)).size === fields.length, "Campos XML del sitemap inválidos.");
      const location = fields.find((field) => field.localName === "loc");
      invariant(Boolean(location), "Falta loc en el sitemap existente.");
      return location.textContent;
    });
    validateLocations(locations, origin);
    const sitemapLines = robots.split(/\r?\n/).filter((line) => /^\s*Sitemap\s*:/i.test(line));
    invariant(sitemapLines.length === 1 && sitemapLines[0].trim() === `Sitemap: ${origin}/sitemap.xml`
      && !robots.toLowerCase().includes("localhost"), "robots.txt no apunta al sitemap de VITE_SITE_URL.");
  } finally {
    dom.window.close();
  }
}
