# Configuración de staging

No usar credenciales productivas de Mercado Pago ni inventario real durante esta etapa.

## Aislamiento de Supabase

Se recomienda un segundo proyecto Supabase para staging. Evita que órdenes, pagos TEST, usuarios, reservas, imágenes y migraciones de prueba se mezclen con datos comerciales. También permite ensayar restore y migraciones sin riesgo. En Free puede utilizarse el segundo proyecto incluido si la organización aún tiene cupo; sus riesgos son suspensión por inactividad y ausencia de backups automáticos. Si no hay cupo, crear otra organización/proyecto o pasar a Pro requiere decisión manual.

Usar la misma base actual sólo sería aceptable temporalmente con un schema/base aislado y credenciales separadas, pero el código y las migraciones actuales apuntan a `public`; por ello no es la opción recomendada.

## Render Web Service — staging

- Tipo: Web Service.
- Repositorio: privado de GitHub.
- Branch: `main` inicialmente; posteriormente conviene una rama `staging` protegida.
- Root Directory: `backend`.
- Runtime: Node o Docker.
- Build Command: `npm ci && npx prisma generate && npm run build`.
- Pre-deploy Command: `npm run prisma:migrate`.
- Start Command: `npm start`.
- Health Check Path: `/health`.
- Readiness operativa: `/ready`.
- Plan: Starter o equivalente siempre activo; Free se suspende y no es adecuado para validar webhooks/cron consistentemente.
- Región: la misma o la más cercana a la región del proyecto Supabase de staging. No elegirla sólo por la ubicación del usuario.

Variables por nombre: `NODE_ENV`, `PORT`, `DATABASE_URL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `CORS_ORIGIN`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES_SECONDS`, `REFRESH_TOKEN_EXPIRES_DAYS`, `JSON_BODY_LIMIT`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, `CHECKOUT_RATE_LIMIT_MAX`, `WEBHOOK_RATE_LIMIT_MAX`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `DEFAULT_CURRENCY`, `MAX_ORDER_ITEMS`, `MAX_ITEM_QUANTITY`, `API_PUBLIC_URL`, `INVENTORY_RESERVATION_MINUTES`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PRODUCT_IMAGES_BUCKET`, `PRODUCT_IMAGE_MAX_BYTES`, `PRODUCT_IMAGE_MAX_COUNT`; `ERROR_TRACKING_DSN` es opcional.

Render proporciona `PORT`; no fijarlo manualmente si el panel ya lo gestiona. Ningún valor secreto debe almacenarse en Git.

## Render Cron — staging

- Tipo: Cron Job independiente.
- Mismo repositorio, branch, root y variables que el backend de staging.
- Build Command: `npm ci && npx prisma generate && npm run build`.
- Command: `npm run inventory:release-expired`.
- Schedule: `* * * * *` en UTC.

Render garantiza una sola ejecución simultánea del mismo cron. Además, el servicio de inventario usa transacciones e idempotencia por reserva, por lo que una repetición no debe descontar dos veces. Staging y producción deben tener jobs y variables separados.

## Cloudflare Pages — staging

- Repositorio: privado de GitHub.
- Root Directory: `frontend`.
- Build Command: `npm ci && npm run build`.
- Output Directory: `dist`.
- Node: 22.
- Variables: `VITE_API_URL` con la URL HTTPS de Render staging y `VITE_SITE_URL` con la URL HTTPS de Pages staging.

`public/_redirects` proporciona fallback SPA y `public/_headers` define caché. El sitemap productivo/staging debe generarse contra el backend disponible; no establecer `SITEMAP_ALLOW_STALE=true` en el deploy definitivo.

## Orden manual

1. Crear Supabase staging y aplicar las seis migraciones con `prisma migrate deploy`.
2. Crear Render Web Service y validar `/health` y `/ready`.
3. Crear Render Cron y ejecutar una corrida manual observando logs.
4. Crear Cloudflare Pages usando la URL del backend.
5. Actualizar `CORS_ORIGIN` del backend con la URL exacta de Pages y redesplegar.
6. Regenerar frontend para que sitemap, robots y canonical usen la URL staging.
7. Configurar el webhook de la aplicación Mercado Pago TEST hacia Render staging.
8. Ejecutar el smoke test completo documentado en `PRODUCTION_CHECKLIST.md`.
