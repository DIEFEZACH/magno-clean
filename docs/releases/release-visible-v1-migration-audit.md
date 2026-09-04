# Release Visible V1 — auditoría de migraciones 7–9

RELEASE_SHA: `050f890f2704b0b6d6a57c7e76e5520525b8c835`. Fecha: 2026-09-04. **Resultado: NO_GO por P0 de permisos/RLS comprobado en staging; no se aplicó ninguna migración.**

## P0 adicional — tablas críticas legacy en producción

READ-ONLY ampliado confirmó RLS=false y anon SELECT/INSERT/UPDATE/DELETE en User, RefreshToken, Order, Payment, InventoryMovement y Product tanto en producción (2026-09-04T09:46:39.576Z) como staging (09:46:34.877Z); authenticated SELECT también efectivo. En staging, ProductFamily presenta lo mismo, por lo que 7 también es **BLOCKING_RISK**. La parte legacy es preexistente en producción y no fue causada por un deploy del release. Evidencia privada: `production-readonly.json` y `staging-readonly.json`, criticalTableAccess, bajo `.local/reports/release-visible-v1/`.

Se confirma permiso DB, no una explotación HTTP: no se verificó exposición efectiva de schemas PostgREST con clave anónima ni se consultaron filas sensibles. Corregir en PR separado la lista explícita de tablas de aplicación (legacy + familias + editorial), conservando acceso del backend y sin tocar auth/storage ni defaults globales. No ejecutar migración remota en staging o producción. No crear admin temporal mientras User/RefreshToken mantengan esta condición.

## P0 — acceso editorial directo confirmado en staging

La consulta READ-ONLY del 2026-09-04 09:44:38 UTC confirmó en WebsiteContent, WebsiteContentRevision, WebsiteContentSource, WebsiteContentEntry, WebsiteContentFaq y WebsiteContentMedia: RLS=false; anon SELECT/INSERT/UPDATE/DELETE=true; authenticated SELECT/UPDATE=true. Todas tienen cero filas hoy. Evidencia privada: `.local/reports/release-visible-v1/staging-readonly.json`, sección `editorialAccess`; metadatos sanitizados también en el JSON de esta auditoría.

El camino de privilegios está confirmado; no se intentó explotación Data API ni ninguna escritura. Las guardias ADMIN/PUBLISHED de Express no protegen acceso directo a tablas expuestas por Supabase. 8–9 no habilitan RLS ni revocan grants: **BLOCKING_RISK y RELEASE_SHA NO_GO**, aunque el SQL hacia adelante siga siendo aditivo. Producción aún no tiene estas tablas; no se afirma que se hayan migrado ni expuesto allí. [Supabase RLS y privilegios](https://supabase.com/docs/guides/database/postgres/row-level-security).

Corrección propuesta en PR separado: nueva migración posterior a 9, ENABLE ROW LEVEL SECURITY y revocar privilegios anon/authenticated/PUBLIC de las seis tablas, sin políticas de acceso cliente; conservar backend/owner/service_role. ProductFamily fue confirmado con el mismo problema; incluirlo junto a tablas legacy en la corrección acotada. No aplicar durante esta tarea, no editar migraciones previas ni cambiar RELEASE_SHA. Una corrección futura exige revisión y nueva certificación autorizada.

Se inspeccionaron íntegramente 355 líneas: 34 + 235 + 86. Las tres migraciones son aditivas, pero 7–9 son **BLOCKING_RISK** por el P0 y requieren además orden de deploy: 7 precede 8, 9 corrige una función de 8 y el backend nuevo requiere las tres. No hay INSERT/UPDATE/DELETE/TRUNCATE de datos ni DROP en los archivos forward. El DEFAULT 0 de la nueva columna Product.variantSortOrder es una modificación estructural documentada, no un backfill comercial.

Confirmaciones: **sin cambio de precio, stock, reservedStock, Order ni Payment; sin eliminación de Product; sin publicación editorial; sin creación de bucket/objetos Storage. La migración 9 corrige la función del trigger de revisión.**

## Resumen operativo

| Nº | Migración | Nuevas tablas | Enums | Índices explícitos | FK | Funciones | Triggers nuevos | Clasificación |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 7 | 20260831090000_product_families | 1 | 0 | 5 | 1 | 0 | 0 | BLOCKING_RISK |
| 8 | 20260901033000_editorial_website_content | 5 | 4 | 15 | 13 | 2 | 4 | BLOCKING_RISK |
| 9 | 20260902090000_editorial_media | 1 | 1 | 3 | 1 | 2 (1 reemplazo) | 1 | BLOCKING_RISK |

Los índices de PK implícitos se suman a los explícitos de la tabla. Los locks descritos son una inferencia estática del SQL, no una observación de producción: ALTER TABLE usa el lock más restrictivo aplicable; el FK también bloquea la tabla referenciada. [PostgreSQL 17 ALTER TABLE](https://www.postgresql.org/docs/17/sql-altertable.html). CREATE TRIGGER adquiere SHARE ROW EXCLUSIVE; bloqueo concurrente puede ampliar la espera. [Locks PostgreSQL 17](https://www.postgresql.org/docs/17/explicit-locking.html).

**Plan original invalidado por NO_GO:** 7→8→9 y 9/9 sólo describen dependencias estructurales; no son una secuencia aprobable para este SHA. NO_GO: secuencia original bloqueada. Antes de cualquier futura operación productiva se requiere corrección de seguridad revisada, contención de acceso directo durante la transición, autorización expresa y un nuevo SHA certificado; ni backup ni 9/9 por sí solos levantan este bloqueo. El plan corregido deberá añadir backup, identidad, control de locks y validación de privilegios sin dejar un estado intermedio expuesto. Las estimaciones son orientativas, no medidas; no se aplicaron migraciones para cronometrarlas.

## 7 — 20260831090000_product_families

Archivo: `backend/prisma/migrations/20260831090000_product_families/migration.sql`. SHA-256: `239756027d333272b70779cd832154f2571817e985d4da8f4bdf6261a215fbea`.

### Revisión por líneas

| Líneas | Evaluación |
| --- | --- |
| 1–17 | CREATE ProductFamily: 14 columnas y PK; tabla inicialmente vacía. |
| 19–22 | ADD Product.familyId/variantLabel nullable; variantSortOrder NOT NULL DEFAULT 0. Sin UPDATE ni asociación. |
| 24–25 | CHECK orden no negativo y etiqueta no vacía al vincular; baseline NULL/0 satisface. |
| 27–31 | Cinco índices, dos únicos. Familias vacías y familyId NULL no generan duplicados. |
| 33–34 | FK Product → ProductFamily: SET NULL al borrar familia; CASCADE al actualizar id. No elimina Product. |

Las líneas no listadas son separadores vacíos; los comentarios asociados están incluidos en los bloques.

### Tablas, columnas y constraints

**ProductFamily**

- `"id" TEXT NOT NULL`
- `"slug" TEXT NOT NULL`
- `"name" TEXT NOT NULL`
- `"brand" TEXT NOT NULL`
- `"category" TEXT NOT NULL`
- `"description" TEXT NOT NULL`
- `"imageUrl" TEXT`
- `"badge" TEXT`
- `"featured" BOOLEAN NOT NULL DEFAULT false`
- `"active" BOOLEAN NOT NULL DEFAULT true`
- `"variantType" TEXT NOT NULL DEFAULT 'Presentación'`
- `"alwaysShowAsFamily" BOOLEAN NOT NULL DEFAULT false`
- `"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`

- `CONSTRAINT "ProductFamily_pkey" PRIMARY KEY ("id")`

**Product (columnas añadidas)**

- `"familyId" TEXT NULL`
- `"variantLabel" TEXT NULL`
- `"variantSortOrder" INTEGER NOT NULL DEFAULT 0`
- `Product_variantSortOrder_nonnegative: variantSortOrder >= 0`
- `Product_family_variant_label: familyId IS NULL OR (variantLabel IS NOT NULL AND btrim(variantLabel) <> '')`

### Enums

Ninguno.

### Índices y FK

- `CREATE UNIQUE INDEX "ProductFamily_slug_key" ON "ProductFamily"("slug");`
- `CREATE INDEX "ProductFamily_active_idx" ON "ProductFamily"("active");`
- `CREATE INDEX "ProductFamily_featured_idx" ON "ProductFamily"("featured");`
- `CREATE UNIQUE INDEX "Product_familyId_variantLabel_key" ON "Product"("familyId", "variantLabel");`
- `CREATE INDEX "Product_familyId_variantSortOrder_idx" ON "Product"("familyId", "variantSortOrder");`

- `ALTER TABLE "Product" ADD CONSTRAINT "Product_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "ProductFamily"("id") ON DELETE SET NULL ON UPDATE CASCADE;`

### Funciones y triggers

Ninguno.



### Riesgo, tiempo y compatibilidad

- Locks: ALTER TABLE Product solicita ACCESS EXCLUSIVE para columnas/CHECK; FK usa SHARE ROW EXCLUSIVE también en ProductFamily; CREATE INDEX no CONCURRENTLY puede bloquear escrituras. Check/index valida Product (98 esperado). No lock_timeout definido por el SQL.
- DML: Ningún INSERT/UPDATE/DELETE/TRUNCATE a nivel superior. ALTER ADD DEFAULT 0 define nueva columna de filas existentes; no backfill de familias.
- Backfill: Ninguno. Las 25 familias y 79 enlaces se aplican con herramienta aparte, nunca por esta migración.
- Riesgo: P0: ProductFamily en staging tiene RLS=false y grants anon CRUD. MEDIUM operacional por locks/orden; LOW pérdida de datos si baseline validado. Requiere Product de migraciones 1–6.
- Tiempo esperado: Estimación no medida: segundos con 98 Product y sin transacciones bloqueantes; adquisición de locks puede tardar indefinidamente sin límite externo. No se ensayó DDL productivo.
- Reversibilidad: Operativamente volver apps previas y conservar schema; quitar columnas/familias sería destructivo y requeriría otra autorización.
- Backend anterior: Lecturas y escrituras históricas usan columnas existentes; nuevas columnas nullable/default. Producto no pierde ID/slug/precios/stock. No usar prisma nuevo contra schema previo.
- Frontend anterior: Continúa API SKU previa; agrupación sólo visible con frontend nuevo. No exige frontend simultáneo.

## 8 — 20260901033000_editorial_website_content

Archivo: `backend/prisma/migrations/20260901033000_editorial_website_content/migration.sql`. SHA-256: `abdff24943e5c5d3806f3f9e8b2a932611e41a7c2d4ccc7ec13b3144e90e1baf`.

### Revisión por líneas

| Líneas | Evaluación |
| --- | --- |
| 1–11 | Cuatro enums nuevos; no se alteran enums existentes. |
| 13–24 | WebsiteContent + XOR familyId/productId + PK. |
| 26–54 | Revision: versión positiva, estado inicial DRAFT, campos comerciales/auditoría y PK. |
| 56–66 | Entry: section, value, posición no negativa y PK. |
| 68–78 | Faq: pregunta/respuesta, posición no negativa y PK. |
| 80–94 | Source: JSONB privado, hash/ruta/confianza y PK. |
| 96–139 | 15 índices explícitos; 4 únicos; tablas nuevas vacías. |
| 141–178 | 13 FK: Product/Family/revision/source cascades; creador RESTRICT; otros actores SET NULL. |
| 180–193 | Función inmutable: rechaza UPDATE/DELETE si OLD.status=PUBLISHED. Defecto intermedio: RETURN NEW en DELETE no publicado devuelve NULL; corregido por 9. |
| 195–203 | Dos triggers BEFORE de Revision, UPDATE y DELETE. |
| 205–225 | Función de hijos consulta revisión destino y rechaza si PUBLISHED; devuelve OLD para DELETE y NEW resto. |
| 227–235 | Dos triggers BEFORE INSERT/UPDATE/DELETE para Entry/Faq. |

Las líneas no listadas son separadores vacíos; los comentarios asociados están incluidos en los bloques.

### Tablas, columnas y constraints

**WebsiteContent**

- `"id" TEXT NOT NULL`
- `"familyId" TEXT`
- `"productId" TEXT`
- `"publishedRevisionId" TEXT`
- `"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`

- `CONSTRAINT "WebsiteContent_pkey" PRIMARY KEY ("id")`
- `CONSTRAINT "WebsiteContent_exactly_one_target_check" CHECK (num_nonnulls("familyId", "productId") = 1)`

**WebsiteContentRevision**

- `"id" TEXT NOT NULL`
- `"contentId" TEXT NOT NULL`
- `"version" INTEGER NOT NULL`
- `"status" "WebsiteContentStatus" NOT NULL DEFAULT 'DRAFT'`
- `"title" TEXT`
- `"shortDescription" TEXT`
- `"longDescription" TEXT`
- `"seoTitle" TEXT`
- `"seoDescription" TEXT`
- `"technicalSheetUrl" TEXT`
- `"sdsUrl" TEXT`
- `"createdById" TEXT NOT NULL`
- `"reviewedById" TEXT`
- `"approvedById" TEXT`
- `"publishedById" TEXT`
- `"conflictsConfirmedById" TEXT`
- `"conflictsConfirmationNote" TEXT`
- `"reviewedAt" TIMESTAMP(3)`
- `"approvedAt" TIMESTAMP(3)`
- `"publishedAt" TIMESTAMP(3)`
- `"conflictsConfirmedAt" TIMESTAMP(3)`
- `"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`

- `CONSTRAINT "WebsiteContentRevision_pkey" PRIMARY KEY ("id")`
- `CONSTRAINT "WebsiteContentRevision_positive_version_check" CHECK ("version" > 0)`

**WebsiteContentEntry**

- `"id" TEXT NOT NULL`
- `"revisionId" TEXT NOT NULL`
- `"section" "WebsiteContentSection" NOT NULL`
- `"value" TEXT NOT NULL`
- `"position" INTEGER NOT NULL DEFAULT 0`

- `CONSTRAINT "WebsiteContentEntry_pkey" PRIMARY KEY ("id")`
- `CONSTRAINT "WebsiteContentEntry_nonnegative_position_check" CHECK ("position" >= 0)`

**WebsiteContentFaq**

- `"id" TEXT NOT NULL`
- `"revisionId" TEXT NOT NULL`
- `"question" TEXT NOT NULL`
- `"answer" TEXT NOT NULL`
- `"position" INTEGER NOT NULL DEFAULT 0`

- `CONSTRAINT "WebsiteContentFaq_pkey" PRIMARY KEY ("id")`
- `CONSTRAINT "WebsiteContentFaq_nonnegative_position_check" CHECK ("position" >= 0)`

**WebsiteContentSource**

- `"id" TEXT NOT NULL`
- `"contentId" TEXT NOT NULL`
- `"layer" "WebsiteContentSourceLayer" NOT NULL`
- `"sourceFile" TEXT`
- `"sourceSha256" TEXT`
- `"data" JSONB NOT NULL`
- `"reviewRequired" BOOLEAN NOT NULL DEFAULT false`
- `"confidence" "ContentExtractionConfidence"`
- `"createdById" TEXT NOT NULL`
- `"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`

- `CONSTRAINT "WebsiteContentSource_pkey" PRIMARY KEY ("id")`

### Enums

- WebsiteContentStatus: DRAFT, REVIEW, APPROVED, PUBLISHED
- WebsiteContentSection: BENEFIT, APPLICATION, USAGE, DILUTION, PRECAUTION, PICTOGRAM, SEO_KEYWORD
- WebsiteContentSourceLayer: SOURCE_TECHNICAL, DERIVED_COMMERCIAL
- ContentExtractionConfidence: LOW, MEDIUM, HIGH

### Índices y FK

- `CREATE UNIQUE INDEX "WebsiteContent_familyId_key" ON "WebsiteContent"("familyId");`
- `CREATE UNIQUE INDEX "WebsiteContent_productId_key" ON "WebsiteContent"("productId");`
- `CREATE UNIQUE INDEX "WebsiteContent_publishedRevisionId_key" ON "WebsiteContent"("publishedRevisionId");`
- `CREATE UNIQUE INDEX "WebsiteContentRevision_contentId_version_key" ON "WebsiteContentRevision"("contentId", "version");`
- `CREATE INDEX "WebsiteContentRevision_contentId_status_idx" ON "WebsiteContentRevision"("contentId", "status");`
- `CREATE INDEX "WebsiteContentRevision_createdById_idx" ON "WebsiteContentRevision"("createdById");`
- `CREATE INDEX "WebsiteContentRevision_reviewedById_idx" ON "WebsiteContentRevision"("reviewedById");`
- `CREATE INDEX "WebsiteContentRevision_approvedById_idx" ON "WebsiteContentRevision"("approvedById");`
- `CREATE INDEX "WebsiteContentRevision_publishedById_idx" ON "WebsiteContentRevision"("publishedById");`
- `CREATE INDEX "WebsiteContentRevision_conflictsConfirmedById_idx" ON "WebsiteContentRevision"("conflictsConfirmedById");`
- `CREATE INDEX "WebsiteContentEntry_revisionId_section_position_idx" ON "WebsiteContentEntry"("revisionId", "section", "position");`
- `CREATE INDEX "WebsiteContentFaq_revisionId_position_idx" ON "WebsiteContentFaq"("revisionId", "position");`
- `CREATE INDEX "WebsiteContentSource_contentId_layer_idx" ON "WebsiteContentSource"("contentId", "layer");`
- `CREATE INDEX "WebsiteContentSource_createdById_idx" ON "WebsiteContentSource"("createdById");`
- `CREATE INDEX "WebsiteContentSource_sourceSha256_idx" ON "WebsiteContentSource"("sourceSha256");`

- `ALTER TABLE "WebsiteContent" ADD CONSTRAINT "WebsiteContent_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "ProductFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;`
- `ALTER TABLE "WebsiteContent" ADD CONSTRAINT "WebsiteContent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;`
- `ALTER TABLE "WebsiteContentRevision" ADD CONSTRAINT "WebsiteContentRevision_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "WebsiteContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;`
- `ALTER TABLE "WebsiteContentRevision" ADD CONSTRAINT "WebsiteContentRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`
- `ALTER TABLE "WebsiteContentRevision" ADD CONSTRAINT "WebsiteContentRevision_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;`
- `ALTER TABLE "WebsiteContentRevision" ADD CONSTRAINT "WebsiteContentRevision_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;`
- `ALTER TABLE "WebsiteContentRevision" ADD CONSTRAINT "WebsiteContentRevision_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;`
- `ALTER TABLE "WebsiteContentRevision" ADD CONSTRAINT "WebsiteContentRevision_conflictsConfirmedById_fkey" FOREIGN KEY ("conflictsConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;`
- `ALTER TABLE "WebsiteContent" ADD CONSTRAINT "WebsiteContent_publishedRevisionId_fkey" FOREIGN KEY ("publishedRevisionId") REFERENCES "WebsiteContentRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;`
- `ALTER TABLE "WebsiteContentEntry" ADD CONSTRAINT "WebsiteContentEntry_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "WebsiteContentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;`
- `ALTER TABLE "WebsiteContentFaq" ADD CONSTRAINT "WebsiteContentFaq_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "WebsiteContentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;`
- `ALTER TABLE "WebsiteContentSource" ADD CONSTRAINT "WebsiteContentSource_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "WebsiteContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;`
- `ALTER TABLE "WebsiteContentSource" ADD CONSTRAINT "WebsiteContentSource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`

### Funciones y triggers

- Función: `prevent_published_website_content_revision_mutation`
- Función: `prevent_published_website_content_child_mutation`

- `CREATE TRIGGER "WebsiteContentRevision_prevent_published_update" BEFORE UPDATE ON "WebsiteContentRevision" FOR EACH ROW EXECUTE FUNCTION "prevent_published_website_content_revision_mutation"();`
- `CREATE TRIGGER "WebsiteContentRevision_prevent_published_delete" BEFORE DELETE ON "WebsiteContentRevision" FOR EACH ROW EXECUTE FUNCTION "prevent_published_website_content_revision_mutation"();`
- `CREATE TRIGGER "WebsiteContentEntry_prevent_published_mutation" BEFORE INSERT OR UPDATE OR DELETE ON "WebsiteContentEntry" FOR EACH ROW EXECUTE FUNCTION "prevent_published_website_content_child_mutation"();`
- `CREATE TRIGGER "WebsiteContentFaq_prevent_published_mutation" BEFORE INSERT OR UPDATE OR DELETE ON "WebsiteContentFaq" FOR EACH ROW EXECUTE FUNCTION "prevent_published_website_content_child_mutation"();`

### Riesgo, tiempo y compatibilidad

- Locks: CREATE TABLE/INDEX en tablas nuevas; ADD FK solicita SHARE ROW EXCLUSIVE en ProductFamily/Product/User además de nuevas tablas; CREATE TRIGGER solicita SHARE ROW EXCLUSIVE. Sin timeout explícito.
- DML: Ninguno. SELECT dentro de función sólo consulta al dispararse posteriormente; no escribe ni publica.
- Backfill: Ninguno: tablas editoriales comienzan vacías; status default DRAFT no crea registros.
- Riesgo: P0: privilegios directos anon/authenticated efectivos sin RLS en tablas creadas. MEDIUM por dependencia de 7 y corrección de 9. No detener liberación con sólo 8 aplicada; nueva API requiere esquema completo.
- Tiempo esperado: Estimación no medida: segundos para tablas nuevas vacías, más espera de locks de Product/User. No es SLA ni tiempo medido.
- Reversibilidad: Conservar estructuras y contenido; rollback.sql borra fuentes/revisiones y no se autoriza. No retirar FK/triggers para forzar eliminaciones.
- Backend anterior: No usa tablas nuevas; lecturas compatibles. En el futuro eliminar Product/Family o actores ligados a editorial puede fallar por inmutabilidad/RESTRICT, protección deliberada; V1 parte de editorial vacío.
- Frontend anterior: Ignora nuevas tablas y sigue API anterior; ninguna publicación se produce por migración.

## 9 — 20260902090000_editorial_media

Archivo: `backend/prisma/migrations/20260902090000_editorial_media/migration.sql`. SHA-256: `1b16f8f1be3e130f23e75955bb6a4db76a43e68e7d836c3284cd071a77f679a4`.

### Revisión por líneas

| Líneas | Evaluación |
| --- | --- |
| 1–14 | CREATE OR REPLACE de función anterior: OLD para DELETE; corrección semántica, no actualización de filas. |
| 16–16 | Enum de cinco roles editoriales. |
| 18–43 | Media: 15 columnas, PK y siete CHECK; WebP, bucket fijo product-media, tamaño máximo 10 MiB. |
| 45–52 | Dos índices únicos y uno no único redundante con el primer índice. |
| 54–57 | FK a Revision con CASCADE; aún no hay medios productivos. |
| 59–81 | Función de inmutabilidad media: rechaza parent PUBLISHED, retorno OLD/NEW correcto. |
| 83–86 | Trigger BEFORE INSERT/UPDATE/DELETE media. |

Las líneas no listadas son separadores vacíos; los comentarios asociados están incluidos en los bloques.

### Tablas, columnas y constraints

**WebsiteContentMedia**

- `"id" TEXT NOT NULL`
- `"revisionId" TEXT NOT NULL`
- `"role" "WebsiteContentMediaRole" NOT NULL`
- `"bucket" TEXT NOT NULL`
- `"storagePath" TEXT NOT NULL`
- `"alt" TEXT NOT NULL`
- `"position" INTEGER NOT NULL DEFAULT 0`
- `"width" INTEGER`
- `"height" INTEGER`
- `"byteSize" INTEGER NOT NULL`
- `"sha256" TEXT NOT NULL`
- `"mimeType" TEXT NOT NULL`
- `"reviewRequired" BOOLEAN NOT NULL DEFAULT false`
- `"editorialWarning" TEXT`
- `"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`

- `CONSTRAINT "WebsiteContentMedia_pkey" PRIMARY KEY ("id")`
- `CONSTRAINT "WebsiteContentMedia_position_check" CHECK ("position" >= 0)`
- `CONSTRAINT "WebsiteContentMedia_width_check" CHECK ("width" IS NULL OR "width" > 0)`
- `CONSTRAINT "WebsiteContentMedia_height_check" CHECK ("height" IS NULL OR "height" > 0)`
- `CONSTRAINT "WebsiteContentMedia_byteSize_check" CHECK ("byteSize" > 0 AND "byteSize" <= 10485760)`
- `CONSTRAINT "WebsiteContentMedia_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')`
- `CONSTRAINT "WebsiteContentMedia_mimeType_check" CHECK ("mimeType" = 'image/webp')`
- `CONSTRAINT "WebsiteContentMedia_bucket_check" CHECK ("bucket" = 'product-media')`

### Enums

- WebsiteContentMediaRole: HERO, BENEFITS, USAGE, SAFETY, INFOGRAPHIC

### Índices y FK

- `CREATE UNIQUE INDEX "WebsiteContentMedia_revisionId_role_position_key" ON "WebsiteContentMedia"("revisionId", "role", "position");`
- `CREATE UNIQUE INDEX "WebsiteContentMedia_revisionId_bucket_storagePath_key" ON "WebsiteContentMedia"("revisionId", "bucket", "storagePath");`
- `CREATE INDEX "WebsiteContentMedia_revisionId_role_position_idx" ON "WebsiteContentMedia"("revisionId", "role", "position");`

- `ALTER TABLE "WebsiteContentMedia" ADD CONSTRAINT "WebsiteContentMedia_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "WebsiteContentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;`

### Funciones y triggers

- Función: `prevent_published_website_content_revision_mutation`
- Función: `prevent_published_website_content_media_mutation`

- `CREATE TRIGGER "WebsiteContentMedia_prevent_published_mutation" BEFORE INSERT OR UPDATE OR DELETE ON "WebsiteContentMedia" FOR EACH ROW EXECUTE FUNCTION "prevent_published_website_content_media_mutation"();`

### Riesgo, tiempo y compatibilidad

- Locks: DDL/índices en tabla nueva, FK y trigger usan SHARE ROW EXCLUSIVE en nuevas tablas/revisión; función sustituye metadatos, sin backfill; no locks sobre Order/Payment.
- DML: Ninguno. Corrige función, no cambia status ni filas existentes.
- Backfill: Ninguno. No crea bucket Storage ni objetos ni asociaciones.
- Riesgo: P0: privilegios directos anon/authenticated efectivos sin RLS en tablas creadas. LOW-MEDIUM: depende de 8; corrige trigger antes de utilizar editorial. Índice no único repite columnas del único (coste futuro menor).
- Tiempo esperado: Estimación no medida: segundos con tabla vacía y sin bloqueo, más latencia; sin ensayo de aplicación esta noche.
- Reversibilidad: Volver apps conservando tabla/función corregida. rollback.sql eliminaría medios y reintroduciría RETURN NEW defectuoso para DELETE; no usar.
- Backend anterior: No consulta la tabla; corrección permite DELETE de DRAFT con semántica adecuada, PUBLISHED sigue protegido.
- Frontend anterior: Medios opcionales; frontend viejo los ignora; sin contenido PUBLISHED no cambia exposición pública.

## Corrección del trigger en 9

En 8, BEFORE DELETE de revisión no publicada retorna NEW, que es nulo en DELETE y cancela silenciosamente la operación. En 9 retorna OLD para DELETE y NEW en UPDATE; mantiene la excepción para OLD.status=PUBLISHED. Esta semántica está documentada por [PostgreSQL 17](https://www.postgresql.org/docs/17/plpgsql-trigger.html). Aplicar 8 sin 9 no es el estado certificado.

## Límites de integridad y asuntos posteriores

- **P2 — reparenting privilegiado:** triggers Entry/Faq/Media verifican NEW.revisionId en UPDATE, no el parent OLD. Una escritura SQL privilegiada que cambie revisión puede eludir esa defensa concreta; API estricta no acepta revisionId en actualización y exige DRAFT. No se demostró exposición pública. Reforzar ambos parents y cubrirlo en un PR posterior, sin editar migraciones ya aplicadas.
- **P2 — índice redundante:** el índice no único Media revisionId/role/position repite columnas del único. No altera resultados ni bloquea lanzamiento; optimización futura.
- **P0 confirmado — RLS/grants:** las seis tablas editoriales en staging tienen grants efectivos anon/authenticated sin RLS; ver bloqueo inicial. No inferir protección sólo porque Express exige ADMIN.
- Las FK CASCADE tienen efecto ante eliminaciones futuras, no durante migración. Con editorial publicado, los triggers pueden impedir eliminar Product/Family/actores con historial; es protección deliberada y no debe eludirse.

## Rollback

Conservar el esquema aditivo y datos. Volver Pages anterior, luego backend anterior. Los tres archivos rollback.sql no se ejecutan por Prisma deploy y no están autorizados: eliminan columnas/tablas/historia; rollback 9 además reintroduce el defecto de DELETE. Una falla/estado parcial requiere inspección de _prisma_migrations y decisión controlada, nunca rollback SQL ni restore automático.
