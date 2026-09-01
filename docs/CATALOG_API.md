# API pública de catálogo

`GET /api/catalog` expone elementos comerciales paginados. Una familia cuenta como un elemento y sus variantes activas no se repiten como productos independientes. Los productos activos sin familia siguen apareciendo como elementos `PRODUCT`.

Parámetros: `page` (1), `pageSize` (24, máximo 48), `search`, `category`, `brand`, `featured` y `sort` (`featured`, `name-asc`, `name-desc`, `price-asc`, `price-desc`, `newest`, `oldest`).

`GET /api/catalog/:slug` resuelve slugs familiares, productos independientes y slugs históricos de variantes. Una variante agrupada devuelve su familia, `selectedVariantId` y el `canonicalSlug` familiar; no se aplican redirecciones permanentes en este lote.

Las respuestas públicas usan `Cache-Control: public, max-age=60, stale-while-revalidate=300`. Por ello, un cambio administrativo puede tardar hasta 60 segundos en verse en una respuesta nueva y una caché puede servir contenido anterior durante la revalidación. El servicio resuelve el listado con dos consultas Prisma por lote (familias con variantes activas y productos independientes), sin N+1.

`availableStock` es sólo informativo. El carrito, la reserva y el checkout continúan validando el `Product.id` vendible y el inventario real en el backend.

`GET /api/products` no cambia y sigue siendo el contrato plano utilizado por administración y ProductDetail durante esta etapa.
