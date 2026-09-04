# Despliegue del frontend

Configura `VITE_API_URL` con la URL HTTPS pública de la API y `VITE_SITE_URL` con el origen público de la tienda, sin slash final.

`npm run build` consulta todas las páginas de `GET /api/catalog` y regenera `public/sitemap.xml` y `public/robots.txt`. La API debe ser accesible durante el build. Ejecuta nuevamente el build después de importar, activar, desactivar, agrupar o cambiar slugs de productos.

## Disponibilidad y escritura segura del sitemap

- Presupuesto total: **90 segundos para todo el catálogo**, incluyendo lectura de cuerpos y esperas. Máximo **4 intentos por página**, **20 segundos por intento**, con backoff de **2, 4 y 8 segundos**. Esto permite recuperarse de un despertar lento de Render sin esperar indefinidamente.
- Sólo se reintentan timeout, desconexión, HTTP 429 y 5xx. `Retry-After` (segundos o fecha HTTP) se respeta: si no cabe en el presupuesto, el build falla sin adelantar la solicitud. 4xx restantes, JSON inválido, errores de contrato, duplicados o paginación inconsistente fallan sin retry.
- No se escribe ningún resultado parcial si falla una página. Tras validar el catálogo completo, ambos archivos se preparan en temporales únicos junto al destino y cada archivo se reemplaza mediante rename atómico. No es una transacción atómica entre los dos archivos: cualquier fallo de disco aborta el build, que no debe publicarse.
- Los logs sólo incluyen página, intento, clase de fallo y espera; nunca cuerpos ni excepciones originales del servidor.
- Fallback desactivado por defecto. `SITEMAP_ALLOW_STALE=true` sólo permite conservar un sitemap y robots existentes válidos del **mismo origen exacto** cuando se agotan los reintentos por indisponibilidad. Nunca oculta errores de datos ni permite localhost, otro entorno o URLs de variantes.
- Para exigir datos frescos en producción, usar `SITEMAP_ENVIRONMENT=production` y `SITEMAP_ALLOW_STALE=false`: el modo producción rechaza explícitamente activar stale. Una API disponible siempre regenera el sitemap.

Esta resiliencia sólo corrige disponibilidad HTTP durante prebuild. **No corrige clonación atascada en Cloudflare.** Es un cambio separado del candidato congelado `2698a487df686ffebcdcfb6c55b3ca2fc5baaccf`; no debe etiquetarse ni desplegarse como si fuera ese artefacto. `npm test` usa red/reloj simulados y `npm run build:ci` un catálogo local determinista, nunca datos para un release real.

## Fallback de SPA

El hosting debe responder con `index.html` para toda ruta que no corresponda a un archivo físico. Esto permite refrescar directamente `/producto/:slug`, `/contacto` y rutas administrativas. Conserva los archivos reales como `/sitemap.xml`, `/robots.txt` y assets sin reescribirlos.

Ejemplos equivalentes según el proveedor:

- Nginx: `try_files $uri $uri/ /index.html;`
- Apache: reescribir rutas inexistentes hacia `/index.html`.
- Plataformas estáticas: configurar una rewrite global `/* -> /index.html` con estado 200.
