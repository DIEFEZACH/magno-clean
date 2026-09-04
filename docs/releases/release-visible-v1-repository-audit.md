# Release Visible V1 — auditoría del repositorio

RELEASE_SHA: `050f890f2704b0b6d6a57c7e76e5520525b8c835`. Base productiva confirmada: `f25412ab916549edee0cf4098bca6ad4e29e62c6`. Fecha: 2026-09-04. **Veredicto global NO_GO por P0 de permisos DB; no se detectó un secreto real versionado en el escaneo acotado.** No se borró, movió ni saneó automáticamente ningún archivo.

## Alcance y método

Se inventariaron los 280 archivos del árbol Git exacto del release, no los artefactos que builds paralelos puedan generar. Se revisaron nombres con `git ls-tree`, tamaño de blobs, los 183 paths cambiados desde producción y patrones en texto versionado. Se excluyeron contenidos binarios/PDF, node_modules, dist, .git y archivos privados de entorno del análisis de contenido. Se inspeccionaron sólo nombres de archivos sensibles del worktree original; no se leyeron sus .env, snapshots, dumps ni credenciales. Los dos .env.example se verificaron mediante nombres de claves y detectores, sin revelar valores.

Este análisis no equivale a un escaneo criptográfico de todo el historial ni a una garantía absoluta de ausencia de secretos/PII dentro de PDFs. No se extrajeron documentos técnicos para buscar secretos; su revisión de contenido corresponde a readiness. Se midió el historial alcanzable desde RELEASE_SHA para peso de blobs, sin reescribir Git.

## Hallazgos y clasificación

| Hallazgo | Clasificación | Prioridad / decisión |
| --- | --- | --- |
| RLS=false y grants anon CRUD en seis tablas críticas ya existentes de ambos entornos; adicional ProductFamily/editorial en staging | MUST_FIX_BEFORE_RELEASE | P0; NO_GO. Permisos comprobados, explotación Data API no intentada; exposición HTTP depende de schemas/API habilitados. |
| Legacy /api/products contiene wholesalePrice, mientras /api/catalog lo omite | MUST_FIX_BEFORE_RELEASE | P1_REVIEW del contrato de confidencialidad; preexistente, no nuevo del release. No afirmar privacidad global. |
| Baseline de sitemap/robots versionados con localhost | ACCEPTED condicionado | prebuild debe regenerarlos con origen real; si quedan en artefacto productivo, MUST_FIX_BEFORE_RELEASE. |
| 55 PDFs técnicos fuera de frontend | CLEANUP_AFTER_RELEASE | 450.25 MiB; no bundle, sí impacto severo en clones. |
| 18 copias “ 2” sin seguimiento en worktree original | UNKNOWN_OWNER | Fuera de RELEASE_SHA; preservar y revisar con dueño. |
| PIM derivado/media-association-plan local no versionado | UNKNOWN_OWNER | No puede asumirse fuente versionada del release; verificar procedencia. |
| .DS_Store y .env privados locales originales | ACCEPTED | Ignorados, no versionados, sin leer valores. |
| Cuatro assets sin referencias textuales | CLEANUP_AFTER_RELEASE | 30,923 bytes, sin eliminación automática. |
| Dos delimitadores PRIVATE KEY en pruebas negativas | ACCEPTED | Fixtures sin cuerpo de clave; no secreto real. |
| Logs de arranque/cierre y scripts manuales | ACCEPTED | No hay console.log frontend; no se imprimen secretos de esta auditoría. |
| Basura temporal Git local informada por count-objects | UNKNOWN_OWNER | No ejecutar clean/prune/gc en repositorio compartido. |
| Trigger hijo admite reparenting SQL privilegiado y Media índice redundante | CLEANUP_AFTER_RELEASE | P2; ver auditoría de migraciones. No corrige el P0 de acceso directo. |

### P0 confirmado, con atribución precisa

En ambos entornos, READ-ONLY verificó User, RefreshToken, Order, Payment, InventoryMovement y Product con RLS deshabilitado; anon SELECT/INSERT/UPDATE/DELETE y authenticated SELECT efectivos. Es **preexistente en producción**, no causado por fusionar el release aún no desplegado. En staging, ProductFamily y las seis tablas WebsiteContent* añaden el mismo problema; editorial además confirma authenticated UPDATE. Las tablas editoriales estaban vacías. Evidencia sanitizada privada: `.local/reports/release-visible-v1/production-readonly.json` (2026-09-04T09:46:39.576Z) y `staging-readonly.json` (2026-09-04T09:46:34.877Z), secciones criticalTableAccess/editorialAccess.

No se consultaron filas sensibles de clientes, contraseñas, tokens, órdenes o pagos para demostrarlo. No se hizo petición de explotación ni escritura Data API, y falta confirmar externamente la exposición PostgREST efectiva del schema. Aun con esa limitación, los permisos y la falta de RLS son hechos bloqueantes: Express no intercepta el acceso directo si el schema está expuesto. [Supabase sobre RLS/grants](https://supabase.com/docs/guides/database/postgres/row-level-security).

Corrección propuesta: PR de seguridad separado, nueva migración sobre lista explícita de tablas de aplicación para ENABLE RLS y revocar privilegios cliente/PUBLIC sin abrir políticas; conservar acceso backend autorizado; pruebas locales de denegación. No tocar auth/storage schemas ni defaults globales sin nueva revisión. No aplicar esta noche ni cambiar RELEASE_SHA. QA con admin temporal queda bloqueado: no crear una nueva credencial mientras exista esta exposición.

## Archivos sensibles y copias accidentales

En RELEASE_SHA:

- .env privados: 0; sólo backend/.env.example y frontend/.env.example.
- .DS_Store, dumps, backups, reportes .local/snapshots privados versionados: 0.
- `backend/src/services/stagingCatalog/snapshot.ts` es implementación, no snapshot de datos.
- Archivos “ 2”/copy/copia detectados por nombre: 0.
- Screenshots/PNG derivados nuevos del release: 0; WebP versionados: 0.
- package-lock.json presente en ambos paquetes; backend lock no cambió, frontend lock cambió por tooling de tests.

El worktree original conserva `backend/.env` y `backend/.env.staging`, además de .DS_Store ignorados. Sus valores no se leyeron. Las siguientes 18 copias no versionadas se dejaron intactas y no están en el release:

- `backend/prisma/migrations/20260831090000_product_families/migration 2.sql`
- `backend/prisma/migrations/20260831090000_product_families/rollback 2.sql`
- `backend/src/routes/catalog 2.ts`
- `backend/src/schemas/catalog 2.ts`
- `backend/src/schemas/productFamilies.test 2.ts`
- `backend/src/services/catalog 2.ts`
- `backend/src/services/catalog.test 2.ts`
- `backend/src/services/inventoryImport 2.ts`
- `backend/src/services/inventoryImport.test 2.ts`
- `docs/CATALOG_API 2.md`
- `frontend/src/components/commerce/CheckoutUnavailable 2.tsx`
- `frontend/src/components/product/ProductCard 2.tsx`
- `frontend/src/hooks/useCatalog 2.ts`
- `frontend/src/hooks/useCheckoutAvailability 2.ts`
- `frontend/src/pages/AdminProductFamilies 2.tsx`
- `frontend/src/pages/ProductDetail 2.tsx`
- `frontend/src/pages/Products 2.tsx`
- `frontend/src/types/catalog 2.ts`

También hay archivos PIM derivados no versionados en docs/product-data (catalog.json, product-mapping.json, media-association-plan.json, review/optimization reports y products/*.json); ownership y procedencia pendientes. No se copian a la rama documental ni se presentan como datos versionados.

## Secretos, rutas y URLs

Escaneo acotado por patrones: claves privadas, formatos de tokens GitHub/AWS/Stripe/OpenAI/Supabase/JWT y asignaciones de credenciales. Se reportan nombres de archivo y clasificación, nunca valores.

- Dos coincidencias por encabezado PRIVATE KEY: `backend/src/services/productFamilyPlanConfig.test.ts:279` y `backend/src/services/stagingCatalogConfig.test.ts:234`. Cada una es fixture de rechazo; 0 cuerpos de clave completos. No se hallaron tokens de formato real en el conjunto de texto auditado.
- Asignaciones con nombres de credenciales sólo en fixtures de tests; workflow usa valores CI sintéticos; ejemplos no tienen patrones de secreto real.
- Ruta absoluta tipo /home/...: sólo `backend/src/services/productFamilyPlan.test.ts`, fixture de sanitización. No ruta privada real introducida en runtime.
- URLs staging: sólo tests en el árbol versionado; ninguna URL staging literal en código runtime de frontend/backend productivo.
- localhost: entornos de desarrollo/config defaults, CI/E2E, tests y ejemplos/documentos; `frontend/public/sitemap.xml` y robots.txt baseline también lo contienen. `frontend/scripts/generateSitemap.mjs` los regenera en prebuild y valida fallback con mismo VITE_SITE_URL; release debe usar variables explícitas y generación normal. No usar los ficheros baseline tal cual como artefacto final.
- TODO=0 y FIXME=0 en texto versionado auditado.

Referencias de localhost detectadas (el JSON de inventario no los trata como cambio nuevo si ya existían):

- `.github/workflows/ci.yml`
- `PRODUCTION_CHECKLIST.md`
- `backend/src/config/env.ts`
- `backend/src/middleware/checkoutAvailability.test.ts`
- `backend/src/services/catalog.test.ts`
- `backend/src/services/productFamilyPlanConfig.test.ts`
- `backend/src/services/stagingCatalogConfig.test.ts`
- `docs/release-visible-v1.md`
- `frontend/e2e/product-detail-media.spec.ts`
- `frontend/playwright.config.ts`
- `frontend/public/robots.txt`
- `frontend/public/sitemap.xml`
- `frontend/scripts/buildForCi.mjs`
- `frontend/scripts/sitemap.mjs`
- `frontend/scripts/sitemap.test.mjs`
- `frontend/src/lib/config.ts`
- `frontend/vite.config.ts`

## Logs y posible código/asset sin uso

console.log sólo en `backend/src/index.ts` y scripts manuales importMagnoProducts, releaseExpiredReservations, seedAdmin, testInventory, seedProducts. El entrypoint imprime arranque/cierre, no credenciales. Frontend: ninguna coincidencia console.log. No ejecutar esos scripts para “probar” el escaneo.

Sin referencias textuales desde otros archivos frontend: `src/assets/hero.png` (13,057), `src/assets/react.svg` (4,126), `src/assets/vite.svg` (8,709), `public/icons.svg` (5,031). Los tres assets src no entran al bundle si no se importan; public/icons.svg sí puede copiarse aunque no se use. Favicon sí está referenciado. Clasificación conservadora: candidatos a limpieza; referencias dinámicas/uso externo no se prueban con búsqueda textual. No se afirma ausencia total de código muerto; tests, TypeScript y lint aportan verificación independiente.

## PDFs, bundle e historial Git

| Medición | Resultado |
| --- | ---: |
| Archivos del release | 280 |
| Tamaño total blobs árbol release | 473,785,933 bytes |
| PDFs técnicos | 55 |
| PDFs (decimal) | 472,125,150 bytes / 472.13 MB |
| PDFs (binario) | 450.25 MiB |
| Fracción del árbol ocupada por PDF | 99.65% |
| PDFs ≥5 MiB | 43 |
| Árbol del commit productivo anterior | 672,284 bytes |
| Objetos alcanzables desde RELEASE_SHA | 635 |
| Blobs históricos únicos alcanzables | 376 / 474,687,476 bytes |
| PDFs históricos únicos | 55 / 472,125,150 bytes |
| Almacén local Git observado | 446.19 MiB loose, 0 packs |

**Los ~450 MiB de PDFs no se importan al bundle ni se copian al frontend por la configuración del release.** Están bajo docs/ en raíz, fuera de frontend/public/src; Vite usa frontend como raíz; no hay imports .pdf/docs ni comandos de copia desde docs. Backend build usa tsc con rootDir=src; tampoco copia docs. El resultado compilado debe corroborarse en el reporte de build de certificación (no había dist cuando se hizo esta medición estática). Vite copia public y procesa assets importados, no carpetas arbitrarias hermanas. [Referencia Vite](https://vite.dev/guide/assets.html).

Los PDF sí pertenecen al mismo repositorio Git y pasan de un árbol de menos de 1 MB a ~474 MB, aunque Render use backend como root de build. Esto explica un riesgo real de clones lentos/transferencia y checkout; no se midió latencia exacta del clone remoto ni se atribuye cada demora observada exclusivamente al PDF. El tamaño de transferencia comprimido depende del proveedor/cache/historial, no es igual al total bruto de blobs. El historial alcanzable de RELEASE_SHA contiene 55 blobs PDF únicos, sin versiones históricas adicionales de esos PDFs al SHA auditado; no se atribuyen esos blobs al commit productivo anterior.

Archivos mayores (top 5):

- `docs/Ficha y hoja de seguridad chazam.pdf`: 22,474,862 bytes.
- `docs/Ficha y hoja de seguridad citrical.pdf`: 21,593,351 bytes.
- `docs/Ficha y hoja de seguridad crema limpiadora.pdf`: 18,275,882 bytes.
- `docs/Ficha y hoja de seguridad dry speed.pdf`: 17,864,712 bytes.
- `docs/Ficha y hoja de seguridad detergente z.pdf`: 17,242,349 bytes.

### Opciones posteriores, sin ejecutar migraciones Git

1. **Repositorio PIM separado (preferencia):** fuentes PDF/media en repo o almacén editorial separado con manifest SHA-256; runtime conserva sólo contratos/metadatos necesarios. Evita traer fuentes pesadas al clone de aplicación; requiere flujo de trazabilidad/licencias/backup.
2. **Git LFS:** punteros en Git y objetos grandes separados. Verificar soporte/smudge/cuotas en proveedores antes de elegir; no dar por hecho que acelera si el build descarga todos los objetos LFS. [GitHub LFS](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage).
3. **Limpieza de historial futura:** quitar PDFs en un commit nuevo no quita blobs del historial; una reescritura necesita ventana coordinada, backup, manejo de ramas/tags y nuevo clone de colaboradores. No se ejecutó ni se propone force push durante esta tarea.

`git count-objects` informó dos entradas locales de garbage (un archivo temporal y refs del worktree compartido), ~3.40 MiB. Son almacenamiento local, no evidencia de blobs publicados; no se eliminaron ni se hizo gc/prune. Revisar sólo tras terminar tareas concurrentes y con ownership claro.

## Cierre

No runtime, migraciones, dependencias ni archivos del worktree original fueron modificados por esta auditoría. No hubo cambios DB, Storage, DNS ni deployments. El problema de peso Git es posterior al release; **el P0 de permisos/RLS es bloqueante ahora**. Un escaneo de repo limpio de secretos no resuelve ese problema de configuración/acceso.
