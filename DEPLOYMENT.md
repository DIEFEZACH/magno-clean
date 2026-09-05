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

Backend: todas las de `backend/.env.example`. En producción son adicionales/obligatorias `NODE_ENV=production`, URLs HTTPS reales, `DATABASE_SSL_REJECT_UNAUTHORIZED=true`, y límites específicos de auth, checkout y webhook. El navegador recibe únicamente configuración pública con prefijo `VITE_`; ningún secreto debe usar ese prefijo. El transporte auth de Pages tiene configuración server-side separada, descrita a continuación.

`ERROR_TRACKING_DSN` es opcional. Sin valor no se envía nada; al configurarlo se activa Sentry sin PII ni bodies de request. Los health checks y logs estructurados a stdout deben conectarse al monitoreo nativo del proveedor con alertas para caída, 5xx, webhooks, cron, DB, inventario y rate limit.

## Base de datos y conexiones

Para un proceso Node persistente se recomienda el pooler de sesión de Supabase, con un límite conservador, o la conexión directa si el plan y conexiones disponibles lo permiten. El transaction pooler queda reservado para cómputo serverless. TLS debe validar certificados en producción. Las migraciones se ejecutan sólo con `prisma migrate deploy`; nunca `db push`, `migrate dev` ni reset.

## Dominios y Mercado Pago

Cuando exista dominio real, configurar sitio, API, DNS/HTTPS, `CORS_ORIGIN`, las dos variables Vite, `API_PUBLIC_URL`, sitemap, robots, canonical y el webhook `https://API_REAL/api/payments/webhook`. Cambiar Access Token y secret de Mercado Pago a producción sólo con autorización explícita y sin ejecutar cobro real durante el despliegue.

## Auditoría de dependencias

Tras actualizar únicamente dentro de rangos compatibles, frontend queda sin hallazgos. Backend mantiene tres avisos altos exclusivamente en el CLI/configuración de Prisma (`prisma` → `@prisma/config` → `deepmerge-ts`); no forman parte de las rutas HTTP ni procesan input del cliente. `npm audit` propone un downgrade mayor incompatible, por lo que se conserva Prisma 7.10 y se debe reevaluar cuando Prisma publique la corrección compatible. No se usó `npm audit fix --force`.

## Candidato integrado: demo y futura producción

Esta matriz es preparación de configuración, **no autorización ni evidencia de despliegue productivo**. La validación productiva automatizada es una simulación local con catálogo sintético y `fetch` inyectado: no consulta producción ni reutiliza el sitemap de staging cambiando su dominio.

| Variable | Demo Preview de staging | Futura producción, pendiente de autorización |
| --- | --- | --- |
| `VITE_DEMO_PREVIEW` (build) | `true` | `false` explícito |
| `VITE_SITE_URL` (build) | `https://codex-integrated-candidate.magno-clean-staging.pages.dev` | `https://www.magnoclean.com.mx` |
| `VITE_API_URL` (build) | `https://magno-clean-api-staging.onrender.com` | `https://magno-clean-api.onrender.com` |
| `VITE_AUTH_PROXY_ENABLED` (build) | `true` | `true`, únicamente junto con Functions y bindings validados |
| `SITEMAP_ENVIRONMENT` (build) | `staging` | `production` |
| `SITEMAP_ALLOW_STALE` (build de certificación) | `false` | `false` obligatorio |
| `AUTH_DEPLOYMENT_ENVIRONMENT` (runtime Function) | `staging` | `production` |
| `AUTH_UPSTREAM_URL` (runtime Function) | `https://magno-clean-api-staging.onrender.com` | `https://magno-clean-api.onrender.com` |
| `AUTH_ALLOWED_FRONTEND_ORIGINS` (runtime Function) | `["https://codex-integrated-candidate.magno-clean-staging.pages.dev"]` (añadir individualmente los alias de staging autorizados que deban conservarse) | `["https://www.magnoclean.com.mx","https://magno-clean.pages.dev"]`, incluir sólo los destinos realmente autorizados |

Los `VITE_*` quedan incorporados al bundle durante el build; cambiar un binding runtime no los modifica. `AUTH_*` pertenece al entorno de ejecución server-side de Pages, sin prefijo `VITE_`, sin secretos de JWT/Service Role y sin fallback a variables Vite, `NODE_ENV` o detección implícita del host. El JSON de orígenes contiene HTTPS exactos, sin comodines, puerto, credenciales, ruta, query ni fragmento; cada nuevo alias debe autorizarse explícitamente. No se deduce autorización por pertenecer a `pages.dev`. La Function rechaza configuración incompleta/cruzada con JSON 503 sin reenviar credenciales. Publicar sólo assets estáticos no valida este transporte.

### Etiqueta y políticas de indexación

- Sólo el valor literal `VITE_DEMO_PREVIEW="true"` activa el banner, el `noindex,nofollow` global de HTML/`Seo` y el `X-Robots-Tag` estático de la demo. Requiere un hostname Preview explícito de `magno-clean-staging.pages.dev`; no admite producción ni el alias estable como demo.
- El valor literal `"false"` retira esos overrides globales y el banner. **No elimina** un `noIndex` explícito de una página: las páginas legales provisionales conservan el suyo.
- `robots.txt` conserva los `Disallow` existentes de `/admin`, `/admin/`, `/checkout`, `/checkout/` y `/carrito`; no equivalen a meta `noindex` ni a control de acceso. Actualmente Admin y Checkout no declaran un meta `noindex` propio: esta consolidación no inventa ni amplía esa política.
- `_headers` aplica a assets estáticos; las respuestas auth de la Function establecen `Cache-Control: no-store` directamente. Ni `noindex` ni `robots.txt` sustituyen autenticación.
- El sitemap de un futuro release deberá regenerarse desde el catálogo del entorno autorizado, sin fallback stale. El test local usa sólo 2 publicaciones ficticias (9 URLs incluyendo estáticas/categoría); no certifica las 41 publicaciones reales ni la indexación de producción.

Pruebas locales: `npm exec -- vitest run src/components/PreviewNotice.test.tsx` y `node --test scripts/build-config.test.mjs`, desde `frontend`. Verifican ambos builds en directorios temporales, salida HTML/headers/bundle, conservación de exclusiones, `noIndex` explícito y ausencia de configuración auth runtime en los assets del navegador. No modifican `.env`, configuración remota ni el sitemap del repositorio.
