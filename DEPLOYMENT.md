# Deployment

## Arquitectura recomendada

- Frontend estático: Cloudflare Pages.
- Backend Node persistente y cron: Render.
- PostgreSQL y Storage: Supabase existente.
- Pagos: Mercado Pago; mantener credenciales TEST en staging.

La elección reduce operación de servidores y permite despliegues/rollback independientes. Los costos finales dependen del tráfico y del plan elegido; no se contrató ni configuró ningún servicio.

## Orden de despliegue

1. Crear staging y configurar secretos únicamente en el proveedor.
2. Backend: `npm ci`, `npx prisma generate`, `npm run build`, `npm run prisma:migrate`, iniciar con `npm start` y comprobar `/health` y `/ready`.
3. Programar cada minuto `npm run inventory:release-expired` usando el mismo release compilado y las variables de producción.
4. Frontend: definir `VITE_API_URL` y `VITE_SITE_URL`; ejecutar `npm ci`, `npm run sitemap`, `npm run lint`, `npm run build`.
5. Validar staging y luego promover exactamente el mismo commit.

El job de sitemap es estricto por defecto. CI usa `SITEMAP_ALLOW_STALE=true` solamente para validar el build cuando el backend aún no existe; el deploy productivo debe generar un sitemap fresco contra la API desplegada.

## Variables

Backend: todas las de `backend/.env.example`. En producción son adicionales/obligatorias `NODE_ENV=production`, URLs HTTPS reales, `DATABASE_SSL_REJECT_UNAUTHORIZED=true`, y límites específicos de auth, checkout y webhook. Frontend sólo recibe `VITE_API_URL` y `VITE_SITE_URL`; ningún secreto debe llevar prefijo `VITE_`.

`ERROR_TRACKING_DSN` es opcional. Sin valor no se envía nada; al configurarlo se activa Sentry sin PII ni bodies de request. Los health checks y logs estructurados a stdout deben conectarse al monitoreo nativo del proveedor con alertas para caída, 5xx, webhooks, cron, DB, inventario y rate limit.

## Base de datos y conexiones

Para un proceso Node persistente se recomienda el pooler de sesión de Supabase, con un límite conservador, o la conexión directa si el plan y conexiones disponibles lo permiten. El transaction pooler queda reservado para cómputo serverless. TLS debe validar certificados en producción. Las migraciones se ejecutan sólo con `prisma migrate deploy`; nunca `db push`, `migrate dev` ni reset.

## Dominios y Mercado Pago

Cuando exista dominio real, configurar sitio, API, DNS/HTTPS, `CORS_ORIGIN`, las dos variables Vite, `API_PUBLIC_URL`, sitemap, robots, canonical y el webhook `https://API_REAL/api/payments/webhook`. Cambiar Access Token y secret de Mercado Pago a producción sólo con autorización explícita y sin ejecutar cobro real durante el despliegue.

## Auditoría de dependencias

Tras actualizar únicamente dentro de rangos compatibles, frontend queda sin hallazgos. Backend mantiene tres avisos altos exclusivamente en el CLI/configuración de Prisma (`prisma` → `@prisma/config` → `deepmerge-ts`); no forman parte de las rutas HTTP ni procesan input del cliente. `npm audit` propone un downgrade mayor incompatible, por lo que se conserva Prisma 7.10 y se debe reevaluar cuando Prisma publique la corrección compatible. No se usó `npm audit fix --force`.
