# Smoke tests de liberación — procedimientos futuros, no ejecutados

RELEASE_SHA auditado: `050f890f2704b0b6d6a57c7e76e5520525b8c835`. **NO_GO:** no desplegar ni hacer APPLY de este candidato. Las pruebas posteriores de producción sólo se ejecutan en una ventana autorizada para un SHA corregido y recertificado.

No POST de checkout,create-preference,pagos o webhooks; no importar productos ni inventario; no crear usuarios productivos de prueba. Respuestas sensibles se validan por presencia de campos sin imprimir valores. Rate limit200/15 minutos compartido: evitar corridas paralelas y ráfagas; reutilizar resultados cuando no cambió el artefacto.

## Puertas mínimas por momento

| Momento | Lectura | Criterio |
| --- | --- | --- |
| Antes de familias,después del backend | /health,/ready,/api/checkout/status |200,request ID,headers esperados,checkoutEnabled=false |
| Antes de APPLY | DRY-RUN completo |25 CREATE,79 LINK,16 individuales,0 conflictos,0 escrituras |
| Después de APPLY | DRY-RUN completo |25/79 UNCHANGED,0 escrituras; no segundo APPLY |
| Después de Pages | Catálogo,detalles,sitemap,robots |41 publicaciones;25/79/16;origen productivo;sin duplicados/variantes/inactivos |
| Cierre | Metadatos READ ONLY autorizados |98/95/3,stock/reservas sin cambio,WebsiteContent/Media no publicados,seguridad corregida |

## Lector público autocontenido posterior a agrupación

Desde frontend del SHA sucesor y tras instalar sus dependencias. Reutiliza el generador/validador del release, no mocks,stale ni un contador hardcodeado de48 URLs. Rechaza el SHA auditado NO_GO. No se ejecutó el bloque; su sintaxis fue comprobada localmente. Su ejecución futura sólo usa GET, no escribe archivos ni estados remotos y emite un resumen sin valores privados.

```sh
node --input-type=module - "$RELEASE_TARGET_SHA" <<'NODE'
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { JSDOM } from "jsdom";
import { fetchCatalog, createSitemap, validateStaleSitemap } from "./scripts/sitemap.mjs";

const API = "https://magno-clean-api.onrender.com";
const SITE = "https://www.magnoclean.com.mx";
const NO_GO_SHA = "050f890f2704b0b6d6a57c7e76e5520525b8c835";
const PRIVATE_KEYS = new Set([
  "costPrice", "wholesalePrice", "reservedStock", "familyId",
  "sourceTechnicalData", "derivedCommercialContent", "sourceSha256",
  "sourceFile", "passwordHash", "refreshToken", "serviceRoleKey",
  "audit", "auditLog"
]);
function check(condition) { if (!condition) throw new Error("SMOKE_CHECK_FAILED"); }
function hasPrivateKeys(value) {
  if (Array.isArray(value)) return value.some(hasPrivateKeys);
  return value && typeof value === "object"
    ? Object.entries(value).some(([key, child]) => PRIVATE_KEYS.has(key) || hasPrivateKeys(child))
    : false;
}
async function getJson(route) {
  const response = await fetch(API + route, {
    method: "GET", redirect: "error", signal: AbortSignal.timeout(15000)
  });
  check(response.status === 200);
  check(response.headers.get("x-request-id"));
  check(response.headers.get("x-content-type-options") === "nosniff");
  const body = await response.json();
  check(!hasPrivateKeys(body));
  return body;
}
function xmlLocations(xml) {
  const dom = new JSDOM(xml, { contentType: "application/xml" });
  try { return [...dom.window.document.querySelectorAll("url > loc")].map((x) => x.textContent); }
  finally { dom.window.close(); }
}
try {
  const targetSha = process.argv[2];
  check(/^[a-f0-9]{40}$/.test(targetSha || "") && targetSha !== NO_GO_SHA);
  check(execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }).trim() === targetSha);
  const bytes = fs.readFileSync("../docs/product-data/product-family-plan.json");
  check(createHash("sha256").update(bytes).digest("hex") ===
    "686cec7028b355fcc171fad41d2881af4442c9cea68f3a13b576c957bcea0710");
  const plan = JSON.parse(bytes);
  await getJson("/health");
  await getJson("/ready");
  check((await getJson("/api/checkout/status")).checkoutEnabled === false);
  const legacy = await getJson("/api/products");
  check(Array.isArray(legacy.products) && legacy.products.length === 98);
  check(legacy.products.filter((p) => p.active).length === 95);
  check(new Set(legacy.products.map((p) => p.code)).size === 98);
  const catalog = await fetchCatalog(API);
  check(!hasPrivateKeys(catalog));
  const families = catalog.items.filter((item) => item.type === "FAMILY");
  const individuals = catalog.items.filter((item) => item.type === "PRODUCT");
  check(families.length === plan.families.length && individuals.length === plan.individuals.length);
  check(catalog.items.length === plan.summary.commercialItems);
  for (const expected of plan.families) {
    const family = families.find((item) => item.slug === expected.familySlug);
    check(family && family.variants.length === expected.variants.length);
    check(expected.variants.every((v) => family.variants.some((actual) =>
      actual.code === v.code && actual.slug === v.productSlug &&
      actual.label === v.variantLabel && actual.sortOrder === v.variantSortOrder)));
  }
  check(plan.individuals.every((expected) => individuals.some((item) =>
    item.slug === expected.slug && item.code === expected.code)));
  const slugSet = new Set(catalog.items.map((item) => item.slug));
  check(!plan.inactive.some((p) => slugSet.has(p.slug)));
  check(families.every((f) => f.variants.every((v) => !slugSet.has(v.slug))));

  for (const slug of ["citrical", "chazam", "orange-liquid", "multifibras", "apc-tnt", "neutro-car-20-lts"]) {
    const detail = await getJson("/api/catalog/" + slug);
    check(detail.websiteContent === null);
    check(detail.canonicalSlug === (slug === "neutro-car-20-lts" ? "neutro-car" : slug));
    if (slug === "neutro-car-20-lts") {
      check(detail.item.variants.some((v) => v.code === "SCN20" && v.id === detail.selectedVariantId));
    }
  }
  const expectedSitemap = createSitemap(catalog, SITE);
  const xmlResponse = await fetch(SITE + "/sitemap.xml", { redirect: "error", signal: AbortSignal.timeout(15000) });
  const robotsResponse = await fetch(SITE + "/robots.txt", { redirect: "error", signal: AbortSignal.timeout(15000) });
  check(xmlResponse.status === 200 && robotsResponse.status === 200);
  const xml = await xmlResponse.text();
  const robots = await robotsResponse.text();
  await validateStaleSitemap(xml, robots, SITE);
  const actualUrls = xmlLocations(xml).sort();
  const expectedUrls = xmlLocations(expectedSitemap.xml).sort();
  check(JSON.stringify(actualUrls) === JSON.stringify(expectedUrls));
  check(!xml.includes("<lastmod>"));
  console.log(JSON.stringify({
    status: "POST_GROUPING_PUBLIC_SMOKE_PASSED",
    families: families.length, individuals: individuals.length,
    variants: families.reduce((total, family) => total + family.variants.length, 0),
    commercialItems: catalog.items.length, sitemapUrls: actualUrls.length,
    checkoutEnabled: false, writeOperations: 0
  }));
} catch {
  console.error("PUBLIC_SMOKE_FAILED_STOP_RELEASE_NO_PAYLOAD_LOGGED");
  process.exitCode = 1;
}
NODE
```

El lector exige el baseline98/95/3 y planhash aprobado; si el negocio cambia el catálogo, detener y actualizar la certificación, no debilitar asserts. Esta muestra recorre seis detalles representativos: no reemplaza auditoría exhaustiva de41 páginas ni inspección de imágenes por SKU.

## Navegación y visual, sin transacción comercial

En [www.magnoclean.com.mx](https://www.magnoclean.com.mx), después del futuro deploy:

- Rutas: /,/productos,/categorias,/producto/citrical,/producto/chazam,/producto/orange-liquid,/producto/multifibras,/producto/apc-tnt,/producto/neutro-car-20-lts,/carrito,/checkout,/nosotros,/contacto,/soporte,/privacidad,/terminos,/devoluciones y ruta inexistente.
- Breakpoints320,360,375,390,430,600,768,820,1024,1280,1366,1440,1920; scrollWidth<=viewportWidth; especial/devoluciones320 tras corrección.
- Refresh directo y navegación SPA; H1/H2 no vacíos; imágenes sin fallo;sin Failed to fetch ni errores de consola; foco visible y reduced motion.
- Menú móvil: aria-expanded,teclado,Escape,scroll lock,retorno de foco; objetivos táctiles y textos largos. Conservar P2 opcionales fuera del release si no fueron aprobados.
- Galería/selector: etiquetas y orden;SKU/precio/oldPrice/imagen cambian con variante real; ?variant=CODE válido,inexistente y slug histórico;canonical familiar sin query;ningún familyId entra al carrito.
- Stock0 debe mostrarse agotado. No modificar stock para habilitar un control. Producción checkoutEnabled=false debe mostrar cierre; stagingtrue+stock0 es una observación distinta.
- Relacionados no repiten variantes hermanas como cards. Canonical/OG/Twitter/JSON-LD ProductGroup o Product y BreadcrumbList corresponden al item; Organization/WebSite en portada.
- No pulsar compra ni crear preferencias/pagos; no simular un checkout real para probar que está cerrado.

## Búsqueda,filtros y paginación

Probar categoría,marca,featured,limpiar y combinación;page,pageSize,total,pages,primera/última/fuera de rango. Ordenamientos:featured,name-asc,name-desc,price-asc,price-desc,newest,oldest. En este baseline los productos pueden tener iguales precios/fechas: validar contrato, no inventar una diferencia visual de orden.

Buscar CITRICAL,PLCT1,PLCT2,PLCT3,CHAZAM,PLCZ2,ORANGE LIQUID,PLOLG,MULTIFIBRAS,EMLF20,APC TNT,APCG,NEUTRO CAR,SCN20 y términos/códigos inexistentes. Una coincidencia de variante devuelve sólo su familia, nunca la familia más una card de SKU.

## Seguridad y pruebas que quedan fuera del smoke productivo

- GET admin sin token debe401; CORS desconocido debe403; requests válidos de origen permitido no deben filtrar datos privados.
- CUSTOMER→admin403,Content-Type415,payload400,rate limit,cookies,HttpOnly,SameSite,timeout/error de status y checkout abierto/cerrado se validan con tests/fixtures locales o staging explícitamente autorizados, no mediante escrituras de producción.
- No crear admin temporal mientras persista P0 de tablas. QA autenticado requiere remediación,autorización,cuentas reversibles y limpieza verificable sin tocar baseline.
- Verificar ausencia de costPrice,wholesalePrice,reservedStock,familyId interno,fuentes,hashes,auditoría,JWT y Service Role; no pegar payloads como evidencia.
- Comprobar grants/RLS desde lectura autenticada de metadatos con el launcher/inspector revisado; el éxito de Express ADMIN/PUBLISHED no prueba que Data API no tenga acceso directo.

## Registro mínimo

Fecha UTC,SHA y deployment IDs efectivos,URLs/rutas,HTTP,conteos,condición de cada gate,breakpoint,fallo sanitizado y responsable. Capturas privadas fuera de Git. Fallo de cualquier requisito crítico→detener release; seguir [rollback operativo](release-visible-v1-rollback.md),sin rollback SQL automático.
