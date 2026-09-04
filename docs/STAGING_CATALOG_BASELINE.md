# Staging Baseline A: catálogo sanitizado

## Alcance y autorización

Esta herramienta prepara un catálogo de QA en staging a partir de identidades públicas de producto. **En esta etapa sólo se autorizan EXPORT y DRY-RUN.** El comando de escritura se documenta para una autorización futura independiente; no debe ejecutarse todavía.

- Origen de lectura: producción, `fxbgxjpgfkeuapbmgpmv`.
- Destino futuro: staging, `heqneuhptatgybddoply`.
- No se copian inventario, identidades internas, relaciones, datos personales ni contenido editorial.
- No se ejecutan seeds, migraciones, `db push`, uploads, asociaciones multimedia ni publicación editorial.
- No se modifican checkout, Mercado Pago, autenticación, infraestructura ni DNS.

## Baseline persistente de QA, no fixture desechable

Una vez que se autorice y ejecute APPLY por separado, este catálogo será un **baseline persistente de QA en staging**. No debe eliminarse al terminar cada prueba ni incluirse en rutinas de limpieza de fixtures. Los tres productos legacy/inactivos se conservan con `active=false`.

Las pruebas posteriores deben distinguir sus fixtures temporales de estas identidades base. La limpieza sólo puede retirar los datos temporales expresamente autorizados; no debe borrar el catálogo base, sus asociaciones creadas en staging ni otros datos persistentes. Esta herramienta no implementa ninguna operación de borrado. La primera creación y cualquier actualización posterior requieren autorización explícita y un nuevo DRY-RUN revisado.

## Dos fases y dos procesos independientes

### EXPORT: producción exclusivamente READ-ONLY

El exportador carga un único archivo de entorno indicado explícitamente. No completa variables ausentes desde `backend/.env`, otros archivos ni variables heredadas del proceso. Valida el destino antes de abrir la conexión y aborta si no corresponde al Project Ref productivo autorizado.

La conexión usa TLS estricto con el certificado CA oficial de Supabase correspondiente. El exportador consulta únicamente `Product`, mediante una proyección explícita; no contiene operaciones de escritura de datos. Una transacción de sólo lectura protege la consulta. Sólo escribe artefactos locales sanitizados.

### APPLY / DRY-RUN: staging exclusivamente

El proceso independiente de aplicación carga exclusivamente `backend/.env.staging`, de forma explícita y sin completar valores desde `.env` o el entorno productivo. Su entrada de datos es el snapshot local, no una conexión al origen. Nunca recibe ni necesita la `DATABASE_URL` productiva.

Antes de conectarse valida el Project Ref de staging y rechaza el de producción u otro destino. El checksum SHA-256 esperado es obligatorio y se compara con los bytes exactos del archivo, antes de considerar sus registros.

Ninguna fase debe imprimir la URL de conexión, contraseña, Service Role, JWT, credenciales de administrador ni contenido completo de archivos de entorno. Los reportes identifican únicamente entorno, Project Ref y resultados sanitizados.

## Contrato del snapshot: allowlist de 14 campos

Cada registro de producto admite exclusivamente:

| Grupo | Campos |
| --- | --- |
| Identidad comercial | `slug`, `code`, `brand`, `name`, `category` |
| Presentación pública | `description`, `imageUrl`, `badge` |
| Precios públicos autorizados | `price`, `oldPrice`, `digitalPrice`, `retailPrice` |
| Visibilidad | `featured`, `active` |

Las claves desconocidas se rechazan, no se aceptan mediante propagación de objetos. Se validan códigos y slugs no vacíos y únicos; nombre, marca y categoría válidos; booleanos estrictos; precios finitos y no negativos; y URLs sin credenciales. No se exportan IDs ni timestamps productivos.

`imageUrl` puede conservar una URL pública de Cloudinary ya existente. Esto no copia, sube ni altera objetos remotos. No se descarga ni copia `ProductImage` ni ningún objeto de Storage.

### Excepción individual autorizada: SCN20 — NEUTRO CAR

Únicamente este código puede conservar su URL pública actual de Supabase producción. La excepción se fija al SHA-256 de la cadena URL aprobada, además del código exacto `SCN20`; no habilita otras rutas para ese SKU ni otros productos del mismo host.

Se exige HTTPS, host exacto `fxbgxjpgfkeuapbmgpmv.supabase.co`, ruta `/storage/v1/object/public/<bucket>/<objeto>`, sin usuario/contraseña, query (incluso `?` vacío), fragmento, firma, tokens ni patrones de credenciales. Todas las filas se validan antes de consultar el asset. Una segunda referencia productiva no autorizada aborta el export y requiere aprobación independiente.

Antes de generar el snapshot, una petición `HEAD` anónima, sin seguir redirects y con timeout de 15 segundos, debe responder 200 y un MIME de esta allowlist: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/avif`. Se rechazan SVG, HTML, MIME desconocido y errores HTTP. No hay fallback GET ni descarga del cuerpo; no se copia ni altera el objeto.

El reporte, no el objeto Product, incluye `PUBLIC_PRODUCTION_ASSET_REFERENCE` con `count: 1`, `code: SCN20`, motivo, riesgo de dependencia visual temporal respecto de producción y seguimiento para sustituirla posteriormente por un asset propio de staging. También incluye los conteos Cloudinary / Supabase público de producción / null y resultado de la comprobación HTTP. Si SCN20 deja de usar esa URL, otra referencia productiva exige nueva autorización. La comprobación HTTP acredita disponibilidad en ese momento, no garantiza su disponibilidad futura.

Quedan expresamente fuera:

- `costPrice`, `unitPrice`, `wholesalePrice`.
- `id`, `createdAt`, `updatedAt`.
- `stock`, `reservedStock`, `minStock` productivo.
- `familyId`, `variantLabel`, `variantSortOrder` productivo.
- `ProductImage`, familias, reservas y movimientos.
- `WebsiteContent` y todas sus fuentes, revisiones, entradas, FAQ y medios.
- Pedidos, pagos, usuarios, tokens, datos personales e historial.

La validación de patrones sensibles es una barrera adicional, no una garantía universal de anonimización de texto libre. El snapshot debe proceder de la selección autorizada de campos públicos y revisarse antes de cualquier futura aplicación; no se admite contenido añadido manualmente fuera del contrato.

## Defaults y preservación en staging

### Producto nuevo

Se crea con los 14 campos permitidos y los defaults del schema actual:

| Campo | Valor nuevo en staging |
| --- | --- |
| `id` | CUID nuevo generado por Prisma |
| `stock` / `reservedStock` | `0` / `0` |
| `minStock` | `5`, default actual del schema |
| `familyId` / `variantLabel` | `null` / `null` |
| `variantSortOrder` | `0`, default actual |
| `costPrice` / `unitPrice` / `wholesalePrice` | `0` / `0` / `0`, defaults actuales |
| `createdAt` / `updatedAt` | Generados localmente en staging |
| Imágenes relacionadas y contenido editorial | Ninguna relación creada |

Los defaults se verifican contra `schema.prisma`; no se copian los valores productivos equivalentes.

### Producto existente

El identificador de conciliación es `code`, exacto y sensible a mayúsculas/minúsculas. El código no se renombra durante el update. Se actualizan exclusivamente los otros 13 campos de la allowlist si difieren.

Se preservan inventario, mínimo, familia, labels/orden de variantes, imágenes relacionadas, contenido editorial y cualquier relación creada específicamente en staging. Tampoco se sustituyen los precios internos por valores productivos. Una fila `UNCHANGED` no requiere escritura. Las escrituras efectivas usan el comportamiento normal de timestamps de staging; nunca timestamps del snapshot productivo.

No existe eliminación automática. Un código presente en staging y ausente del snapshot es `EXTRA_IN_STAGING`: se reporta y bloquea una futura ejecución hasta decisión humana. No se borra ni se ignora silenciosamente.

## Validación, concurrencia e idempotencia

El DRY-RUN vuelve a consultar staging y construye un plan sin escrituras. Cada fila recibe un estado terminal:

- `CREATE`: código ausente, sin colisión de slug.
- `UPDATE`: código existente con diferencias sólo en campos permitidos.
- `UNCHANGED`: mismos valores permitidos.
- `CONFLICT_CODE`: identidad por código no válida o ambigua.
- `CONFLICT_SLUG`: slug ocupado por otro código.
- `INVALID`: datos o expectativas inválidos.
- `EXTRA_IN_STAGING`: código de staging fuera del snapshot.

Los conflictos, extras e inválidos se explican individualmente y bloquean la escritura. No se decide automáticamente qué producto excluir, renombrar o eliminar.

La futura ejecución exige `--execute`, destino staging exacto y el token de confirmación completo. Vuelve a validar snapshot, checksum, expectativas y estado actual de staging; no confía en un DRY-RUN antiguo. El upsert por `code` se protege mediante transacción `Serializable`, bloqueo asesor de la operación y revalidación bajo bloqueo. Los constraints únicos de la base siguen siendo la autoridad ante concurrencia. Una colisión o fallo no debe producir éxito aparente ni una carga parcialmente confirmada.

El bloqueo asesor coordina ejecuciones de esta herramienta; no se debe asumir que bloquea otros clientes o el panel administrativo. La transacción y los constraints completan esa protección. Las actualizaciones nunca incluyen inventario ni relaciones, aunque hayan cambiado después del preview.

## Conteos esperados: parámetros, no lógica fija

Para la primera ejecución se solicitan explícitamente:

- Total: `98`.
- Activos: `95`.
- Inactivos: `3`.
- Códigos únicos: `98`; slugs únicos: `98`.

Estos números no forman parte de una regla general permanente. Si cambian, el comando aborta y muestra la diferencia; un humano debe aprobar nuevas expectativas. El reporte de exportación identifica `code`, `name` y `active` de los inactivos sin activarlos, eliminarlos ni cambiar su clasificación.

Contra staging vacío se prevén 98 `CREATE`, cero `UPDATE` y cero `UNCHANGED`; es una expectativa que debe comprobarse, no un resultado asumido. El reporte incluye los conteos reales, conflictos, extras, inválidos, activos/inactivos, URLs de imagen presentes, bytes y SHA-256 del snapshot.

## Archivos privados

Los artefactos de exportación se guardan en `.local/staging-baseline/`:

- `products-sanitized-<timestamp>.json`.
- `products-sanitized-<timestamp>.sha256`.
- `products-sanitized-<timestamp>-report.json`.

Los reportes de aplicación permanecen también en una ruta local ignorada. Directorio `0700`; archivos `0600`. `.local/` está excluido de Git. No se versionan snapshots, reportes de ejecución, certificados, archivos `.env`, PNG o WebP. El checksum corresponde al archivo final exacto, no a JSON reserializado ni al contenido de un reporte.

Ambos comandos permiten seleccionar una subcarpeta de ese directorio mediante `--output-dir`; desde `backend/`, el default es `../.local/staging-baseline`. Se rechazan rutas fuera de ese árbol y enlaces simbólicos en el directorio de salida. Para el checksum de aplicación puede utilizarse `--sha256` literal o el sidecar local mediante `--checksum-file`, pero no ambos. Los ejemplos usan `--sha256` para que la aprobación quede asociada inequívocamente al archivo revisado.

## Comandos

Ejecutar desde `backend/`. Los valores entre `<...>` son marcadores que deben reemplazarse localmente; nunca se pegan credenciales en el chat. `--ca-file` debe apuntar al certificado CA oficial verificado del entorno correspondiente. No se desactiva TLS ni se usa `rejectUnauthorized=false`.

El archivo de exportación debe llamarse `.env` o `.env.production` y su destino debe verificarse antes de usarlo. Aplicación acepta únicamente `.env.staging`; los ejemplos lo indican explícitamente aunque sea el nombre por defecto. La herramienta valida también el nombre real del archivo tras resolver su ruta. La validación de que un PEM contiene una CA no acredita por sí sola su procedencia: obtenerla del Dashboard oficial del proyecto, no de una fuente arbitraria.

### Exportación autorizada de sólo lectura

```sh
npm run staging:catalog:export -- \
  --env-file "<archivo-env-productivo-autorizado>" \
  --ca-file "<certificado-ca-oficial-produccion>" \
  --environment production \
  --project-ref fxbgxjpgfkeuapbmgpmv \
  --expected-count 98 \
  --expected-active 95 \
  --expected-inactive 3
```

### DRY-RUN autorizado, sin escritura

```sh
npm run staging:catalog:apply -- \
  --env-file .env.staging \
  --ca-file "<certificado-ca-oficial-staging>" \
  --snapshot "../.local/staging-baseline/products-sanitized-<timestamp>.json" \
  --sha256 "<sha256-exacto-del-snapshot>" \
  --environment staging \
  --project-ref heqneuhptatgybddoply \
  --expected-count 98 \
  --expected-active 95 \
  --expected-inactive 3 \
  --dry-run
```

### Escritura futura: NO autorizada en Baseline A

Requiere una aprobación independiente después de revisar snapshot, hash y DRY-RUN. No sustituir un checksum rechazado ni cambiar expectativas automáticamente.

```sh
npm run staging:catalog:apply -- \
  --env-file .env.staging \
  --ca-file "<certificado-ca-oficial-staging>" \
  --snapshot "../.local/staging-baseline/products-sanitized-<timestamp>.json" \
  --sha256 "<sha256-exacto-del-snapshot>" \
  --environment staging \
  --project-ref heqneuhptatgybddoply \
  --expected-count 98 \
  --expected-active 95 \
  --expected-inactive 3 \
  --execute \
  --confirm APPLY_SANITIZED_CATALOG_TO_STAGING
```

## Pruebas y revisión del PR

Las pruebas unitarias usan entradas y repositorios simulados, sin conexiones Supabase. Deben cubrir allowlist, exclusiones, validación de destinos, checksums, expectativas, estados del plan, conservación de campos y relaciones, ausencia de escrituras durante DRY-RUN y rechazo de ejecución sin confirmación.

Antes del PR se ejecutan localmente Prisma format/validate/generate, backend build/tests, frontend tests/lint/build, `git diff --check` y revisión de secretos/archivos incluidos. El formato no debe introducir cambios de schema fuera de alcance. Export y DRY-RUN reales se documentan aparte como comprobaciones operativas autorizadas; nunca se ejecutan en CI.

El workflow actual de GitHub Actions ejecuta Node22 y `npm ci` en cada paquete. Backend genera Prisma, compila y ejecuta tests; frontend ejecuta tests, lint y build. No hay servicios PostgreSQL/Supabase reales ni secretos productivos en CI. Prisma validate debe verificarse explícitamente en la revisión local, pues el workflow actual sólo invoca generate. El sitemap de frontend utiliza URLs ficticias y `SITEMAP_ALLOW_STALE=true`; eso no autoriza conexiones al catálogo productivo.

Publicar el PR no autoriza merge ni cambios remotos de infraestructura. Confirmar el diff por allowlist de archivos y detenerse tras entregar resultados.

## Media D1: fuera de este PR

Los documentos locales `docs/product-data/media-association-plan.json` y `docs/product-data/media-association-review.md` se conservan sin modificación. Su inclusión era opcional y **no forma parte de este PR**. La revisión y sanitización para versionarlos queda como trabajo separado: sólo rutas lógicas, sin rutas absolutas, URLs específicas de entorno ni secretos.

Baseline A no aplica asociaciones multimedia, no publica los borradores y no toca ninguno de los 218 objetos de `product-media` ni `product-images`.
