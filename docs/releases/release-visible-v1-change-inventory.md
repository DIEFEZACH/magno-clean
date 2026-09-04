# Release Visible V1 — inventario completo

## P0 adicional — tablas críticas legacy en producción

READ-ONLY ampliado confirmó RLS=false y anon SELECT/INSERT/UPDATE/DELETE en User, RefreshToken, Order, Payment, InventoryMovement y Product tanto en producción (2026-09-04T09:46:39.576Z) como staging (09:46:34.877Z); authenticated SELECT también efectivo. En staging, ProductFamily presenta lo mismo, por lo que 7 también es **BLOCKING_RISK**. La parte legacy es preexistente en producción y no fue causada por un deploy del release. Evidencia privada: `production-readonly.json` y `staging-readonly.json`, criticalTableAccess, bajo `.local/reports/release-visible-v1/`.

Se confirma permiso DB, no una explotación HTTP: no se verificó exposición efectiva de schemas PostgREST con clave anónima ni se consultaron filas sensibles. Corregir en PR separado la lista explícita de tablas de aplicación (legacy + familias + editorial), conservando acceso del backend y sin tocar auth/storage ni defaults globales. No ejecutar migración remota en staging o producción. No crear admin temporal mientras User/RefreshToken mantengan esta condición.

## P0 — acceso editorial directo confirmado en staging

La consulta READ-ONLY del 2026-09-04 09:44:38 UTC confirmó en WebsiteContent, WebsiteContentRevision, WebsiteContentSource, WebsiteContentEntry, WebsiteContentFaq y WebsiteContentMedia: RLS=false; anon SELECT/INSERT/UPDATE/DELETE=true; authenticated SELECT/UPDATE=true. Todas tienen cero filas hoy. Evidencia privada: `.local/reports/release-visible-v1/staging-readonly.json`, sección `editorialAccess`; metadatos sanitizados también en el JSON de esta auditoría.

El camino de privilegios está confirmado; no se intentó explotación Data API ni ninguna escritura. Las guardias ADMIN/PUBLISHED de Express no protegen acceso directo a tablas expuestas por Supabase. 8–9 no habilitan RLS ni revocan grants: **BLOCKING_RISK y RELEASE_SHA NO_GO**, aunque el SQL hacia adelante siga siendo aditivo. Producción aún no tiene estas tablas; no se afirma que se hayan migrado ni expuesto allí. [Supabase RLS y privilegios](https://supabase.com/docs/guides/database/postgres/row-level-security).

Corrección propuesta en PR separado: nueva migración posterior a 9, ENABLE ROW LEVEL SECURITY y revocar privilegios anon/authenticated/PUBLIC de las seis tablas, sin políticas de acceso cliente; conservar backend/owner/service_role. ProductFamily fue confirmado con el mismo problema; incluirlo junto a tablas legacy en la corrección acotada. No aplicar durante esta tarea, no editar migraciones previas ni cambiar RELEASE_SHA. Una corrección futura exige revisión y nueva certificación autorizada.

Fecha: 2026-09-04. RELEASE_SHA: `050f890f2704b0b6d6a57c7e76e5520525b8c835`.

Base confirmada por las interfaces de ambos proveedores durante esta certificación: `f25412ab916549edee0cf4098bca6ad4e29e62c6`. Render: `dep-daauc8nlk1mc73ag4he0`; Pages: `33398ca5-6ca9-4240-a52c-390500faf08f`. No se activaron deployments productivos.

El diff contiene 183 archivos: 146 añadidos, 37 modificados y 0 eliminados. Cada ruta tiene exactamente una categoría primaria; el JSON conserva el inventario íntegro estructurado.

## Ejecución automática y orden

Backend: `build=tsc`, `start=node dist/index.js`. Frontend: `prebuild=npm run sitemap`, después `tsc -b && vite build`. Sólo el generador SEO realiza GET de catálogo y escribe los dos artefactos locales; no escribe DB ni Storage. CI usa un catálogo sintético local. Compilar scripts TypeScript no los ejecuta. Los hooks de npm pueden ejecutar tareas de instalación de dependencias, pero no existe hook de proyecto para seeds/appliers/migraciones. [Referencia npm](https://docs.npmjs.com/cli/v11/using-npm/scripts/).

Confirmación expresa: **media:sync, staging:catalog:apply, product-families:apply, importadores, seeds, backups, scripts de inventario, publicación editorial, prisma:migrate y rollback.sql NO se invocan automáticamente por build/start/CI versionados.** Verificar que los comandos configurados fuera del repositorio coincidan; una configuración de proveedor no es inferible desde package.json.

**Secuencia histórica bloqueada, no runbook ejecutable:** migraciones 7–9 → backend RELEASE_SHA → familias → frontend era el plan previo al hallazgo. NO_GO: secuencia original bloqueada. Antes de cualquier futura operación productiva se requiere corrección de seguridad revisada, contención de acceso directo durante la transición, autorización expresa y un nuevo SHA certificado; ni backup ni 9/9 por sí solos levantan este bloqueo.

Los campos de compatibilidad describen dependencias técnicas del código auditado; las acciones manuales son capacidades, no permisos. Toda aplicación/deployment permanece bloqueada por el gate global.

## Matriz de grupos

| Categoría | Archivos | Riesgo | Build ejecuta | Start carga/ejecuta |
| --- | ---: | --- | --- | --- |
| DATABASE_SCHEMA | 4 | P0 | false | false |
| BACKEND_RUNTIME | 2 | MEDIUM | false | true |
| BACKEND_API | 5 | MEDIUM | false | true |
| BACKEND_SECURITY | 3 | MEDIUM | false | true |
| FRONTEND_PUBLIC | 17 | MEDIUM | false | false |
| FRONTEND_ADMIN | 10 | MEDIUM | false | false |
| SEO | 2 | MEDIUM | true | false |
| PRODUCT_FAMILY | 4 | MEDIUM | false | false |
| EDITORIAL | 8 | P0 | false | true |
| MEDIA | 6 | MEDIUM | false | true |
| TOOLING | 10 | LOW | true | false |
| TEST | 23 | LOW | false | false |
| DOCUMENTATION | 59 | LOW runtime / MEDIUM clonación; evidencia editorial no implica aprobación. | false | false |
| NON_RUNTIME_SCRIPT | 30 | HIGH si se ejecutan manualmente en destino incorrecto; no autorun. | NO (TS compilado, no ejecutado) | false |

## DATABASE_SCHEMA

- Funcionalidad: Familias y editorial versionado con medios; esquema Prisma y migraciones 7–9.
- Impacto: Añade 7 tablas, 5 enums y 3 columnas a Product; sin DML de negocio.
- Compatibilidad: Backend antiguo puede seguir leyendo/escribiendo campos antiguos; nuevo requiere 9/9. Frontend antiguo conserva contrato SKU.
- Migraciones: 7, 8, 9
- Variables (sólo nombres): DATABASE_URL
- Riesgo: P0: ProductFamily y tablas editoriales de staging tienen RLS ausente y grants cliente efectivos; bloquea release. DDL sigue aditivo.
- Rollback: Conservar esquema aditivo y volver a deployments previos; no ejecutar rollback.sql.
- Se ejecuta en build: false
- Se carga/ejecuta en start: false
- Acción manual: BLOQUEADO: no aplicar 7–9 del SHA congelado. Aprobar corrección y contención, nueva certificación y backup antes de definir otra secuencia.
- Datos existentes: DDL sobre Product; default 0 en nueva columna; no cambia precios/stock/pedidos.

Archivos:

- `backend/prisma/migrations/20260831090000_product_families/migration.sql`
- `backend/prisma/migrations/20260901033000_editorial_website_content/migration.sql`
- `backend/prisma/migrations/20260902090000_editorial_media/migration.sql`
- `backend/prisma/schema.prisma`

## BACKEND_RUNTIME

- Funcionalidad: Registrar catálogo y editorial; default product-media.
- Impacto: Carga módulos en start; la conexión DB se usa en requests/readiness, no migra ni crea bucket.
- Compatibilidad: Requiere nuevo esquema antes de servir /api/catalog; /ready SELECT 1 no demuestra schema completo.
- Migraciones: 7, 8, 9
- Variables (sólo nombres): SUPABASE_PRODUCT_MEDIA_BUCKET
- Riesgo: MEDIUM: /ready no sustituye verificación 9/9.
- Rollback: Redeploy backend anterior, conservar DB.
- Se ejecuta en build: false
- Se carga/ejecuta en start: true
- Acción manual: BLOQUEADO por NO_GO: ningún deploy del SHA congelado; replanificar sólo con corrección revisada y nuevo SHA certificado.
- Datos existentes: No durante start; escrituras sólo mediante endpoints autorizados.

Archivos:

- `backend/src/config/env.ts`
- `backend/src/index.ts`

## BACKEND_API

- Funcionalidad: Listado y detalle agrupado; administración de familias y contratos validados.
- Impacto: Nuevos endpoints /api/catalog y familias admin; API SKU previa se conserva.
- Compatibilidad: Frontend nuevo depende de catálogo; frontend previo continúa usando /api/products. Legacy wholesalePrice se reporta aparte.
- Migraciones: 7, 8, 9
- Variables (sólo nombres): Ninguna
- Riesgo: MEDIUM: orden backend → familias → frontend.
- Rollback: Volver frontend primero, backend después; no borrar Product.
- Se ejecuta en build: false
- Se carga/ejecuta en start: true
- Acción manual: BLOQUEADO por NO_GO para deployment; smoke READ-ONLY no levanta el bloqueo.
- Datos existentes: Catálogo sólo lectura; admin puede editar familias/vínculos sólo por solicitud autenticada.

Archivos:

- `backend/src/routes/admin.ts`
- `backend/src/routes/catalog.ts`
- `backend/src/schemas/admin.ts`
- `backend/src/schemas/catalog.ts`
- `backend/src/services/catalog.ts`

## BACKEND_SECURITY

- Funcionalidad: Estado checkout público no-store y guardia fail-closed; validación segura de paths.
- Impacto: Permite observar cierre sin ejecutar checkout; evita paths editoriales inseguros.
- Compatibilidad: CHECKOUT_ENABLED=false mantiene cierre; no activa pagos.
- Migraciones: Ninguna
- Variables (sólo nombres): CHECKOUT_ENABLED
- Riesgo: MEDIUM: no confundir disponibilidad de UI con autorización de pago.
- Rollback: Mantener false también en despliegue previo.
- Se ejecuta en build: false
- Se carga/ejecuta en start: true
- Acción manual: Confirmar false sin cambiar variables.
- Datos existentes: No en startup; guardia evita flujo comercial cuando false.

Archivos:

- `backend/src/middleware/checkoutAvailability.ts`
- `backend/src/routes/checkout.ts`
- `backend/src/services/storageObjectPath.ts`

## FRONTEND_PUBLIC

- Funcionalidad: Catálogo agrupado, selector, ProductDetail Premium, navegación y responsive; cierre comercial.
- Impacto: Cambia tarjetas y detalle usando IDs reales de variantes; rutas históricas resuelven canonical familiar.
- Compatibilidad: Compatibilidad técnica del código auditado: requiere catálogo y agrupación del backend nuevo. No autoriza desplegar RELEASE_SHA; cualquier release corregido requiere nuevo SHA certificado.
- Migraciones: 7, 8, 9
- Variables (sólo nombres): VITE_API_URL, VITE_SITE_URL, CHECKOUT_ENABLED
- Riesgo: MEDIUM: orden de despliegue, SEO y responsive.
- Rollback: Volver a deployment anterior de Pages antes que backend.
- Se ejecuta en build: false
- Se carga/ejecuta en start: false
- Acción manual: Build local con variables explícitas permitido; deployment BLOQUEADO hasta corrección y nueva certificación.
- Datos existentes: Lecturas públicas; las acciones de usuario pueden afectar carrito local. No checkout real en certificación.

Archivos:

- `frontend/src/App.tsx`
- `frontend/src/components/commerce/CheckoutUnavailable.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/components/product/ProductCard.tsx`
- `frontend/src/components/product/ProductGallery.tsx`
- `frontend/src/components/sections/CategoriesSection.tsx`
- `frontend/src/components/sections/FeaturedProducts.tsx`
- `frontend/src/hooks/useCatalog.ts`
- `frontend/src/hooks/useCheckoutAvailability.ts`
- `frontend/src/index.css`
- `frontend/src/lib/productDetail.ts`
- `frontend/src/pages/Cart.tsx`
- `frontend/src/pages/Checkout.tsx`
- `frontend/src/pages/Contact.tsx`
- `frontend/src/pages/ProductDetail.tsx`
- `frontend/src/pages/Products.tsx`
- `frontend/src/pages/Support.tsx`

## FRONTEND_ADMIN

- Funcionalidad: Administración de familias y revisión responsive de vistas admin.
- Impacto: CRUD manual de familias/variantes, formularios y navegación interna.
- Compatibilidad: Backend nuevo requerido para pantallas nuevas; rutas existentes mantienen API.
- Migraciones: 7, 8, 9
- Variables (sólo nombres): VITE_API_URL
- Riesgo: MEDIUM: funciones mutantes quedan detrás de ADMIN.
- Rollback: Volver Pages previo; conservar datos/esquema.
- Se ejecuta en build: false
- Se carga/ejecuta en start: false
- Acción manual: QA autenticado con admin temporal BLOQUEADO por exposición User/RefreshToken; ningún deployment hasta nueva certificación.
- Datos existentes: Sólo interacción admin explícita; no ejecuta acciones de datos al construir.

Archivos:

- `frontend/src/components/admin/AdminFeedback.tsx`
- `frontend/src/components/admin/AdminLayout.tsx`
- `frontend/src/pages/AdminCustomers.tsx`
- `frontend/src/pages/AdminDashboard.tsx`
- `frontend/src/pages/AdminInventory.tsx`
- `frontend/src/pages/AdminLogin.tsx`
- `frontend/src/pages/AdminOrders.tsx`
- `frontend/src/pages/AdminProductFamilies.tsx`
- `frontend/src/pages/AdminProducts.tsx`
- `frontend/src/pages/AdminSettings.tsx`

## SEO

- Funcionalidad: Sitemap desde /api/catalog agrupado, deduplicación y validación de fallback/origen.
- Impacto: prebuild escribe frontend/public/sitemap.xml y robots.txt locales; GET API de catálogo.
- Compatibilidad: Producción requiere generación normal con datos agrupados; stale de origen distinto se rechaza.
- Migraciones: 7
- Variables (sólo nombres): VITE_API_URL, VITE_SITE_URL, SITEMAP_ALLOW_STALE, SITEMAP_ENVIRONMENT
- Riesgo: MEDIUM: artefactos localhost versionados deben reemplazarse por prebuild.
- Rollback: Volver deployment Pages previo; no reutilizar sitemap de otro origen.
- Se ejecuta en build: true
- Se carga/ejecuta en start: false
- Acción manual: SITEMAP_ALLOW_STALE=false para liberación productiva; revisar 41 publicaciones.
- Datos existentes: Sólo archivos locales generados; consultas HTTP públicas GET.

Archivos:

- `frontend/scripts/generateSitemap.mjs`
- `frontend/scripts/sitemap.mjs`

## PRODUCT_FAMILY

- Funcionalidad: Plan versionado de 25 familias, 79 variantes y 16 individuales.
- Impacto: Datos declarativos de agrupación, revisión y ayudas UI; no aplica plan por importarse.
- Compatibilidad: Se verifica SHA-256 del plan y conteos antes de leer credenciales en herramienta manual.
- Migraciones: 7
- Variables (sólo nombres): Ninguna
- Riesgo: MEDIUM: aplicar sólo tras dry-run sin conflictos.
- Rollback: Conservar agrupación en rollback normal; desvincular sólo con herramienta controlada y autorización.
- Se ejecuta en build: false
- Se carga/ejecuta en start: false
- Acción manual: Plan APPLY separado, expresamente prohibido esta noche.
- Datos existentes: El plan por sí mismo no escribe; APPLY controla familyId/variantLabel/variantSortOrder.

Archivos:

- `docs/product-data/product-family-plan-review.md`
- `docs/product-data/product-family-plan.json`
- `frontend/src/components/product/VariantSelector.tsx`
- `frontend/src/types/catalog.ts`

## EDITORIAL

- Funcionalidad: Ciclo DRAFT → REVIEW → APPROVED → PUBLISHED, histórico inmutable, fuentes privadas.
- Impacto: API admin y componentes editoriales; público obtiene medios sólo de revisión publicada y objetivo coincidente.
- Compatibilidad: Esquema 8 y 9 requerido; ausencia de contenido publicado es compatible con V1 básico.
- Migraciones: 8, 9
- Variables (sólo nombres): SUPABASE_PRODUCT_MEDIA_BUCKET
- Riesgo: P0: Express ADMIN/PUBLISHED no protege el acceso directo si el schema está expuesto; grants sin RLS confirmados. Corrección separada obligatoria.
- Rollback: Volver deployments conservando todo histórico/editorial; jamás borrar para rollback.
- Se ejecuta en build: false
- Se carga/ejecuta en start: true
- Acción manual: Ninguna publicación autorizada en esta certificación.
- Datos existentes: Servicios admin pueden escribir sólo ante llamadas explícitas autenticadas; no en start.

Archivos:

- `backend/src/routes/websiteContent.ts`
- `backend/src/schemas/websiteContent.ts`
- `backend/src/services/websiteContent.ts`
- `frontend/src/components/product/ProductContentSections.tsx`
- `frontend/src/lib/websiteContent.ts`
- `frontend/src/pages/AdminContent.tsx`
- `frontend/src/pages/AdminContentEditor.tsx`
- `frontend/src/types/websiteContent.ts`

## MEDIA

- Funcionalidad: Manifest y serialización/inspección de WebP editorial seguro.
- Impacto: Filtra roles/path/alt/dimensiones/MIME; URLs públicas limitadas por publicación; manifest no sube objetos.
- Compatibilidad: Nuevo schema para asociación; backend arranca sin bucket si no se intenta inspección editorial.
- Migraciones: 9
- Variables (sólo nombres): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PRODUCT_MEDIA_BUCKET
- Riesgo: MEDIUM: no confundir existencia en Storage con autorización editorial.
- Rollback: Conservar objetos y asociaciones; volver deployments.
- Se ejecuta en build: false
- Se carga/ejecuta en start: true
- Acción manual: No crear bucket, subir ni asociar durante certificación.
- Datos existentes: Inspección Storage GET sólo bajo acción manual; serialización pública sólo lectura.

Archivos:

- `backend/src/services/publicStorageUrl.ts`
- `backend/src/services/publicWebsiteContent.ts`
- `backend/src/services/websiteContentMediaStorage.ts`
- `docs/product-data/media-manifest.json`
- `frontend/src/components/product/ProductEditorialMedia.tsx`
- `frontend/src/lib/editorialMedia.ts`

## TOOLING

- Funcionalidad: CI, dependencias de pruebas, compilación, ignores y ejemplo de nueva variable.
- Impacto: Frontend añade devDependencies de tests/E2E; backend no cambia lock ni dependencias.
- Compatibilidad: Locks presentes en ambos paquetes; Node 22 en CI; no actualización de dependencias durante certificación.
- Migraciones: Ninguna
- Variables (sólo nombres): VITE_API_URL, VITE_SITE_URL, SUPABASE_PRODUCT_MEDIA_BUCKET
- Riesgo: LOW: reproducibilidad, instalación de dev tooling y fixture CI.
- Rollback: Volver commits/artifact anteriores, no tocar datos.
- Se ejecuta en build: true
- Se carga/ejecuta en start: false
- Acción manual: CI/build; configuración en archivos no implica despliegue.
- Datos existentes: No datos remotos: build:ci usa servidor local fixture; prebuild sólo sitemap local.

Archivos:

- `.github/workflows/ci.yml`
- `.gitignore`
- `backend/.env.example`
- `backend/package.json`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/playwright.config.ts`
- `frontend/scripts/buildForCi.mjs`
- `frontend/tsconfig.node.json`
- `frontend/vitest.config.ts`

## TEST

- Funcionalidad: Pruebas backend de catálogos/gates/media/editorial y frontend/componentes/sitemap/E2E.
- Impacto: Aumenta cobertura; pruebas no equivalen a producción ni a QA autenticado.
- Compatibilidad: Fixtures sintéticos; ejecutar sólo suites habituales, no test:inventory mutante.
- Migraciones: Ninguna
- Variables (sólo nombres): Ninguna
- Riesgo: LOW: separar tests de seed/inventory scripts.
- Rollback: Sin datos de producción a revertir.
- Se ejecuta en build: false
- Se carga/ejecuta en start: false
- Acción manual: npm test y E2E explícitos; no se ejecutan automáticamente por npm run build/start.
- Datos existentes: Fixtures locales/sintéticos; no autoriza datos baseline.

Archivos:

- `backend/src/middleware/checkoutAvailability.test.ts`
- `backend/src/schemas/productFamilies.test.ts`
- `backend/src/schemas/websiteContent.test.ts`
- `backend/src/services/catalog.test.ts`
- `backend/src/services/mediaSync.test.ts`
- `backend/src/services/mediaSyncReport.test.ts`
- `backend/src/services/mediaSyncStorageAdapter.test.ts`
- `backend/src/services/productFamilyPlan.test.ts`
- `backend/src/services/productFamilyPlanConfig.test.ts`
- `backend/src/services/productFamilyPlanRunner.test.ts`
- `backend/src/services/publicWebsiteContent.test.ts`
- `backend/src/services/stagingCatalog.test.ts`
- `backend/src/services/stagingCatalogConfig.test.ts`
- `backend/src/services/stagingCatalogImages.test.ts`
- `backend/src/services/stagingCatalogRunner.test.ts`
- `backend/src/services/websiteContent.test.ts`
- `backend/src/services/websiteContentMedia.test.ts`
- `frontend/e2e/product-detail-media.spec.ts`
- `frontend/scripts/sitemap.test.mjs`
- `frontend/src/components/product/ProductEditorialMedia.test.tsx`
- `frontend/src/lib/editorialMedia.test.ts`
- `frontend/src/pages/ProductDetail.test.tsx`
- `frontend/src/test/setup.ts`

## DOCUMENTATION

- Funcionalidad: Guías de catálogo/staging/media/release y 55 fichas técnicas PDF.
- Impacto: 472125150 bytes de PDFs: coste de Git/clone, no bundle frontend.
- Compatibilidad: Documentos no importados por runtime ni copiados por scripts build.
- Migraciones: Ninguna
- Variables (sólo nombres): Ninguna
- Riesgo: LOW runtime / MEDIUM clonación; evidencia editorial no implica aprobación.
- Rollback: No borrar historial en esta tarea; separación PIM/LFS futura.
- Se ejecuta en build: false
- Se carga/ejecuta en start: false
- Acción manual: Revisión humana de fuentes; ninguna publicación automática.
- Datos existentes: No.

Archivos:

- `docs/CATALOG_API.md`
- `docs/Ficha y hoja de seguridad Gel apatologia y neutro conductor.pdf`
- `docs/Ficha y hoja de seguridad acaba-ácaros.pdf`
- `docs/Ficha y hoja de seguridad aditivo alcalin.pdf`
- `docs/Ficha y hoja de seguridad aditom zuma.pdf`
- `docs/Ficha y hoja de seguridad alto poder neutralizer.pdf`
- `docs/Ficha y hoja de seguridad amoxi ultra.pdf`
- `docs/Ficha y hoja de seguridad apc.pdf`
- `docs/Ficha y hoja de seguridad arcilla lunar 300ml.pdf`
- `docs/Ficha y hoja de seguridad arcilla lunar JUNIOR 300ml.pdf`
- `docs/Ficha y hoja de seguridad arcilla lunar.pdf`
- `docs/Ficha y hoja de seguridad bio wash enjuague.pdf`
- `docs/Ficha y hoja de seguridad bio wash pre-lavador.pdf`
- `docs/Ficha y hoja de seguridad blancolchon forte.pdf`
- `docs/Ficha y hoja de seguridad chazam.pdf`
- `docs/Ficha y hoja de seguridad citrical.pdf`
- `docs/Ficha y hoja de seguridad citrimag.pdf`
- `docs/Ficha y hoja de seguridad crema hidratadora.pdf`
- `docs/Ficha y hoja de seguridad crema limpiadora.pdf`
- `docs/Ficha y hoja de seguridad detergente z.pdf`
- `docs/Ficha y hoja de seguridad don remigio.pdf`
- `docs/Ficha y hoja de seguridad dry speed.pdf`
- `docs/Ficha y hoja de seguridad enjuague multifibras orange.pdf`
- `docs/Ficha y hoja de seguridad enjuague multifibras.pdf`
- `docs/Ficha y hoja de seguridad espanta manchas.pdf`
- `docs/Ficha y hoja de seguridad fine cleaner enjuague.pdf`
- `docs/Ficha y hoja de seguridad fine cleaner pre-lavador.pdf`
- `docs/Ficha y hoja de seguridad glicerina pura grado técnico.pdf`
- `docs/Ficha y hoja de seguridad mag seal top.pdf`
- `docs/Ficha y hoja de seguridad magbooster.pdf`
- `docs/Ficha y hoja de seguridad magnifico.pdf`
- `docs/Ficha y hoja de seguridad magno restorer.pdf`
- `docs/Ficha y hoja de seguridad magno shine.pdf`
- `docs/Ficha y hoja de seguridad mata olores enzimatico.pdf`
- `docs/Ficha y hoja de seguridad neutralizador de olores.pdf`
- `docs/Ficha y hoja de seguridad orange liquid.pdf`
- `docs/Ficha y hoja de seguridad oximag.pdf`
- `docs/Ficha y hoja de seguridad permag.pdf`
- `docs/Ficha y hoja de seguridad pexidil.pdf`
- `docs/Ficha y hoja de seguridad plimag.pdf`
- `docs/Ficha y hoja de seguridad poder desoxidante.pdf`
- `docs/Ficha y hoja de seguridad power cristal.pdf`
- `docs/Ficha y hoja de seguridad protemag.pdf`
- `docs/Ficha y hoja de seguridad repel apply wet.pdf`
- `docs/Ficha y hoja de seguridad repel.pdf`
- `docs/Ficha y hoja de seguridad resbala gotas 300ml.pdf`
- `docs/Ficha y hoja de seguridad sarr OFF.pdf`
- `docs/Ficha y hoja de seguridad seven neutro.pdf`
- `docs/Ficha y hoja de seguridad shampoo alfombras.pdf`
- `docs/Ficha y hoja de seguridad shampoo amonia magno.pdf`
- `docs/Ficha y hoja de seguridad shampoo de carrocerías automotriz neutro.pdf`
- `docs/Ficha y hoja de seguridad shampoo germicida.pdf`
- `docs/Ficha y hoja de seguridad shine stone.pdf`
- `docs/Ficha y hoja de seguridad ultra black.pdf`
- `docs/Ficha y hoja de seguridad velero.pdf`
- `docs/Ficha y hoja de seguridad viace clean.pdf`
- `docs/MEDIA_SYNC.md`
- `docs/STAGING_CATALOG_BASELINE.md`
- `docs/release-visible-v1.md`

## NON_RUNTIME_SCRIPT

- Funcionalidad: Herramientas de media sync, baseline staging, ProductFamily y rollback SQL manual.
- Impacto: Compiladas por tsc pero no importadas por entrypoint de start ni invocadas por build; pueden mutar sólo al invocarse.
- Compatibilidad: Flags/gates específicos, ProductFamily dry-run por defecto; rollback.sql destructivo está excluido de liberación.
- Migraciones: 7, 8, 9
- Variables (sólo nombres): DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- Riesgo: HIGH si se ejecutan manualmente en destino incorrecto; no autorun.
- Rollback: No ejecutar rollback.sql; herramientas de cambios sólo con autorización y backup.
- Se ejecuta en build: NO (TS compilado, no ejecutado)
- Se carga/ejecuta en start: false
- Acción manual: Invocación manual separada. APPLY/sync/rollback no autorizados esta noche.
- Datos existentes: Potencialmente sí al execute; dry-run ProductFamily tiene writeOperations=0 y conexión readonly.

Archivos:

- `backend/prisma/migrations/20260831090000_product_families/rollback.sql`
- `backend/prisma/migrations/20260901033000_editorial_website_content/rollback.sql`
- `backend/prisma/migrations/20260902090000_editorial_media/rollback.sql`
- `backend/src/scripts/applyProductFamilyPlan.ts`
- `backend/src/scripts/applyStagingCatalog.ts`
- `backend/src/scripts/exportStagingCatalog.ts`
- `backend/src/scripts/syncProductMedia.ts`
- `backend/src/services/mediaSync/config.ts`
- `backend/src/services/mediaSync/localFile.ts`
- `backend/src/services/mediaSync/manifest.ts`
- `backend/src/services/mediaSync/report.ts`
- `backend/src/services/mediaSync/runner.ts`
- `backend/src/services/mediaSync/storageAdapter.ts`
- `backend/src/services/mediaSync/types.ts`
- `backend/src/services/productFamilyPlan/config.ts`
- `backend/src/services/productFamilyPlan/plan.ts`
- `backend/src/services/productFamilyPlan/readState.ts`
- `backend/src/services/productFamilyPlan/runner.ts`
- `backend/src/services/productFamilyPlan/safeError.ts`
- `backend/src/services/productFamilyPlan/writer.ts`
- `backend/src/services/stagingCatalog/applyRunner.ts`
- `backend/src/services/stagingCatalog/config.ts`
- `backend/src/services/stagingCatalog/imagePolicy.ts`
- `backend/src/services/stagingCatalog/plan.ts`
- `backend/src/services/stagingCatalog/privateFiles.ts`
- `backend/src/services/stagingCatalog/readCatalog.ts`
- `backend/src/services/stagingCatalog/safeError.ts`
- `backend/src/services/stagingCatalog/snapshot.ts`
- `backend/src/services/stagingCatalog/stagingWriter.ts`
- `backend/src/services/stagingCatalog/types.ts`

## Hallazgo contractual fuera del diff

`backend/src/routes/products.ts:73–85` conserva la publicación de `wholesalePrice` en la API SKU legacy, tanto en base como en release. El catálogo nuevo sí usa serialización explícita sin ese campo. Clasificado **P1_REVIEW** hasta resolver confidencialidad/contrato: no declarar todos los endpoints públicos libres de campos privados. No se modificó código.

## Alcance de rollback SQL

Los tres `rollback.sql` añadidos son archivos manuales y destructivos: eliminan estructuras/relaciones editoriales y de familias; el rollback 9 además reinstala el defecto previo del trigger DELETE. Se inventarían por transparencia, **no forman parte del camino productivo ni del rollback operativo recomendado**.
