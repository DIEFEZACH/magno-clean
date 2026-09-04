# Certificación nocturna — RELEASE VISIBLE V1

Fecha de ejecución: 2026-09-04 UTC. **Veredicto: NO_GO.**

RELEASE_SHA fijo: `050f890f2704b0b6d6a57c7e76e5520525b8c835`.
Main remoto continúa en ese SHA. El branch documental añade únicamente evidencia, no cambia el candidato. Producción Render/Pages permanece en `f25412ab916549edee0cf4098bca6ad4e29e62c6`.

## Resultado ejecutivo

La funcionalidad visible y los conteos cumplen el plan, pero no es seguro autorizar el release actual: existe un P0 de privilegios de DB y dos P1 (precio mayorista público legacy y overflow legal móvil). Se abrieron correcciones separadas sin merge ni aplicación. La auditoría Admin autenticada fue omitida expresamente para no crear credenciales mientras User/RefreshToken carecen de aislamiento de clientes directos.

No se ejecutó la liberación productiva. La única operación productiva adicional a lectura fue **pg_dump**, que leyó la base y creó un archivo local privado. No hubo escritura DB remota, migration, APPLY, deploy manual/automático productivo, publicación editorial, pagos, cambios de stock ni DNS.

## Registro de las 24 fases

| Fase | Resultado | Evidencia / límite |
| --- | --- | --- |
| 1 Worktree | PASS | Worktree nuevo desde RELEASE_SHA; principal ocupado intacto, sin stash/reset/clean |
| 2 Inventario | PASS | 183 paths clasificados, ambos commits productivos confirmados |
| 3 Builds/CI | PASS con límite | 309/309 existentes; simulación productiva real bloqueada por API antigua 404, alternativa aislada explícita aprobada |
| 4 QA público | P1 | 247 combinaciones reales; 246 sin overflow y fallo Devoluciones/320 |
| 5 Catálogo | PASS | 25+16=41, 79 variantes, búsquedas/filtros/paginación y siete sorts |
| 6 ProductDetail | PASS con límite | 18 query variants, 5 inválidas y 5 históricas en navegador; chips agotados no forzados |
| 7 Accesibilidad | PARCIAL | Menú/foco/teclado/reduced-motion; P2 targets y sin Safari/lector físico |
| 8 Admin staging | BLOCKED_SECURITY | No seed/login/token; User=0, RefreshToken=0 |
| 9 SEO/sitemap | PASS | 48 URLs frescas calculadas; 41 comerciales; no stale productivo |
| 10 Seguridad | FAIL P0/P1 | Metadatos de privilegios/RLS y legacy wholesalePrice; no explotación |
| 11 DRY-RUN | PASS | Dos entornos, TLS estricto, cero conflictos/escrituras |
| 12 Migraciones | BLOCKING_RISK | DDL aditivo sin backfill, pero falta cierre de permisos; 7–9 no aplicadas a producción |
| 13 Variables | PASS por nombres | 30 presentes; checkout false; bucket media default, no requerido |
| 14 Backup | PASS | Nuevo custom 260328 bytes, TOC 438, permisos privados, sin restore |
| 15 Readiness | COMPLETE | 41 publicaciones; fuentes/borradores y cobertura directa separados |
| 16 Medios | COMPLETE | 218 objetos, cero extras/diferencias de tamaño; nada asociado/publicado |
| 17 Albert | COMPLETE | Referencia local disponible, 31 comparaciones; ningún código copiado |
| 18 Roadmap | COMPLETE | 24 funciones y exactamente seis lotes posteriores |
| 19 Repositorio | COMPLETE | 450.25 MiB PDF fuera del bundle; copias ajenas intactas |
| 20 P2 aislados | SEPARATE_PR | Controles/acción Ver sólo en rama separada; nunca en RELEASE_SHA |
| 21 Runbook | BLOCKED_BY_NO_GO | Secuencia y comandos futuros documentados; cero ejecución mutante |
| 22 Rollback | DOCUMENTED_ONLY | Artefactos previos confirmados; schema/Products se preservan |
| 23 Certificación | COMPLETE_NO_GO | Este informe, JSON y decisión |
| 24 Git/PR | DOCUMENTATION_ONLY | Documentos y correcciones separados; todos sin merge |

## CI y build reproducible

[CI main](https://github.com/DIEFEZACH/magno-clean/actions/runs/33857764802) terminó correctamente. Instalaciones nuevas con lockfiles, Prisma format-check/validate/generate, backend build, frontend TypeScript/lint/build y sitemap aprobados. Suite: **218 backend + 23 frontend + 60 scripts/sitemap + 8 Playwright = 309**, cero fallos/skips finales. Además 22 comprobaciones aisladas de HTTP, comercio y sorts.

Los npm ci demoraron aproximadamente 422 s cada uno; warnings de dependencias transitivas antiguas documentados, sin `npm audit fix` ni upgrades. Assets staging 750202 bytes; simulación productiva 750186 bytes; 57 assets. Los 55 PDFs no se copian al build frontend.

La API productiva vieja no tiene `/api/catalog`: el prebuild productivo falló cerrado con 404. Se validó un segundo build local con URLs productivas exactas y datos públicos staging interceptados sólo para sitemap. **No equivale a haber compilado contra el futuro catálogo productivo** ni autoriza stale. Backend y plan deben estar listos antes del verdadero build público.

## Staging y cierre

Render Live `dep-dad8q795efls73f1lg60` y Pages `9c2beae7-c85b-44e1-9058-b89448c0addd` contienen RELEASE_SHA. `/health`, `/ready`, `/api/catalog` responden 200; detalle inexistente responde 404.

Reconciliación READ ONLY final: Product98, activos95/inactivos3, ProductFamily25, vínculos79, individuales activos16, stock0/reservedStock0. User0, RefreshToken0; seis tablas editoriales vacías; Order/OrderItem/Payment/InventoryReservation/InventoryMovement/ProductImage=0. Triggers editoriales siguen habilitados. No hubo fixtures creados y por tanto nada temporal que borrar; el baseline persistente permanece intacto. Storage product-media218 y product-images0, sin uploads ni cambios.

El checkout TEST de staging permanece true como estaba; no se confundió con el requisito productivo false. No se ejecutó checkout ni se inventó stock. No hay asociaciones editoriales PUBLISHED expuestas por la API; esto no significa que los 218 objetos del bucket público sean inaccesibles por su URL. Product.imageUrl existente sigue siendo independiente del contenido editorial.

## Plan, migraciones y producción

Plan SHA-256 `686cec7028b355fcc171fad41d2881af4442c9cea68f3a13b576c957bcea0710`.

| Métrica | Staging DRY-RUN | Producción READ-ONLY pre-migration |
| --- | ---: | ---: |
| Productos / activos / inactivos | 98 / 95 / 3 | 98 / 95 / 3 |
| Familias sin cambios | 25 | 0 |
| Vínculos sin cambios | 79 | 0 |
| Familias por crear | 0 | 25 |
| Variantes por vincular | 0 | 79 |
| Individuales activos previstos | 16 | 16 |
| Publicaciones finales | 41 | 41 |
| Conflictos / desconocidos / campos protegidos modificables | 0 / 0 / 0 | 0 / 0 / 0 |
| Escrituras ejecutadas | 0 | 0 |

Staging tiene 9/9 migraciones; producción 6/6, todas terminadas/checksums coincidentes. Las 7–9 no contienen backfill ni DML de negocio; sí requieren orden de despliegue, locks y revisión de seguridad. La migración 9 cambia también la función de trigger. No aplicar el plan antiguo mientras el P0 siga abierto.

Producción mantiene Product98, 95 activos/3 inactivos, User1, RefreshToken21, Order2, OrderItem2, Payment1, InventoryMovement98 y ProductImage1 preexistentes. ProductFamily/editoriales ausentes. No se inspeccionaron ni registraron contenido personal, hashes de usuarios o valores de inventario productivo en los reportes. El pg_dump privado sí contiene los datos de las tablas autorizadas. product-images conserva un objeto y product-media no existe. Los conteos son controles sanitizados, no una comparación criptográfica de cada fila.

## Backup nuevo autorizado

- Archivo privado: `/Users/diegodiefezach/.local/share/magno-clean/backups/production/release-visible-v1-20260904T094814587Z/magno-clean-production-20260904T094814587Z.dump`.
- Timestamp UTC: `2026-09-04T09:48:14.588Z`; duración 22.604 s; tamaño **260328 bytes**.
- SHA-256: `a2addba48cfe529b028f392ce789d1d7b1a76b8cafdb9be6c20087bbdd471055`.
- pg_dump/pg_restore18.6; servidor17.6; TLS verify-full con CA oficial; `default_transaction_read_only=on`.
- Custom, no-owner/no-acl; directorio0700, dump/checksum/TOC0600. PGPASSFILE temporal eliminado al terminar, sin URL/contraseña en argumentos o reporte.
- `pg_restore --list` exit0; **438 objetos TOC**; TABLE DATA de las nueve tablas críticas presentes.
- No restore, no cifrado/offsite, no copia de Storage binario, no borrado de backups anteriores. TOC legible no demuestra una restauración completa; ese ensayo sigue pendiente en entorno desechable.

La compatibilidad de pg_dump más nuevo con servidor anterior está documentada por [PostgreSQL](https://www.postgresql.org/docs/current/app-pgdump.html); no se infiere compatibilidad de restaurar en cualquier versión menor.

## Seguridad, PR y decisiones pendientes

[NO_GO y riesgos](release-visible-v1-go-no-go.md) distingue vulnerabilidad confirmada de metadatos de exposición HTTP no probada. **No se creó un administrador mientras sus tablas tienen permisos inseguros.** No se relaja CORS/TLS ni se revocan credenciales automáticamente.

Correcciones abiertas y separadas:

- [PR15: precio privado legacy](https://github.com/DIEFEZACH/magno-clean/pull/15), base RELEASE_SHA; 3 regresiones nuevas, 221 backend.
- [PR16: legal 320 px](https://github.com/DIEFEZACH/magno-clean/pull/16), base RELEASE_SHA; 39 mediciones nuevas.
- [PR17: acceso directo DB](https://github.com/DIEFEZACH/magno-clean/pull/17), propuesta nueva migración de seguridad **no aplicada**; 10 pruebas PostgreSQL aislado en memoria, 228 backend; sin entornos persistentes.
- [PR18: P2 visual](https://github.com/DIEFEZACH/magno-clean/pull/18), `codex/post-v1-visual-polish`, fuera del candidato. Dos P2 reproducidos y corregidos; 35 E2E y 83 frontend; letra aislada exacta no reproducida, sin cambiar ProductDetail.

Backend/frontend de GitHub Actions pasan en los cuatro PR de corrección, en los SHA registrados en el JSON. La CI de cada PR es independiente de la CI verde del release; debe volver a revisarse si cambia su SHA. Cloudflare Preview y 39 mediciones reales del arreglo legal también pasan. Ningún PR abierto cuenta como corrección del sistema live.

## Readiness, medios y trabajo posterior

41 publicaciones tienen representación coherente; ninguna tiene WebsiteContent publicado. La matriz separa readiness visible de autorización editorial o comercial. Sólo seis detalles recibieron QA visual directo; los demás usan evidencia de contrato y componente, sin inventar una prueba visual individual.

218 objetos / 44952174 bytes concilian por paths, MIME y tamaños. No se descargaron todos para rehashearlos ni se declara nueva validación criptográfica de cada objeto. Los planes de asociación locales no versionados son borradores suplementarios claramente identificados, no autorización. CITRICAL conserva bloqueos 250 GR, aromas, PLCT2/3 rotulados 1 KG y olor Menta ligera; no se publicó ninguna pieza.

Albert & Co. se encontró en Documents/ChatGPT; 31 funciones comparadas sin copiar código. Roadmap: 24 funciones, exactamente seis lotes limitados, decisiones comerciales explícitas. No se inició ninguno.

## Índice de evidencias y operación futura

- [Inventario del release](release-visible-v1-change-inventory.md) + JSON.
- [Build/contratos](release-visible-v1-build-and-contracts.md) + JSON.
- [QA visual](release-visible-v1-visual-qa.md), 42 capturas locales privadas.
- [Migraciones](release-visible-v1-migration-audit.md) + JSON.
- [Configuración productiva](release-visible-v1-production-config.md).
- [Readiness productos](release-visible-v1-product-readiness.md) + JSON; [medios](release-visible-v1-media-readiness.md) + JSON.
- [Repo](release-visible-v1-repository-audit.md); [comparación Albert](../roadmaps/albert-vs-magno-functional-matrix.md) + JSON; [roadmap](../roadmaps/post-release-v1-roadmap.md) + JSON.
- [Runbook bloqueado y comandos exactos no ejecutados](release-visible-v1-runbook.md), [rollback](release-visible-v1-rollback.md), [checklist](release-visible-v1-checklist.md), [smoke tests](release-visible-v1-smoke-tests.md).

Los comandos mutantes del runbook requieren otro SHA aprobado y nuevas autorizaciones; no basta copiar el orden histórico. Rollback prioriza Pages anterior y Render anterior, conservando schema aditivo y Product; no rollback.sql ni restore automático. No existe autorización para borrar historial PUBLISHED o deshacer inventario.

## Confirmaciones finales

Producción no modificada; sin migraciones productivas, APPLY, despliegue, uploads, cambios DNS/auth/checkout/inventario/Mercado Pago. CHECKOUT_ENABLED=false productivo confirmado; no se activó LIVE. Ninguna operación apuntó a los archivos originales/ajenos: el estado final conserva las mismas 83 rutas no rastreadas (18 copias « 2») y las dos modificaciones de sitemap/robots; no existe baseline inicial de hashes para afirmar comparación byte a byte. Snapshots, capturas, dumps, logs y secretos fuera del commit. No merges adicionales. No siguiente lote automático.
