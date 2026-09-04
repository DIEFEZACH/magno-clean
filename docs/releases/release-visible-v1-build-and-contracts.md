# RELEASE VISIBLE V1 — Build, catálogo y contratos

Fecha: 2026-09-04T09:49:43.845Z. Runtime certificado: `050f890f2704b0b6d6a57c7e76e5520525b8c835`.

## Resultado y alcance

La suite existente pasa **309/309 pruebas, 0 fallidas y 0 omitidas**. Se ejecutaron además 22 verificaciones aisladas: 7 HTTP de seguridad, 8 escenarios de comercio en navegador y 7 órdenes de catálogo con resultados exactos; todas pasan. El código runtime, dependencias, migraciones y datos no fueron modificados.

El catálogo agrupado y el sitemap de staging cumplen los conteos esperados. Hay un **P1 de contrato privado preexistente**: la ruta pública legacy `GET /api/products` expone la clave `wholesalePrice` en 98/98 objetos. El catálogo nuevo `/api/catalog` y sus detalles no la exponen. No se registran valores de precios privados en esta evidencia. La corrección debe ir en una rama y PR separados, nunca incorporarse silenciosamente al SHA certificado.

La simulación normal del build con API productiva queda **bloqueada por el orden de liberación**: la API antigua responde 404 a `/api/catalog`. La segunda simulación aislada compila con las URLs productivas exactas y un fixture público capturado de staging. No representa una validación del catálogo productivo ni un despliegue; el release productivo deberá generar un sitemap fresco después de desplegar backend y aplicar el plan.

## Entorno y reproducibilidad

- Node v22.14.0; npm 10.9.2; versiones instaladas según ambos `package-lock.json` (Prisma 7.10.0 y Vite 8.2.2).
- Ambos `npm ci` concluyeron con código 0: backend 388 paquetes / 421.67 s; frontend 264 paquetes / 421.30 s.
- Los procesos locales usaron un entorno explícito de pruebas, `DOTENV_CONFIG_PATH=/dev/null`, una URL de DB ficticia en loopback con puerto sin servicio y endpoints `.invalid`. No se cargaron archivos reales de entorno ni credenciales. Las pruebas versionadas de loaders construyen sus propias muestras sintéticas temporales.
- La suite de backend/frontend fue repetida después de que ambos `npm ci` terminaran por completo; los resultados finales de abajo corresponden a esa repetición.
- No se ejecutaron `audit fix`, actualizaciones de dependencias, migraciones, seeds, importadores, APPLY, sincronización multimedia ni publicación editorial.
- Las pruebas E2E existentes se inspeccionaron antes: interceptan una API ficticia y medios de ejemplo, sin DB ni servicios de pagos. Se ejecutaron las ocho.
- Los artefactos quedaron exclusivamente en `.local/reports/release-visible-v1/`. Los archivos públicos que el prebuild regenera se restauraron con el parche inverso a sus bytes originales, sin reset/checkout.

| Verificación | Resultado | Duración de proceso |
| --- | --- | ---: |
| prisma-format-check | PASS | 1.29 s |
| prisma-validate | PASS | 0.78 s |
| prisma-generate | PASS | 0.82 s |
| backend-build | PASS | 2.45 s |
| backend-tests | PASS | 0.38 s |
| frontend-tests | PASS | 1.85 s |
| frontend-lint | PASS | 2.82 s |
| frontend-typescript | PASS | 2.03 s |
| frontend-playwright | PASS | 6.91 s |
| frontend-staging-build | PASS | 3.40 s |
| frontend-production-live-build | BLOCKED: API productiva antigua devuelve 404 | 0.64 s |
| frontend-production-fixture-build | PASS | 2.66 s |

El tiempo nativo de backend fue 266.736 ms; Vitest, aproximadamente 1 s; las 60 pruebas de scripts/sitemap, 424.143 ms; Playwright incluye seis anchos (320, 375, 430, 768, 1024 y 1440), selector por teclado, query, slug histórico y OpenGraph de producto individual. El barrido real completo de staging se documenta por separado.

Warnings: deprecación de transitivas `inflight@1.0.6`, `rimraf@2.7.1`, `glob@7.2.3`; advertencia deliberada de Vite por `outDir` fuera del proyecto. No hubo warnings de lint/TypeScript ni fallos de pruebas. La salida de instalación no aporta un resultado de auditoría de vulnerabilidades; no se afirma que la auditoría sea limpia.

## Builds y tamaño

Build staging: `VITE_API_URL=https://magno-clean-api-staging.onrender.com`, `VITE_SITE_URL=https://magno-clean-staging.pages.dev`, `SITEMAP_ALLOW_STALE=false`, `SITEMAP_ENVIRONMENT=staging`.

Intento productivo normal y simulación aislada: `VITE_API_URL=https://magno-clean-api.onrender.com`, `VITE_SITE_URL=https://www.magnoclean.com.mx`, `SITEMAP_ALLOW_STALE=false`, `SITEMAP_ENVIRONMENT=production`. Sólo la simulación aislada sustituye la respuesta del catálogo durante el prebuild; ninguna otra solicitud queda permitida por ese fixture.

Ambos builds completos transforman 2,400 módulos y generan 57 assets. Staging: 750,202 bytes de assets; simulación productiva: 750,186 bytes. El HTML y el código de configuración del artefacto productivo contienen el origen productivo correcto, sin el origen de API staging.

| Chunk principal de la simulación productiva | Bytes | Gzip local, bytes |
| --- | ---: | ---: |
| index-DexEDCi-.js | 260,466 | 82,092 |
| AdminProducts-BiwzPmsj.js | 142,019 | 44,889 |
| Checkout-C3Vwcmoe.js | 98,837 | 28,930 |
| index-C6UTA8gY.css | 50,985 | 9,152 |
| AdminContentEditor-CdlRcbSm.js | 24,364 | 6,731 |
| ProductDetail-DsiQMJH9.js | 14,145 | 4,663 |

El gzip de esta tabla se recalculó con `node:zlib.gzipSync` por archivo; no es una transferencia medida del CDN. La lista completa y los valores reportados por Vite permanecen en JSON/logs. No se obtuvo un artefacto comparable del despliegue productivo anterior, por lo que no se inventa una diferencia de tamaño.

## Catálogo público de staging

Resultado: **25 FAMILY + 16 PRODUCT = 41 publicaciones**, con **79 variantes** y 95 SKU activos públicamente disponibles para consulta. Los 95 reportan `available=false`, `availableStock=0`; ninguna variante se repite como card individual. Los tres inactivos se confirman mediante la conciliación DB de la certificación, no por inferencia de una API que los omite.

- Paginación de 16 elementos: páginas 1 y 2 con 16, última con 9, fuera de rango con 0; `total=41`, `pages=3`, sin repetidos.
- Categoría, marca, featured true/false, combinación y limpieza de filtros coinciden exactamente con la captura completa. El catálogo actual sólo tiene una categoría y una marca; featured positivo tiene resultado vacío, no se inventaron publicaciones destacadas.
- Los siete órdenes responden 200 y conservan las 41 publicaciones. Nombre, precio y featured se verificaron directamente; newest/oldest no exponen timestamps públicos, y su orden exacto se comprobó con fixtures locales del servicio real.
- Búsquedas verificadas: CITRICAL, PLCT1/2/3, CHAZAM, PLCZ2, ORANGE LIQUID, PLOLG, MULTIFIBRAS, EMLF20, APC TNT, APCG, NEUTRO CAR, SCN20, término y código inexistentes.
- MULTIFIBRAS devuelve correctamente tres familias distintas: base, LYPTUS y ORANGE. Una primera aserción de “un resultado” fue corregida contra los datos reales, no se trata de un defecto.
- Cada búsqueda por código de variante devuelve sólo su familia, sin una publicación SKU adicional.
- Ausentes en listas/detalles agrupados: costos, wholesalePrice, reservedStock, familyId interno, auditoría, fuentes editoriales, hashes y Service Role.

## Detalles, variantes y slugs históricos

Se verificaron por GET los cinco detalles familiares pedidos y los 18 slugs históricos de todas sus variantes: CITRICAL (3), CHAZAM (3), ORANGE LIQUID (4), MULTIFIBRAS (4), APC TNT (4). Cada respuesta conserva canonical familiar y el `selectedVariantId` del Product real; IDs de variantes distintos al de familia, labels y órdenes válidos, precios, oldPrice e imágenes presentes según el catálogo.

`neutro-car-20-lts` es un slug histórico de SCN20 dentro de `neutro-car`, no un producto independiente. Se validó aparte un PRODUCT real, `bio-wash-enjuague-kiwi-1-5-kg`, con canonical propio. Slug inexistente devuelve 404.

Los tests existentes y los fixtures de navegador verificaron selector por teclado, query válida/inválida y fallback, canonical sin query, medios familiares, ProductGroup, imagen física de PRODUCT y ausencia de compra con stock cero. El navegador real de staging cubre los detalles visuales y navegación SPA por separado.

## Sitemap, robots y SEO

Sitemap publicado de staging y ambos artefactos completos: XML válido, **48 URLs calculadas = 41 comerciales + 1 categoría + 6 estáticas**. Las comerciales corresponden exactamente a 25 familias y 16 individuales; se excluyen los 79 slugs agrupados. Cero duplicados, query de variante, localhost, admin, carrito o checkout. Robots apunta al sitemap del mismo origen.

Las 60 pruebas de scripts incluyen contrato/paginación, exclusión de variantes/inactivos, XML, orígenes, fallback y generador. `SITEMAP_ALLOW_STALE=true` sólo admite un sitemap del mismo origen; localhost/origen ajeno se rechazan. Producción con guard explícito rechaza stale. El intento productivo real falló de forma cerrada, sin reutilizar el sitemap staging.

OpenGraph, Twitter, ProductGroup, Product y BreadcrumbList están implementados en Seo/ProductDetail; Organization y WebSite en Home. Canonical y metadatos de imagen están cubiertos por los tests/E2E; la comprobación visual real queda en el reporte QA, sin prometer SSR ni rastreo externo de buscadores.

## Seguridad y estados de comercio

Verificado por GET/OPTIONS de staging: /health y /ready 200, Helmet, x-request-id y eco de ID válido, CORS permitido, origen desconocido 403, preflight 204, query inválida 400, admin sin token 401. Se observan headers de limitador global 200/900 s, sin agotarlo intencionadamente.

Los casos 415, JSON/payload inválido 400, CUSTOMER 403 y rate limit moderado se ejecutaron **sólo contra un servidor local aislado**: siete verificaciones pasan; cero DB writes. No se enviaron POST, checkout, pagos ni webhooks a staging/producción.

Staging devuelve actualmente `checkoutEnabled=true`, consistente con su configuración TEST preexistente confirmada por la coordinación. No se cambió el flag. Esto no prueba cierre live de staging: allí se certifican stock cero y estados vacíos. La exigencia productiva `CHECKOUT_ENABLED=false` pertenece a la auditoría productiva separada.

Ocho escenarios aislados de navegador pasan: checkout false, true con carrito vacío, carrito vacío, status 503, timeout de transporte, petición pendiente, agotado y variante inválida. Cero intentos no-GET en navegador, cero envío de checkout. El hook no tiene deadline explícito: una petición pendiente sigue en loading sin habilitar compra; el error/timeout de transporte termina en estado cerrado después de los reintentos.

Cookies: fuente inspeccionada configura HttpOnly, SameSite=strict, Secure en NODE_ENV=production, path /api/auth. No se afirma una cookie live de sesión autenticada a partir de esta lane; no se creó usuario ni sesión.

## Evidencia y límites

JSON versionado acompañante: `release-visible-v1-build-and-contracts.json`. Evidencia ignorada: logs de comandos, capturas de contratos públicos, sitemap/robots publicados, artefactos, fixtures y resultados bajo `.local/reports/release-visible-v1/`.

Las primeras aserciones demasiado estrictas sobre MULTIFIBRAS y NEUTRO CAR se mantienen en el log bruto y están interpretadas explícitamente en el resumen JSON. No se suman como defectos del release ni se ocultan.

Esta lane hizo 75 solicitudes de backend staging entre contrato inicial, ampliaciones, prebuild y repetición del resumen; dos pares de lecturas del sitemap/robots del frontend. La única consulta de API productiva fue la lectura pública que el prebuild normal necesitó y que recibió 404. No hay mutaciones productivas, migraciones, APPLY, deployment, DNS, Mercado Pago LIVE, stock, usuarios, Storage ni contenido editorial.

