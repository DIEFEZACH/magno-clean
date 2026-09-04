# Runbook productivo — release visible V1

## Estado: NO_GO; ningún comando operativo está autorizado

RELEASE_SHA auditado e inmutable: `050f890f2704b0b6d6a57c7e76e5520525b8c835`. Este candidato tiene P0 confirmado de grants/RLS (tablas legacy y editoriales), P1 de exposición de wholesalePrice en respuesta legacy y P1 de overflow legal a320 px. Las correcciones van en PRs separados, sin merge en esta tarea. **No aplicar migraciones, APPLY ni deployments de este SHA.**

El sucesor debe tener un nuevo SHA expresamente autorizado, CI y certificación nuevas. No se cambia RELEASE_SHA en este informe. Los bloques siguientes documentan sintaxis y gates futuros; no se ejecutaron. La corrección P0 previsiblemente añade una migración posterior a9: el plan histórico7→8→9 /9 de9 por sí solo no elimina el NO_GO. El sucesor debe aprobar una lista exacta y verificar N/N incluyendo la corrección.

## Identidades y reversa ya registrada

| Entorno | Proyecto / servicio | Estado base |
| --- | --- | --- |
| Producción DB | fxbgxjpgfkeuapbmgpmv | 98 Product,95 activos,3 inactivos;6 migraciones; sin ProductFamily/editorial |
| Staging DB | heqneuhptatgybddoply | 98 Product,25 familias,79 vínculos,16 individuales;218 objetos; stock/reservas0 |
| Render producción | magno-clean-api; srv-daade3pf2nfc739vpj20 | dep-daauc8nlk1mc73ag4he0 |
| Pages producción | magno-clean | 33398ca5-6ca9-4240-a52c-390500faf08f |

Ambos artefactos productivos anteriores: `f25412ab916549edee0cf4098bca6ad4e29e62c6`. Auto-Deploy continúa apagado. Destino público posterior: [www.magnoclean.com.mx](https://www.magnoclean.com.mx). No modificar DNS, correo, dominios, pagos ni variables ajenas al release.

## Backup ya realizado — no crear otro en esta certificación

Backup lógico custom finalizado2026-09-04T09:48:37.213Z, archivo `magno-clean-production-20260904T094814587Z.dump`, carpeta privada `release-visible-v1-20260904T094814587Z`;260,328 bytes; SHA-256 `a2addba48cfe529b028f392ce789d1d7b1a76b8cafdb9be6c20087bbdd471055`;TOC438 objetos. Clientes pg_dump/pg_restore18.6, servidor17.6, verify-full, READ ONLY; directorio0700 y dump/checksum/TOC0600; PGPASSFILE temporal retirado. Las nueve tablas críticas esperadas aparecen en TOC.

La ubicación privada exacta está en la evidencia local de backup; no se versionan rutas personales ni contenido del dump. TOC legible+hash no es ensayo de restauración. No restaurar, no subir el dump, no borrar copias anteriores. El operador debe decidir vigencia del respaldo en la futura ventana; una copia nueva necesitaría alcance autorizado separado.

## Gates y orden futuro

| Gate | Antes de avanzar | Operación futura | Después / NO_GO |
| --- | --- | --- | --- |
| G0 Identidad | Nuevo SHA corregido aprobado; no es el SHA NO_GO; worktree limpio; CI verde | Congelar ventana y registrar responsables/deployments | Sin nuevos cambios ni auto-deploy; detener si SHA ambiguo |
| G1 Seguridad | P0/P1 resueltos y comprobados en staging; remediación productiva explícitamente autorizada | Revisar lista exacta de migraciones y permisos | No avanzar con grants cliente efectivos/RLS deshabilitado ni respuesta privada expuesta |
| G2 Backup | Evidencia del backup válido y vigencia aceptada | Verificar hash/TOC local, sin restaurar | Si archivo ausente/ilegible/hash distinto: NO_GO |
| G3 Schema | Base6/6, hashes exactos, no historial fallido; env/CA/ref correctos | Migraciones7–9 y corrección posterior sólo según nuevo manifiesto aprobado | Exigir N/N exitosas, seguridad corregida,98/95/3; error/timeout: parar, no reintento automático |
| G4 Backend | Schema completo; CHECKOUT_ENABLED=false; build/start sin seeds/APPLY | Deploy manual Render en SHA sucesor aprobado | /health y /ready200; contratos y checkout cerrado; SHA efectivo coincide |
| G5 Plan | Plan hash exacto; backend compatible; DRY-RUN completo limpio | Sólo lectura de conciliación | 25 CREATE,79 LINK,16 individuales,0 conflictos/unknown/protected writes,0 escrituras |
| G6 APPLY | Autorización explícita de escritura y DRY-RUN G5 inmediato | Una transacción Serializable de familias/vínculos | 25 familias,79 vínculos;98/95/3 intactos; error antes de commit revierte todo |
| G7 Idempotencia | APPLY confirmado | Repetir sólo DRY-RUN completo |25 FAMILY_UNCHANGED,79 VARIANT_UNCHANGED,0 escrituras/conflictos |
| G8 Frontend | Catálogo productivo41/25/16; seguridad y backend sanos | Build y deploy manual Pages en el mismo SHA | Sitemap fresco41 comerciales+categorías+6 estáticas; origen exacto; no stale |
| G9 Cierre | Smoke público/admin autorizado, checkout cerrado, baseline intacto | Registrar evidencia y cerrar ventana | WebsiteContent publicado0; sin cambios DNS, stock, pagos o Storage |

El orden mantiene frontend anterior hasta que schema/backend/familias estén listos. Ningún gate concede autorización por sí mismo: requiere responsable y aprobación del sucesor.

## Preparación local del sucesor: rutas explícitas, sin secretos ambientales

Los cinco marcadores deben resolverse por el operador en su canal privado; no son valores existentes inventados. No usar source/export de todo el archivo .env ni heredarlo al proceso hijo. Variables locales con prefijo RELEASE; nunca sobrescribir HOME o CODEX_HOME.

```sh
RELEASE_TARGET_SHA='<SHA_NUEVO_CORREGIDO_Y_RECERTIFICADO>'
RELEASE_CHECKOUT='<CHECKOUT_LIMPIO_DEL_SHA_NUEVO>'
RELEASE_PROD_ENV_FILE='<ARCHIVO_PRODUCTIVO_ABSOLUTO_APROBADO>'
RELEASE_PROD_CA_FILE='<CA_OFICIAL_ABSOLUTA_APROBADA>'
RELEASE_MIGRATIONS_MANIFEST='<MANIFIESTO_ABSOLUTO_APROBADO_DEL_SHA_NUEVO>'

cd "$RELEASE_CHECKOUT"
test "$(git rev-parse HEAD)" = "$RELEASE_TARGET_SHA"
test "$RELEASE_TARGET_SHA" != "050f890f2704b0b6d6a57c7e76e5520525b8c835"
git status --short
cd backend
env -i PATH="$PATH" HOME="$HOME" DOTENV_CONFIG_PATH=/dev/null \
  DATABASE_URL=postgresql://127.0.0.1:1/postgres npm ci
env -i PATH="$PATH" HOME="$HOME" DOTENV_CONFIG_PATH=/dev/null \
  DATABASE_URL=postgresql://127.0.0.1:1/postgres \
  node node_modules/prisma/build/index.js generate --config prisma.config.ts
env -i PATH="$PATH" HOME="$HOME" DOTENV_CONFIG_PATH=/dev/null \
  DATABASE_URL=postgresql://127.0.0.1:1/postgres npm run build
```

La URL loopback anterior contiene valores ficticios y sólo satisface la validación local de configuración de Prisma durante instalación/generación/build; no apunta a producción y no autoriza una conexión ni migración. El entorno se limita a PATH, HOME, la URL ficticia y dotenv deshabilitado; no hereda NODE_OPTIONS ni PG*. Revisar los lifecycle scripts del SHA sucesor antes de instalar. La comprobación visual de git status debe ser vacía.

En este documento no existe todavía manifiesto autorizado para el nuevo SHA: **G3 permanece BLOCKED**. Debe listar `releaseSha`, `migrations:[{name,sha256}]` (todas, ordenadas), `securityTables:[...]` aprobadas y `securityPolicyMode:"NONE"`. Este modo exige cero políticas en las tablas de aplicación, en consonancia con la corrección propuesta; cualquier política futura requiere revisión del manifiesto y del launcher, no una excepción improvisada. Nunca generarlo/aceptarlo automáticamente a partir del checkout sin revisión independiente.

## Launcher futuro autocontenido de migración — no ejecutado ni certificado operativamente

No hay un script versionado de migración aislada en RELEASE_SHA. El siguiente bloque propone la invocación completa usando el helper existente; sólo se comprobó su sintaxis local, no DDL ni comportamiento remoto. Requiere revisión/ensayo aislado del sucesor y aprobación antes de usarse. Rechaza mecánicamente el SHA auditado NO_GO y exige al menos una migración correctiva posterior a9; la lista exacta viene del manifiesto aprobado, no de un nombre inventado aquí.

El helper usa dotenv.parse y verifica Project Ref/directo o Session Pooler5432/base postgres/CA. El bloque además valida CHECKOUT_ENABLED del archivo, hashes locales e historial completo READ ONLY. El entorno Prisma se construye por allowlist, dotenv queda apuntando a/dev/null, y la URL endurecida vive sólo en memoria con sslmode=require,sslaccept=strict,sslcert=CA. No pasar URL/contraseña en argv. No definir DOTENV_CONFIG_OVERRIDE ni heredar NODE_OPTIONS/PG* del entorno.

Invocación exacta desde backend, únicamente después deG0–G2 y aprobación deG3:

```sh
env -i PATH="$PATH" DOTENV_CONFIG_PATH=/dev/null \
  node - "$RELEASE_PROD_ENV_FILE" "$RELEASE_PROD_CA_FILE" \
  "$RELEASE_TARGET_SHA" "$RELEASE_MIGRATIONS_MANIFEST" \
  APPLY_APPROVED_MIGRATIONS_PRODUCTION <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");
const { parse } = require("dotenv");
const { Client } = require("pg");

const AUDITED_NO_GO_SHA = "050f890f2704b0b6d6a57c7e76e5520525b8c835";
const PLAN_HASH = "686cec7028b355fcc171fad41d2881af4442c9cea68f3a13b576c957bcea0710";
const BASELINE = [
  "20260825000000_baseline",
  "20260825001000_auth_security",
  "20260825002000_checkout_mercado_pago",
  "20260826055734_inventory_reservations_movements",
  "20260826060634_admin_erp",
  "20260826064000_product_image_storage"
];
const ORIGINAL_PENDING = [
  "20260831090000_product_families",
  "20260901033000_editorial_website_content",
  "20260902090000_editorial_media"
];
const MIN_SECURITY_TABLES = [
  "User", "RefreshToken", "Order", "OrderItem", "Payment", "Product",
  "ProductFamily", "WebsiteContent", "WebsiteContentRevision",
  "WebsiteContentMedia", "WebsiteContentEntry", "WebsiteContentFaq",
  "WebsiteContentSource", "ProductImage", "OrderNote", "OrderStatusHistory",
  "CompanySettings", "InventoryReservation", "InventoryMovement", "_prisma_migrations"
];
function check(value) { if (!value) throw new Error("CONTROL_FAILED"); }
function hash(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}
(async () => {
  const [envPath, caPath, targetSha, manifestPath, confirmation] = process.argv.slice(2);
  check(confirmation === "APPLY_APPROVED_MIGRATIONS_PRODUCTION");
  check(/^[0-9a-f]{40}$/.test(targetSha || "") && targetSha !== AUDITED_NO_GO_SHA);
  check(git(["rev-parse", "HEAD"]) === targetSha);
  check(git(["status", "--porcelain", "--untracked-files=normal"]) === "");
  check([envPath, caPath, manifestPath].every((p) =>
    typeof p === "string" && path.isAbsolute(p) && fs.statSync(p).isFile()));
  const envFile = fs.realpathSync(envPath);
  const caFile = fs.realpathSync(caPath);
  const approved = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  check(approved.releaseSha === targetSha);
  check(Array.isArray(approved.migrations) && approved.migrations.length >= 10);
  check(Array.isArray(approved.securityTables));
  check(new Set(approved.securityTables).size === approved.securityTables.length);
  check(MIN_SECURITY_TABLES.every((t) => approved.securityTables.includes(t)));
  check(approved.securityTables.every((t) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(t)));
  check(approved.securityPolicyMode === "NONE");
  const names = approved.migrations.map((m) => m.name);
  check(new Set(names).size === names.length);
  check(names.every((n) => /^[0-9]{14}_[a-z0-9_]+$/.test(n)));
  check(JSON.stringify(names.slice(0, 6)) === JSON.stringify(BASELINE));
  check(JSON.stringify(names.slice(6, 9)) === JSON.stringify(ORIGINAL_PENDING));
  check(names.every((n, i) => i === 0 || n > names[i - 1]));
  const migrationDirectory = path.resolve("prisma/migrations");
  const localNames = fs.readdirSync(migrationDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  check(JSON.stringify(localNames) === JSON.stringify(names));
  for (const migration of approved.migrations) {
    check(/^[0-9a-f]{64}$/.test(migration.sha256 || ""));
    check(hash(path.join(migrationDirectory, migration.name, "migration.sql")) === migration.sha256);
  }
  check(hash(path.resolve("../docs/product-data/product-family-plan.json")) === PLAN_HASH);
  const parsed = parse(fs.readFileSync(envFile));
  check(parsed.CHECKOUT_ENABLED === "false");
  const { loadProductFamilyPlanConfig } = require("./dist/services/productFamilyPlan/config.js");
  const config = loadProductFamilyPlanConfig({
    plan: path.resolve("../docs/product-data/product-family-plan.json"),
    sha256: PLAN_HASH, environment: "production",
    projectRef: "fxbgxjpgfkeuapbmgpmv", envFile, caFile,
    expectedFamilies: 25, expectedVariants: 79, expectedIndividuals: 16,
    mode: "dry-run", preMigration: true
  });
  const connection = config.connection;
  check(connection.port === 5432 && connection.database === "postgres");
  check(connection.ssl && connection.ssl.rejectUnauthorized === true);

  async function inspect(expectedNames, checkSecurity) {
    const db = new Client(connection);
    let socketError = false;
    db.on("error", () => { socketError = true; });
    try {
      await db.connect();
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      check((await db.query("SHOW transaction_read_only")).rows[0].transaction_read_only === "on");
      const rows = (await db.query(
        'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name'
      )).rows;
      check(rows.length === expectedNames.length);
      for (let i = 0; i < rows.length; i++) {
        check(rows[i].migration_name === expectedNames[i]);
        check(rows[i].finished_at !== null && rows[i].rolled_back_at === null);
        check(rows[i].checksum === approved.migrations[i].sha256);
      }
      const counts = (await db.query(
        'SELECT count(*)::int AS total, count(*) FILTER (WHERE active)::int AS active FROM "Product"'
      )).rows[0];
      check(counts.total === 98 && counts.active === 95);
      if (checkSecurity) {
        const grants = (await db.query(
          "SELECT c.relname, c.relrowsecurity, " +
          "has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN') OR " +
          "has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES') OR " +
          "has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN') OR " +
          "has_any_column_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES') AS unsafe, " +
          "EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid) AS has_policies " +
          "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace " +
          "WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])",
          [approved.securityTables]
        )).rows;
        check(grants.length === approved.securityTables.length);
        check(grants.every((row) => row.relrowsecurity && !row.unsafe && !row.has_policies));
      }
      check(!socketError);
      await db.query("ROLLBACK");
    } finally {
      await db.end().catch(() => {});
    }
  }

  await inspect(BASELINE, false);
  const url = new URL("postgresql://placeholder.invalid/postgres");
  url.hostname = String(connection.host);
  url.port = "5432";
  url.username = encodeURIComponent(String(connection.user));
  url.password = encodeURIComponent(String(connection.password));
  url.searchParams.set("schema", "public");
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("sslaccept", "strict");
  url.searchParams.set("sslcert", caFile);
  // No parameters from the original URL and no process.env spread.
  const childEnv = {
    PATH: path.dirname(process.execPath) + ":/usr/bin:/bin",
    DATABASE_URL: url.toString(),
    DOTENV_CONFIG_PATH: "/dev/null",
    NODE_EXTRA_CA_CERTS: caFile,
    CHECKPOINT_DISABLE: "1",
    NO_COLOR: "1"
  };
  const prismaCli = path.resolve("node_modules/prisma/build/index.js");
  const prismaConfig = path.resolve("prisma.config.ts");
  for (const action of ["deploy", "status"]) {
    const result = spawnSync(process.execPath, [
      prismaCli, "migrate", action, "--config", prismaConfig
    ], {
      cwd: process.cwd(), env: childEnv, encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"], maxBuffer: 4 * 1024 * 1024,
      timeout: 180000
    });
    check(!result.error && result.status === 0);
  }
  await inspect(names, true);
  console.log("MIGRATIONS_AND_SECURITY_POSTCHECK_PASSED");
})().catch(() => {
  console.error("MIGRATION_OPERATION_FAILED_STOP_REVIEW_REQUIRED");
  process.exitCode = 1;
});
NODE
```

Las operaciones hijas son el CLI instalado local: `node node_modules/prisma/build/index.js migrate deploy --config prisma.config.ts` y luego `migrate status`, siempre bajo el entorno aislado del bloque. No sustituirlo por `npm run prisma:migrate` ambiental. El timeout180s es límite de espera de la invocación, no garantía de atomicidad conjunta: puede existir instalación parcial. Ante cualquier fallo, capturar estado sanitizado y revisar historial antes de una nueva decisión; no usar migrate resolve/reset,db push,migrate dev ni SQL rollback para avanzar.

## Backend manual y smoke previo a familias

En Render seleccionar servicio productivo por ID, acción de commit específico y SHA sucesor aprobado; no “latest”, no activar auto-deploy. Verificar build/start y que CHECKOUT_ENABLED permanece false en proveedor y endpoint. Si el proveedor no permite fijar el SHA inequívocamente, bloquear la acción; no inventar un comando de deploy/API ni credenciales.

Smoke READ-ONLY (sólo después de autorización de la ventana; no se ejecuta aquí):

```sh
curl --fail --silent --show-error https://magno-clean-api.onrender.com/health
curl --fail --silent --show-error https://magno-clean-api.onrender.com/ready
curl --fail --silent --show-error https://magno-clean-api.onrender.com/api/checkout/status
```

No imprimir respuestas completas de /api/products mientras siga el P1 de wholesalePrice. El [smoke detallado](release-visible-v1-smoke-tests.md) valida keys y conteos sin exponer valores privados.

## DRY-RUN completo y APPLY — actualmente bloqueados

Desde backend del SHA sucesor aprobado. **No añadir --pre-migration:** la lectura anterior al schema no reemplaza esta puerta.

```sh
env -i PATH="$PATH" HOME="$HOME" DOTENV_CONFIG_PATH=/dev/null \
  npm run product-families:apply -- \
  --plan ../docs/product-data/product-family-plan.json \
  --sha256 686cec7028b355fcc171fad41d2881af4442c9cea68f3a13b576c957bcea0710 \
  --environment production \
  --project-ref fxbgxjpgfkeuapbmgpmv \
  --env-file "$RELEASE_PROD_ENV_FILE" \
  --ca-file "$RELEASE_PROD_CA_FILE" \
  --expected-families 25 --expected-variants 79 --expected-individuals 16 \
  --dry-run
```

Exigir schema completo,25 CREATE_FAMILY,79 LINK_VARIANT,16 individuales,0 conflictos/desconocidos/inactivos indebidos/campos protegidos y0 escrituras realizadas. Si difiere, parar sin cambiar flags/hash/labels para sortear la validación.

Sólo después de autorización explícita independiente de APPLY y del DRY-RUN inmediato:

```sh
env -i PATH="$PATH" HOME="$HOME" DOTENV_CONFIG_PATH=/dev/null \
  npm run product-families:apply -- \
  --plan ../docs/product-data/product-family-plan.json \
  --sha256 686cec7028b355fcc171fad41d2881af4442c9cea68f3a13b576c957bcea0710 \
  --environment production \
  --project-ref fxbgxjpgfkeuapbmgpmv \
  --env-file "$RELEASE_PROD_ENV_FILE" \
  --ca-file "$RELEASE_PROD_CA_FILE" \
  --expected-families 25 --expected-variants 79 --expected-individuals 16 \
  --execute --confirm APPLY_PRODUCT_FAMILY_PLAN_PRODUCTION
```

Éxito inicial esperado:25 creaciones+79 vínculos=104 operaciones en una transacción. Sólo Product.familyId,variantLabel,variantSortOrder; updatedAt cambia automáticamente. No modificar id,slug,code,name,brand,category,descripción,precios,imágenes,badge,active,featured,stock,reservas,órdenes,pagos/editorial. No ejecutar APPLY staging otra vez.

Tras commit, repetir exactamente el DRY-RUN anterior;25/79 UNCHANGED,0 planeadas/realizadas. No usar segunda escritura para demostrar idempotencia. Confirmar catálogo41 publicaciones y baseline98/95/3.

## Frontend: origen productivo y sitemap fresco antes del deploy manual

Desde frontend del mismo SHA, y sólo después deG7:

```sh
env -i PATH="$PATH" HOME="$HOME" DOTENV_CONFIG_PATH=/dev/null npm ci
env -i PATH="$PATH" HOME="$HOME" DOTENV_CONFIG_PATH=/dev/null \
VITE_API_URL=https://magno-clean-api.onrender.com \
VITE_SITE_URL=https://www.magnoclean.com.mx \
SITEMAP_ENVIRONMENT=production \
SITEMAP_ALLOW_STALE=false \
npm run build
```

El prebuild ejecuta el generador normal inmediatamente si la API está disponible; no retrasarlo ni reemplazarlo por build:ci. Si la API no está agrupada, el contrato falla o el sitemap no tiene41 publicaciones, detener. No aceptar fallback,localhost,staging,?variant=,slugs de79 variantes,3 inactivos,duplicados,admin/carrito/checkout. Esperado actual calculado:41+1 categoría+6 estáticas=48; nunca hardcodear el total del generador.

En Pages elegir proyecto magno-clean/entorno production y publicar manualmente el artefacto del mismo SHA. No promover artefactos compilados con staging. Si no puede demostrarse SHA/origen, bloquear. Verificar dominio,robots,sitemap,canonical y checkout cerrado. No crear bucket ni publicar WebsiteContent/medios como parte de este release.

## Incidente o pérdida de gate

Detener la secuencia, no relajar controles y seguir [rollback operativo](release-visible-v1-rollback.md). El rollback prioritario es artefactos, no SQL; no existe herramienta de desagrupación segura aprobada. El P0 de acceso a datos requiere mitigación específica: volver aplicaciones anteriores no corrige grants/RLS preexistentes.
