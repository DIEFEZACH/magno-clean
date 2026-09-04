# Preparación de multimedia — release visible V1

RELEASE_SHA: `050f890f2704b0b6d6a57c7e76e5520525b8c835`. Consulta staging READ-ONLY: 2026-09-04T09:46:34.877Z. Cero escrituras, asociaciones, publicaciones o descargas masivas.

## Resultado observado

218 objetos,44,952,174 bytes, todos WebP. Coinciden por path/MIME/tamaño con el subconjunto esperado: 0 objetos extra y 0 diferencias de bytes. El manifest versionado tiene 239 registros, 226 paths optimizados y 13 registros para revisión; 8 paths optimizados adicionales no forman parte del universo subido. 38 grupos documentales no son 25 familias comerciales: 36 grupos tienen objetos presentes.

WebsiteContentMedia=0, ProductImage=0 y WebsiteContent=0 en staging. Las 95 referencias Product.imageUrl del catálogo son imágenes comerciales existentes, no asociaciones editoriales de product-media. Ningún objeto disponible en Storage se considera automáticamente publicado.

**Estado global de seguridad:** esta preparación no autoriza GO. La certificación principal identificó un P0 transversal de acceso a tablas editoriales; requiere resolución aparte antes de liberar.

## Procedencia y límites

Manifest: `docs/product-data/media-manifest.json`, SHA-256 `b296eae6f1e997614f921e5ce2825099cc1af211ff96be84bf47ed14cdbb24d6`, dentro de RELEASE_SHA. Los planes/revisiones de asociación consultados son **UNVERSIONED_DRAFT** suplementarios; no se copiaron sus fuentes completas ni se convirtieron en autoridad del release.

- Storage presence, MIME and byte size were compared; the 218 object bodies were not downloaded and their content hashes were not recomputed.
- Expected SHA-256 comes only from the versioned manifest. Matching size does not certify content integrity or safety.
- UNVERSIONED_DRAFT statuses preserve prior documentary objections; they are not approved runtime associations and do not redefine the25 canonical ProductFamily groups.
- A full uploaded media group does not imply all variants have correct images, technical content is approved, or publication is authorized.
- The publication-readiness matrix uses only canonical plan, versioned manifest and staging reads for its primary state; draft evidence is separate.
- A cross-cutting P0 editorial database-access issue identified by the main certification blocks global GO; product/media readiness does not override it.

## Roles presentes

| Role del manifest | Objetos observados |
| --- | --- |
| BENEFITS | 24 |
| SAFETY | 22 |
| USAGE | 62 |
| HERO | 58 |
| VARIANT_IMAGE | 52 |

TECHNICAL_SHEET y SDS: 0 objetos subidos. Una ficha PDF versionada no equivale a una asociación aprobada ni a una ficha pública en la página.

## Candidatos documentales suplementarios

El borrador anterior clasifica 41 candidatos listos para revisión de asociación y 177 bloqueados/sin destino; 23 SKU tienen candidato de imagen considerado seguro en ese borrador. No son 41 publicaciones aprobadas, no significan 218 objetos aptos, y no se recalcularon por inferencia. Estados del borrador: 1 grupo FULLY_READY,15 PARTIALLY_READY,20 BLOCKED. “FULLY_READY” sólo cubre los objetos de ese grupo subido, no todos los roles/presentaciones que requiere una ficha premium.

| Grupo lógico | Registros / paths / presentes | Cobertura física | Ready / bloqueados del borrador | Estado documental |
| --- | --- | --- | --- | --- |
| ACABA-ÁCAROS | 7 / 5 / 5 | ALL_MANIFEST_PATHS_PRESENT | 0 / 5 | BLOCKED |
| AMOXI ULTRA | 8 / 7 / 7 | ALL_MANIFEST_PATHS_PRESENT | 0 / 7 | BLOCKED |
| APC CITRUS NEUTRO | 8 / 8 / 8 | ALL_MANIFEST_PATHS_PRESENT | 0 / 8 | BLOCKED |
| APC TNT | 8 / 8 / 8 | ALL_MANIFEST_PATHS_PRESENT | 5 / 3 | PARTIALLY_READY |
| BIO WASH ENJUAGUE | 7 / 6 / 6 | ALL_MANIFEST_PATHS_PRESENT | 0 / 6 | BLOCKED |
| BIO WASH PRE-LAVADOR | 7 / 7 / 6 | PARTIAL_MANIFEST_PATHS_PRESENT | 0 / 6 | BLOCKED |
| BLANCOLCHON FORTE | 8 / 8 / 8 | ALL_MANIFEST_PATHS_PRESENT | 7 / 1 | PARTIALLY_READY |
| BLUE GEL | 8 / 8 / 8 | ALL_MANIFEST_PATHS_PRESENT | 2 / 6 | PARTIALLY_READY |
| CHAZAM | 7 / 7 / 6 | PARTIAL_MANIFEST_PATHS_PRESENT | 0 / 6 | BLOCKED |
| CITRICAL | 7 / 7 / 7 | ALL_MANIFEST_PATHS_PRESENT | 0 / 7 | BLOCKED |
| CITRIMAG | 6 / 6 / 6 | ALL_MANIFEST_PATHS_PRESENT | 0 / 6 | BLOCKED |
| CRISTALIZADOR DON REMIGIO H. | 6 / 5 / 5 | ALL_MANIFEST_PATHS_PRESENT | 0 / 5 | BLOCKED |
| FINE CLEANNER | 5 / 5 / 5 | ALL_MANIFEST_PATHS_PRESENT | 0 / 5 | BLOCKED |
| FINE ENJUAGUE | 5 / 5 / 5 | ALL_MANIFEST_PATHS_PRESENT | 0 / 5 | BLOCKED |
| HIDRATADOR DE CUERO | 6 / 6 / 6 | ALL_MANIFEST_PATHS_PRESENT | 1 / 5 | PARTIALLY_READY |
| LIMPIADOR DE CUERO | 6 / 6 / 6 | ALL_MANIFEST_PATHS_PRESENT | 4 / 2 | PARTIALLY_READY |
| LYPTUS LIQUID | 7 / 7 / 7 | ALL_MANIFEST_PATHS_PRESENT | 2 / 5 | PARTIALLY_READY |
| MAGBOOSTER | 5 / 5 / 5 | ALL_MANIFEST_PATHS_PRESENT | 3 / 2 | PARTIALLY_READY |
| MAGNIFICO MAGNIFICO | 5 / 4 / 2 | PARTIAL_MANIFEST_PATHS_PRESENT | 1 / 1 | PARTIALLY_READY |
| MATA OLORES ENZIMATICO | 8 / 7 / 7 | ALL_MANIFEST_PATHS_PRESENT | 0 / 7 | BLOCKED |
| MULTIFIBRAS | 4 / 4 / 4 | ALL_MANIFEST_PATHS_PRESENT | 2 / 2 | PARTIALLY_READY |
| MULTIFIBRAS LYTPUS | 3 / 0 / 0 | NO_APPROVED_OPTIMIZED_PATHS | 0 / 0 | NO_DRAFT_GROUP |
| MULTIFIBRAS MENTA | 4 / 4 / 0 | PARTIAL_MANIFEST_PATHS_PRESENT | 0 / 0 | NO_DRAFT_GROUP |
| MULTIFIBRAS ORANGE | 3 / 3 / 3 | ALL_MANIFEST_PATHS_PRESENT | 3 / 0 | FULLY_READY |
| NEUTRO CAR | 7 / 7 / 7 | ALL_MANIFEST_PATHS_PRESENT | 2 / 5 | PARTIALLY_READY |
| ORANGE LIQUID | 8 / 7 / 7 | ALL_MANIFEST_PATHS_PRESENT | 5 / 2 | PARTIALLY_READY |
| OXIMAG | 6 / 6 / 6 | ALL_MANIFEST_PATHS_PRESENT | 0 / 6 | BLOCKED |
| PERMAG | 6 / 6 / 6 | ALL_MANIFEST_PATHS_PRESENT | 0 / 6 | BLOCKED |
| PEXIDIL | 7 / 7 / 7 | ALL_MANIFEST_PATHS_PRESENT | 0 / 7 | BLOCKED |
| PLANCHA FÁCIL | 5 / 5 / 5 | ALL_MANIFEST_PATHS_PRESENT | 1 / 4 | PARTIALLY_READY |
| PROTEMAG | 6 / 6 / 6 | ALL_MANIFEST_PATHS_PRESENT | 0 / 6 | BLOCKED |
| REPEL | 6 / 6 / 6 | ALL_MANIFEST_PATHS_PRESENT | 0 / 6 | BLOCKED |
| REPEL APPLY WET | 6 / 5 / 5 | ALL_MANIFEST_PATHS_PRESENT | 0 / 5 | BLOCKED |
| SEVEN NEUTRO | 7 / 7 / 7 | ALL_MANIFEST_PATHS_PRESENT | 0 / 7 | BLOCKED |
| SHAMPOO ALFOMBRAS | 8 / 8 / 8 | ALL_MANIFEST_PATHS_PRESENT | 1 / 7 | PARTIALLY_READY |
| SHAMPOO GERMICIDA | 7 / 7 / 7 | ALL_MANIFEST_PATHS_PRESENT | 1 / 6 | PARTIALLY_READY |
| SILICREMA | 5 / 5 / 5 | ALL_MANIFEST_PATHS_PRESENT | 0 / 5 | BLOCKED |
| ULTRA BLACK | 7 / 6 / 6 | ALL_MANIFEST_PATHS_PRESENT | 1 / 5 | PARTIALLY_READY |

## Bloqueos CITRICAL que se conservan

- hero/benefits: 250 GR is outside the approved PLCT1/PLCT2/PLCT3 SKU universe; do not add a SKU.
- usage: Menta/Kiwi/Naranja are not modelled as CITRICAL variants; do not infer fragrances.
- PLCT2: Supplementary visual review reports1 KG on asset intended for2 KG; block association.
- PLCT3: Supplementary visual review reports1 KG on asset intended for3 KG; block association.
- safety and variant content: Olor: Menta ligera remains pending human confirmation; source extraction confidence HIGH is not technical approval.
- PLCT1: Supplementary visual review reports Ropa ligera versus Menta ligera elsewhere; retain human review.

No se altera ninguna imagen actual ni se corrige texto, olor, masa o SKU automáticamente. Estos señalamientos de piezas de product-media no prueban que la misma pieza sea la imagen comercial Cloudinary actualmente servida.

## Precauciones de mapping

- MULTIFIBRAS LYTPUS in manifest differs from canonical MULTIFIBRAS LYPTUS; no alias or association inferred.
- MULTIFIBRAS MENTA optimized paths are absent from the uploaded universe; do not merge this media group with MULTIFIBRAS automatically.
- BIO WASH group-level names do not resolve Kiwi/Menta/Naranja individual SKU identity; repeated image URLs are not proof of equivalence.
- CHAZAM has repeated candidate code PLCZ2 in the manifest; never infer PLCZ3 from file order or presentation suffix.
- Supplementary APC/ORANGE/BLANCOLCHON family candidate membership is partial and older than the canonical25-family plan. Do not overwrite canonical memberships.

## Ocho paths optimizados excluidos del universo subido

- `bio-wash-pre-lavador/sds/sds-01.webp` (SDS).
- `chazam/sds/sds-01.webp` (SDS).
- `magnifico-magnifico/sds/sds-01.webp` (SDS).
- `magnifico-magnifico/technical-sheet/technical-sheet-01.webp` (TECHNICAL_SHEET).
- `multifibras-menta/usage/usage-01.webp` (USAGE).
- `multifibras-menta/variants/emlf5-5-l.webp` (VARIANT_IMAGE).
- `multifibras-menta/variants/emlf20-20-l.webp` (VARIANT_IMAGE).
- `multifibras-menta/usage/usage-02.webp` (USAGE).

La ausencia es consistente con exclusiones previas; no autoriza subirlos. El JSON compañero registra individualmente los 218 paths, roles, bytes observados, hash esperado y estado suplementario. No incluye IDs de base de datos ni URLs firmadas.

## Condición para el siguiente paso

Revisar sólo subconjuntos de paths explícitos, verificar contenido/hash cuando se autorice, resolver mapping y conflictos con responsable técnico, crear borrador no público y aprobar por separado. No publicar carpetas completas ni aplicar el plan documental antiguo sobre la agrupación canónica.
