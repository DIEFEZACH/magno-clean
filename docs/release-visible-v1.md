# Release visible V1: preparación y operación controlada

Este PR prepara dos cambios: un plan comercial portátil con aplicador reproducible, y un sitemap basado en el catálogo agrupado. **No autoriza migraciones, aplicación de familias ni despliegue productivo.** No cambia checkout, inventario, pagos, autenticación, contenido editorial o Storage.

## Plan canónico

- Archivo: `docs/product-data/product-family-plan.json`.
- SHA-256: `686cec7028b355fcc171fad41d2881af4442c9cea68f3a13b576c957bcea0710`.
- 98 productos: 95 activos y 3 inactivos; 25 familias, 79 variantes y 16 individuales activos; 41 publicaciones comerciales.
- Los tres slugs inactivos se conservan sin familia: `magno-bot-clean-ai`, `magno-hydroforce-2200`, `magno-pro-cyclone-x2`.
- El checksum referencia los bytes exactos, no un JSON reserializado. Cualquier cambio necesita nueva revisión/checksum.
- No contiene IDs, URLs ambientales, inventario, datos personales ni secretos. `selectedImage` es una referencia lógica; no se copia ninguna URL u objeto.
- El catálogo QA y sus familias son un baseline persistente, no fixtures desechables.

## Aislamiento y permisos

La herramienta exige `--env-file` y `--ca-file` explícitos. Lee sólo ese archivo con `dotenv.parse`, sin expansión, sin cargar `.env` por defecto y sin completar desde `process.env`. Verifica el Project Ref tanto en la identidad PostgreSQL como en `SUPABASE_URL` cuando está presente. Admite conexión directa o Session Pooler de Supabase en 5432, base `postgres`, con certificado CA y validación TLS estricta; no usa Transaction Pooler.

Las rutas de credenciales y CA son decisiones del operador y no se versionan. Nunca pegar credenciales en argumentos, chats o reportes. Los logs imprimen sólo conteos, códigos/estados del plan y Project Ref; no datos privados ni errores crudos del driver.

DRY-RUN es el modo por defecto. Usa conexión PostgreSQL de sólo lectura, transacción `REPEATABLE READ READ ONLY`, comprueba `transaction_read_only=on` y finaliza con `ROLLBACK`. No importa el adaptador de escritura.

## DRY-RUN

Ejecutar desde `backend`. Sustituir los marcadores de archivo por rutas privadas locales; no son credenciales ni ejemplos listos para ejecutar sin revisión.

```sh
npm run product-families:apply -- \
  --plan ../docs/product-data/product-family-plan.json \
  --sha256 686cec7028b355fcc171fad41d2881af4442c9cea68f3a13b576c957bcea0710 \
  --environment staging \
  --project-ref heqneuhptatgybddoply \
  --env-file <archivo-env-staging> \
  --ca-file <certificado-ca-oficial> \
  --expected-families 25 --expected-variants 79 --expected-individuals 16 \
  --dry-run
```

Staging ya está agrupado: se esperan 25 `FAMILY_UNCHANGED`, 79 `VARIANT_UNCHANGED`, 0 creaciones/vínculos, 0 conflictos y 0 escrituras. **No volver a aplicarlo en staging para esta preparación.**

Producción todavía no tiene el schema ProductFamily. Su conciliación autorizada es:

```sh
npm run product-families:apply -- \
  --plan ../docs/product-data/product-family-plan.json \
  --sha256 686cec7028b355fcc171fad41d2881af4442c9cea68f3a13b576c957bcea0710 \
  --environment production \
  --project-ref fxbgxjpgfkeuapbmgpmv \
  --env-file <archivo-env-productivo> \
  --ca-file <certificado-ca-oficial> \
  --expected-families 25 --expected-variants 79 --expected-individuals 16 \
  --pre-migration --dry-run
```

`--pre-migration` sólo permite lectura. Comprueba primero el schema mediante metadatos. Si la tabla y las tres columnas faltan completamente, consulta únicamente Product legacy e informa `schema=PRE_MIGRATION`: 25 familias por crear, 79 variantes por vincular, 16 individuales y 0 escrituras. Una instalación parcial aborta. Este resultado **no sustituye** el DRY-RUN completo después de una migración futura autorizada.

## Ejecución futura — requiere autorización independiente

Primero: backup verificable, revisión separada de migraciones pendientes, compatibilidad del backend y DRY-RUN completo sin `--pre-migration`. No realizar esas operaciones como parte de este PR.

El comando de aplicación productiva, sólo para una futura autorización, es:

```sh
npm run product-families:apply -- \
  --plan ../docs/product-data/product-family-plan.json \
  --sha256 686cec7028b355fcc171fad41d2881af4442c9cea68f3a13b576c957bcea0710 \
  --environment production \
  --project-ref fxbgxjpgfkeuapbmgpmv \
  --env-file <archivo-env-productivo> \
  --ca-file <certificado-ca-oficial> \
  --expected-families 25 --expected-variants 79 --expected-individuals 16 \
  --execute --confirm APPLY_PRODUCT_FAMILY_PLAN_PRODUCTION
```

El token de staging es distinto: `APPLY_PRODUCT_FAMILY_PLAN_STAGING`. No se acepta cruzar token, entorno y Project Ref. `--execute` no puede coexistir con `--dry-run` o `--pre-migration`. Los flags desconocidos, duplicados, checksum/conteos incorrectos o cambios de identidad abortan antes de escribir.

## Atomicidad, conflictos e idempotencia

- Una sola transacción Prisma Serializable; bloqueo asesor entre ejecuciones cooperantes y lectura/bloqueo de Product en orden de code.
- Reconsulta y revalida dentro de la transacción. Sólo crea familias ausentes y vincula Product sin familia; no mueve ni elimina productos.
- Familias existentes deben coincidir exactamente, incluidos valores por defecto; diferencias no se sobrescriben. Códigos/slug duplicados, productos desconocidos/inactivos, miembros extra, otra familia, label/sort incompatibles y nombres/slugs distintos del plan bloquean la operación completa.
- Se comprueban nuevamente conteos/asociaciones y una huella en memoria de todos los campos escalares protegidos antes del commit. No se imprime la huella ni los valores.
- Éxito inicial esperado: 25 familias + 79 vínculos, 104 operaciones de escritura. Segunda ejecución: todo UNCHANGED, ninguna llamada create/update, sin cambios de timestamps.
- Cualquier fallo, colisión o cambio concurrente revierte toda la transacción. No se reintenta automáticamente; requiere nueva conciliación y revisión.
- El DRY-RUN informa `writesPlanned`, `writesPerformed=0` y `writeOperations=0`. Un resultado con conflictos devuelve código de salida 2; errores de configuración/conexión, 1.

Estados de familia: `CREATE_FAMILY`, `FAMILY_UNCHANGED`, `FAMILY_CONFLICT`.

Estados de variante: `LINK_VARIANT`, `VARIANT_UNCHANGED`, `UNKNOWN_CODE`, `INACTIVE_PRODUCT`, `PRODUCT_ALREADY_IN_OTHER_FAMILY`, `LABEL_CONFLICT`, `SORT_ORDER_CONFLICT`, `SLUG_CONFLICT`, `INVALID`.

## Campos preservados

El payload de actualización contiene exclusivamente `familyId`, `variantLabel`, `variantSortOrder`. Prisma actualizará `Product.updatedAt` sólo al vincular.

Se preservan id, slug, code, name, brand, category, description, imageUrl, badge, active, featured, todos los precios, stock, reservedStock, minStock y createdAt. No se escriben ProductImage, inventario, reservas, órdenes, pagos, WebsiteContent, revisiones, fuentes o medios. No se elimina Product ni ProductFamily. No hay migración ni backfill en este PR.

## Sitemap y build

- Prebuild consulta `/api/catalog?page=1&pageSize=48` y continúa exactamente hasta `pagination.pages`.
- Rechaza páginas repetidas, totales/categorías cambiantes, duplicados, respuestas inválidas, variantes como items independientes y publicaciones explícitamente inactivas.
- Publica una URL por FAMILY y PRODUCT individual, nunca por SKU agrupado o `?variant=`. Conserva seis rutas públicas estáticas y las categorías del catálogo; excluye admin/carrito/checkout.
- Cada URL usa el origen exacto `VITE_SITE_URL`. No inventa `lastmod`. robots apunta a su sitemap. El catálogo actual produce 41 URLs comerciales + 1 categoría + 6 estáticas = 48; no se codifica ese total en el generador.
- `SITEMAP_ALLOW_STALE=true` puede mantenerse en staging. Sólo reutiliza un sitemap XML válido del mismo origen, con robots coherente y sin localhost, cuando la API no está disponible (red, timeout, 5xx o 429). No encubre JSON/contratos inválidos ni 4xx de configuración.
- En producción mantener `SITEMAP_ALLOW_STALE` ausente o `false`. El guard opcional `SITEMAP_ENVIRONMENT=production` rechaza stale y un SITE de staging; no es una variable obligatoria nueva para staging.
- El respaldo versionado antiguo usa localhost: si la API falla, será rechazado deliberadamente. No se garantiza un build sin API; no rebajar la validación para recuperar un respaldo incompatible.
- CI usa `npm run build:ci`: el prebuild y build reales contra un servidor efímero de catálogo de prueba, sin depender de la API remota ni de stale. `npm test` incluye tests del sitemap además del frontend.

**Orden de release posterior:** schema/backend compatibles → DRY-RUN completo y aplicación autorizada → verificar catálogo productivo agrupado → build frontend con API y SITE productivos y stale desactivado. El backend productivo actual no expone el nuevo catálogo; no desplegar este frontend primero. Esta guía no ejecuta ni autoriza ninguno de esos pasos.

## Reversa operativa

Ante un error de aplicación antes del commit, la transacción revierte todo. Después de una aplicación confirmada, no existe un comando de borrado/desagrupación automático.

La primera reversa operativa de un release es volver a los artefactos backend/frontend previamente verificados, conservar el schema aditivo y detener el avance. El frontend anterior puede seguir consumiendo `/api/products`; no se altera ese contrato. **Nunca usar rollback SQL como primera reversa:** podría destruir familias/historial editorial. Restaurar una base o desvincular asociaciones requiere un plan separado, backup, revisión de dependencias y autorización explícita.

## Validaciones y límites de evidencia

Tests cubren schema/checksum, entorno/confirmación, conflictos, conservación de campos, rollback todo-o-nada e idempotencia con adaptador transaccional de prueba. Los únicos accesos reales de este PR son DRY-RUN con TLS estricto; no se prueba una escritura real en ninguna base. Las migraciones y el comportamiento de un release productivo siguen requiriendo sus autorizaciones independientes.

Las observaciones visuales/editoriales previamente registradas no se corrigen aquí. Este PR no cambia UI, selector de variantes, checkout, contenido o medios.
