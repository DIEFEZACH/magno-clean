# Configuración productiva — inspección de lectura

RELEASE_SHA `050f890f2704b0b6d6a57c7e76e5520525b8c835`; inspección 2026-09-04. No se cambió ninguna variable, servicio, dominio ni despliegue.

## Proveedores

| Servicio | Despliegue verificado | SHA | Estado |
| --- | --- | --- | --- |
| Render producción `magno-clean-api` | `dep-daauc8nlk1mc73ag4he0` | `f25412ab916549edee0cf4098bca6ad4e29e62c6` | Live; Auto-Deploy OFF |
| Pages producción `magno-clean` | `33398ca5-6ca9-4240-a52c-390500faf08f` | `f25412ab916549edee0cf4098bca6ad4e29e62c6` | activo; despliegue automático pausado |
| Render staging | `dep-dad8q795efls73f1lg60` | RELEASE_SHA | Live; Auto-Deploy, 3m09s |
| Pages staging | `9c2beae7-c85b-44e1-9058-b89448c0addd` | RELEASE_SHA | Success; 5m57s |

Render productivo conserva 5 despliegues en su historial. Los nuevos PR de esta tarea no se fusionan y no sustituyen ningún deployment productivo. No se pulsó Deploy, Rollback, Save ni Apply.

Build Render: root `backend`; `npm ci --include=dev && npx prisma generate && npm run build`; start `npm start`; health `/health`; sin predeploy de migraciones. Pages: root `frontend`, `npm run build`, `dist`. Las URLs públicas previstas siguen siendo backend `https://magno-clean-api.onrender.com` y web `https://www.magnoclean.com.mx`.

## Presencia por nombre, sin valores sensibles

Presentes los 30 nombres requeridos:

`NODE_ENV`, `DATABASE_URL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `NODE_EXTRA_CA_CERTS`, `CORS_ORIGIN`, `API_PUBLIC_URL`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES_SECONDS`, `REFRESH_TOKEN_EXPIRES_DAYS`, `JSON_BODY_LIMIT`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, `CHECKOUT_RATE_LIMIT_MAX`, `WEBHOOK_RATE_LIMIT_MAX`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `DEFAULT_CURRENCY`, `MAX_ORDER_ITEMS`, `MAX_ITEM_QUANTITY`, `INVENTORY_RESERVATION_MINUTES`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PRODUCT_IMAGES_BUCKET`, `PRODUCT_IMAGE_MAX_BYTES`, `PRODUCT_IMAGE_MAX_COUNT`, `CHECKOUT_ENABLED`.

Única comprobación de valor expresamente requerida: **CHECKOUT_ENABLED=false**, confirmada en su fila productiva y vuelta a ocultar. No se imprimieron otros valores ni se inspeccionaron tokens para clasificarlos por prefijo. Mercado Pago no fue activado ni modificado; su estado no-LIVE se conserva según el contexto autorizado, no se reautenticó contra Mercado Pago durante esta tarea.

`SUPABASE_PRODUCT_MEDIA_BUCKET` no está definido en Render producción; `env.ts` usa el default `product-media`. El backend no crea ni requiere que exista el bucket al arrancar. Sin WebsiteContent/PUBLISHED y sin medios editoriales, este release no necesita crearlo. No existe `product-media` productivo y no se creó.

La presencia de las variables TLS no sustituye verificar su valor en una futura liberación. Las conexiones de lectura y el backup de esta certificación sí utilizaron CA oficial y validación estricta/verify-full. No se redujo la validación del servidor ni de los clientes.

## Persistencia intacta

Producción continúa con 98 Product (95 activos y 3 inactivos), seis migraciones terminadas con checksums iguales al release. ProductFamily y tablas editoriales aún ausentes. Storage product-images conserva un objeto; staging product-images conserva cero. La tarea no ejecutó DML remoto ni migraciones. Los conteos no constituyen un hash íntegro de cada fila; la garantía de no modificación se apoya también en transacciones explícitamente READ ONLY y ausencia de comandos de escritura.

P0 de permisos directos documentado en el informe de certificación. **Servicio operativo no significa entorno seguro para liberar:** no se oculta ese hallazgo detrás de `/ready=200`.
