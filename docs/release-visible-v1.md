# Release visible V1: preparación y operación controlada

Esta guía conserva la operación del plan comercial y del sitemap agrupado, incorporados al candidato integrado `b37e82979d140af2d9597993217356289e6c0ea2`. La remediación de dependencias se prepara por separado; no cambia lógica comercial ni autenticación. **No autoriza migraciones, aplicación de familias, publicación editorial ni despliegue productivo.**

## Gate de dependencias — 2026-09-05

Diagnóstico sobre worktree limpio del SHA anterior, antes de actualizar paquetes. Node **22.23.2** y npm **10.9.8**, iguales a la CI del candidato. La comprobación local inicial con Node 22.14.0/npm 10.9.2 fue adicional; no sustituye la repetición con las versiones de CI. Los JSON completos y metadatos (hora UTC, comando, componente, exit code y versiones) quedan privados en `.local/dependency-audit/`, ignorados por Git, directorio 0700 y archivos 0600. No se cargaron entornos reales.

| Componente / alcance | Original | Con qs/mysql2 (`ffed9d4`) | Con deepmerge 8.0.2 |
| --- | --- | --- | --- |
| Backend, `npm audit --json` | 4 altas + 3 moderadas | 3 altas, 0 moderadas | 0 |
| Backend, `npm audit --omit=dev --json` | 4 altas + 3 moderadas | 3 altas, 0 moderadas | 0 |
| Frontend, ambos comandos | 0 | 0 | 0 |

El exit code **1** de los audits backend anteriores significa vulnerabilidades detectadas, no fallo de ejecución. Eran **cinco avisos independientes**, no siete: `@prisma/config`, `prisma`, `body-parser` y `express` heredan avisos de sus dependencias. El parche inicial dejaba **un aviso independiente** (`deepmerge-ts`), reflejado en tres entradas altas. Tras la autorización y prueba acotada de 8.0.2, los cuatro audits terminan con **exit 0**, cero entradas y cero avisos independientes, sin avisos nuevos. Esto cierra los cinco avisos consultados, no demuestra ausencia de toda vulnerabilidad ni autoriza un release.

| Paquete original, cadena y componente | Aviso oficial / severidad / rango afectado | Condición y evidencia en el candidato | Parche mínimo y decisión |
| --- | --- | --- | --- |
| `deepmerge-ts@7.1.5`, transitivo: `prisma@7.10.0` directo → `@prisma/config@7.10.0` → deepmerge. CLI/build; también instalado en la imagen backend. | [GHSA-ggr8-5vv4-36mx / CVE-2026-40345](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), alta, `<8.0.0`. | Requiere grafos JavaScript recursivos al hacer merge. El config versionado sólo contiene schema/datasource acíclicos, pero el cargador de Prisma sí usa este merger. Importa `dotenv/config` y puede ejecutarse con credenciales DB durante builds/CLI. No se ha demostrado un camino desde entrada pública hasta un grafo recursivo; no equivale a ausencia universal de impacto. | Primera corrección **8.0.0**; candidato exacto **8.0.2** autorizado, probado y fijado sólo para `@prisma/config@7.10.0`. Override fuera del pin 7.1.5 del padre, no combinación oficialmente soportada por Prisma. |
| `mysql2@3.15.3`, transitivo: `prisma@7.10.0` → mysql2. Herramienta CLI/Studio incluida con Prisma. | [GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr), alta, `<3.22.0`; sin CVE asignado en el aviso consultado. | Servidor MySQL hostil/MITM pide plugin de contraseña en claro sin transporte protegido. Studio importa `mysql2/promise` para URLs MySQL; la app usa PostgreSQL/`PrismaPg`, sin conexión MySQL en su código. No se ejecutó Studio ni se enviaron credenciales. | Corregido desde **3.22.0**; se fija **3.23.1** para cerrar también el aviso siguiente. |
| Mismo mysql2 y cadena: segundo aviso independiente, no otra copia del paquete. | [GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3), moderada, `<=3.23.0`; sin CVE asignado en el aviso consultado. | Protocolo MySQL comprimido y servidor hostil/comprometido pueden provocar expansión no acotada. No hay `compress:true` ni cliente MySQL en la aplicación PostgreSQL. La biblioteca sí se distribuye dentro de las herramientas. | Primera corrección **3.23.1**, aplicada sólo bajo Prisma. |
| `qs@6.15.3`, transitivo: `express@4.22.2` directo → qs; también Express → `body-parser@1.20.6` → qs. Backend HTTP. | [GHSA-x5fp-wj9c-mxmx / CVE-2026-82562](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx), moderada, `>=6.14.2 <=6.15.3`. | Bypass del límite con claves `[]` y `comma:true`. Express usa parser extended, `allowPrototypes:true`, `arrayLimit:1000`, sin comma. La app usa `express.json`, no urlencoded. No se encontró el modo requerido, pero qs sí procesa queries públicas. | **6.16.0**, aplicada bajo Express, incluyendo body-parser. |
| Mismo qs y cadenas: segundo aviso independiente. | [GHSA-4mjr-xmp4-gh2g / CVE-2026-82417](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g), moderada, `>=2.2.5 <6.16.0`. | Objeto controlado con `constructor.isBuffer` no callable llega a `qs.stringify`, posiblemente tras parse permisivo. No se halló un sink stringify en el código de la app; no se interpreta como seguridad inherente de un paquete transitivo. | **6.16.0**, corrige ambos avisos de qs. |

### Justificación y retiro de los overrides

La consulta del registro y de los changelogs oficiales encontró que Express **4.22.2**, body-parser **1.20.6** y Prisma/config **7.10.0** ya son los últimos padres de sus respectivas líneas estables compatibles. Express/body-parser exigen `qs ~6.15.1`; Prisma fija `mysql2 3.15.3` y config fija `deepmerge-ts 7.1.5`. Una actualización compatible del padre no obtiene todavía las correcciones. El tag `latest` de Prisma apunta a **8.0.0-rc.13**: no se instala como una actualización rutinaria ni se hace downgrade a Prisma 6 sugerido por audit.

Los overrides están acotados a **Express → qs 6.16.0**, **Prisma → mysql2 3.23.1** y **@prisma/config@7.10.0 → deepmerge-ts 8.0.2**, no a cualquier paquete del árbol. No cambia la versión directa de Express, Prisma, Prisma Client ni adapter-pg. El lockfile generado por npm sólo cambia esos tres paquetes y la sustitución transitiva necesaria de mysql2: sale `seq-queue`/`sqlstring`, entra `sql-escaper@1.5.1`. Frente a `ffed9d4` cambia exclusivamente el registro deepmerge. Las versiones Node requeridas siguen siendo compatibles con Node 22. No se usa `latest`, `npm audit fix --force` ni actualización general.

Fuentes de compatibilidad: [qs 6.16.0 changelog](https://github.com/ljharb/qs/blob/v6.16.0/CHANGELOG.md), [mysql2 3.22.0](https://github.com/sidorares/node-mysql2/releases/tag/v3.22.0), [mysql2 3.23.1](https://github.com/sidorares/node-mysql2/releases/tag/v3.23.1), [deepmerge 8.0.0 breaking changes](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0). Los tests locales deben comprobar el comportamiento y las dependencias resueltas desde sus padres; que el audit disminuya no basta como prueba de compatibilidad. No certifican una conexión MySQL productiva, que no forma parte de esta app.

La excepción major 7→8 fue autorizada para este PR. **@prisma/config 7.10.0 sigue declarando exactamente 7.1.5**: los resultados siguientes son evidencia de compatibilidad para este repositorio, no soporte oficial de Prisma ni garantía para todas las configuraciones. Retirar el override cuando un padre estable compatible incorpore oficialmente una versión corregida (o elimine la dependencia), una instalación sin override no resuelva copias vulnerables y vuelvan a pasar resolución, carga de config, CLI y regresiones. Revalidar al cambiar Prisma/config o introducir nuevas formas de configuración; no conservar ciegamente esta excepción en una actualización del padre.

### Compatibilidad de deepmerge comprobada en el consumidor

Se contrastaron el [registro de 8.0.2](https://registry.npmjs.org/deepmerge-ts/8.0.2), el advisory y las notas [8.0.0](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0), [8.0.1](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.1) y [8.0.2](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.2). 8.0.2 exige Node **>=16.9.0**, no añade dependencias y conserva entradas ESM/CJS. La integridad del tarball oficial coincide con el lockfile:

```text
sha512-uqbvqLUMrc6p0MO+WBRtTxY55hmyh94WRwI5a++PZe54X+bfVh59FSN7uWCBCW1CCVjzjnrwzfI8zidE2obMMw==
```

`npm explain deepmerge-ts`, `npm ls deepmerge-ts --all` y la resolución efectiva desde Prisma/config se guardaron antes/después en `.local`. Config carga su entrada **ESM**, no una copia elegida desde la raíz. La instalación pasa de una copia 7.1.5 a una copia 8.0.2, sin copias vulnerables restantes.

- `@prisma/config/dist/index.js:620–644` importa únicamente `deepmerge` y lo entrega como `merger` a c12. `c12/dist/index.mjs:188` lo invoca con overrides/main/rc/packageJson/defaultConfig. Prisma deshabilita dotenv de c12, RC, extensiones y packageJson: en el proyecto actual sólo main tiene valor. El import `dotenv/config` pertenece al archivo del proyecto y se neutraliza explícitamente en las pruebas.
- Se cargó el **prisma.config.ts real** con datasource ficticio local y `DOTENV_CONFIG_PATH=/dev/null`, sin fallback ni secretos. Coinciden antes/después schema absoluto, datasource, ruta resuelta, diagnósticos y marca interna de `defineConfig`. La configuración actual no especifica ruta de migraciones: sigue undefined; un fixture c12 separado comprueba explícitamente `prisma/migrations` y opciones anidadas. El nombre de seed del fixture es sólo un string: no se ejecuta.
- Se comparan resultados de c12/defineConfig con arrays, null, undefined, identidad de callback y preservación del input; no se presupone equivalencia universal de v7/v8. El proyecto actual no contiene Maps ni callbacks de merge personalizados.
- La caracterización separada confirma que v8 fusiona valores de Map con la misma clave (`{left:1,right:2}`), donde v7 elegía el último (`{right:2}`). También confirma que `deepmergeInto` deja de mutar/aliasar el contenedor de entrada; Prisma no llama esa API. Los tipos de custom metadata y `DeepMergeIntoFunctionUtils` cambiaron, pero las declaraciones publicadas de Prisma no importan tipos de deepmerge. Son límites de alcance, no garantías universales.
- La regresión oficial de dos objetos autorreferenciales se ejecuta por API en subprocess con **64 MiB de old-space V8, timeout de 5 s y salida máxima de 64 KiB**, sin credenciales ni DB. Ese flag no limita todo el RSS del proceso. La baseline 7.1.5 produce `RangeError: Maximum call stack size exceeded`; 8.0.2 conserva correctamente el ciclo y los campos de ambas entradas. Los tests exigen el resultado concreto y no aceptan excepciones arbitrarias. No se usa `FastUnsafe`. Los fixtures y observaciones antes/después permanecen privados en `.local/deepmerge-before.json` y `.local/deepmerge-after.json`.

### Navegador, build, tests y Functions

Los cinco avisos anteriores pertenecen al árbol backend; ninguno se importa en el browser ni en la Function auth. El audit completo frontend incluye herramientas de build/tests aunque `--omit=dev` no las incluya todas; cero avisos sólo describe el grafo npm consultado en esa fecha. Vite/build pueden recibir variables sensibles: mantener la allowlist `VITE_*` y las pruebas que verifican que los valores sentinel `AUTH_*` no terminan en JS público.

La Function escrita por la app usa Web APIs, pero su **Worker compilado también incluye el router generado por Wrangler**; no afirmar que el artefacto desplegable carece de dependencias. La compilación local de `functions/` comprobó el wrapper `/api/auth`, el handler y la correspondencia exacta con `_routes.json`, no sólo Vite/dist. Wrangler externo **4.129.0** no pertenece al lockfile frontend; se ejecutó con red denegada, sin `.env`, sin sesión y sin deploy. El metafile identifica `path-to-regexp@6.3.0` y el template de Wrangler, sin imports externos; la consulta adicional del registro para ese router emitido no devolvió avisos. Eso no constituye un audit completo de toda la herramienta externa. Las pruebas locales/mock no certifican un artefacto productivo construido contra el backend futuro.

Validación local: instalación reproducible `npm ci` en ambos componentes, Prisma generate/validate **7.10.0** mediante los ejecutables del lockfile, backend build y **272 tests** (262 anteriores + 7 regresiones qs/mysql2 + 3 de deepmerge), frontend **181 tests**, **63 tests** de scripts/configuración/sitemap, lint y build:ci. El Worker compilado pasó **10 casos mock** de rutas/auth/assets bajo bloqueo de red. Los nuevos tests verifican ambas resoluciones qs (Express y body-parser), ambos avisos qs, consultas/JSON Express, rechazo de clear-password antes de leer una contraseña, API promise/escaping de mysql2 y descompresión con paquetes minúsculos válidos e inválidos, además del config y ciclos descritos arriba. No abren conexiones DB ni prueban con datos reales. Las pruebas de protocolo usan helpers internos de mysql2: revisarlas explícitamente al retirar o actualizar el override. No fue necesario ejecutar `migrate status` ni conectar con staging; schema y migraciones permanecen idénticos.

### Decisión y secuencia productiva conservada

El SHA **b37e82979d140af2d9597993217356289e6c0ea2** permanece congelado. Este PR no lo sustituye automáticamente: cualquier merge futuro exige un SHA nuevo y validación posterior. **Los cinco avisos de dependencias quedan remediados para revisión; CI verde no concede GO productivo.** Persiste el mantenimiento del override major fuera del pin oficial de Prisma. Safari real, indexación de staging y P2 visuales siguen separados; no cambiar cookies, Remote Automation o configuración remota en este lote.

Secuencia futura, **no ejecutada**: fijar SHA aprobado → revisar vigencia del backup y actualizarlo antes de migrar si cambiaron datos → migraciones **7–10**, incluida `20260904090000_application_data_access_hardening` → backend → DRY-RUN y plan aprobado de **25 familias/79 vínculos** → build y runtime auth productivos → frontend **con Functions y sitemap fresco** → dominio/sesión. Mantener **Data API deshabilitada, TLS estricto y CHECKOUT_ENABLED=false** durante toda la secuencia. No hay cambios de Auth, datos, inventario, Storage, DNS, pagos ni despliegues en este PR.

Build futuro: `VITE_API_URL=https://magno-clean-api.onrender.com`, `VITE_SITE_URL=https://www.magnoclean.com.mx`, `VITE_AUTH_PROXY_ENABLED=true`, `VITE_DEMO_PREVIEW=false`, `SITEMAP_ENVIRONMENT=production`, `SITEMAP_ALLOW_STALE=false`. Runtime server-side: `AUTH_DEPLOYMENT_ENVIRONMENT=production`, `AUTH_UPSTREAM_URL=https://magno-clean-api.onrender.com`, `AUTH_ALLOWED_FRONTEND_ORIGINS=["https://www.magnoclean.com.mx","https://magno-clean.pages.dev"]`. No son secretos ni instrucciones para modificarlos ahora. El build real debe usar el catálogo productivo ya agrupado; nunca reutilizar mocks ni reemplazar el dominio de un sitemap de staging como certificación productiva.

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
- El Preview existente puede conservar su política previa de `SITEMAP_ALLOW_STALE=true`; staging estable y futura producción usan `false`. El fallback sólo reutiliza un sitemap XML válido del mismo origen, con robots coherente y sin localhost, cuando la API no está disponible (red, timeout, 5xx o 429). No encubre JSON/contratos inválidos ni 4xx de configuración.
- En producción exigir `SITEMAP_ALLOW_STALE=false` y `SITEMAP_ENVIRONMENT=production`, que rechaza stale y un SITE de staging. Esto no modifica configuración remota en esta tarea.
- El respaldo versionado antiguo usa localhost: si la API falla, será rechazado deliberadamente. No se garantiza un build sin API; no rebajar la validación para recuperar un respaldo incompatible.
- CI usa `npm run build:ci`: el prebuild y build reales contra un servidor efímero de catálogo de prueba, sin depender de la API remota ni de stale. `npm test` incluye tests del sitemap además del frontend.

**Orden de release posterior:** seguir el gate y la secuencia anteriores, incluido backup y migraciones 7–10 antes del backend → DRY-RUN completo y aplicación autorizada → catálogo productivo agrupado → build con sitemap fresco y frontend con Functions. El backend productivo actual no expone el nuevo catálogo; no desplegar este frontend primero. Esta guía no ejecuta ni autoriza ninguno de esos pasos.

## Reversa operativa

Ante un error de aplicación antes del commit, la transacción revierte todo. Después de una aplicación confirmada, no existe un comando de borrado/desagrupación automático.

La primera reversa operativa de un release es volver a los artefactos backend/frontend previamente verificados, conservar el schema aditivo y detener el avance. El candidato integrado minimiza `/api/products`: volver al backend legacy podría reintroducir su exposición de precios internos y requiere reportar NO_GO. **Nunca usar rollback SQL como primera reversa:** podría destruir familias/historial editorial. Mantener Data API deshabilitada, RLS, grants endurecidos y TLS; restaurar una base o desvincular asociaciones requiere un plan separado, backup, revisión de dependencias y autorización explícita.

## Validaciones y límites de evidencia

Los tests del aplicador cubren schema/checksum, entorno/confirmación, conflictos, conservación de campos, rollback todo-o-nada e idempotencia con adaptador transaccional de prueba. Los DRY-RUN con TLS estricto pertenecen a la preparación anterior del plan, no a esta remediación de dependencias: **en este PR no se accedió a bases remotas, no se ejecutó DRY-RUN ni se probaron escrituras reales**. Las migraciones y el comportamiento de un release productivo siguen requiriendo sus autorizaciones independientes.

Las observaciones visuales/editoriales previamente registradas no se corrigen aquí. Este PR no cambia UI, selector de variantes, checkout, contenido o medios.
