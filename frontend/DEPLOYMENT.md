# Despliegue del frontend

Configura `VITE_API_URL` con la URL HTTPS pública de la API y `VITE_SITE_URL` con el origen público de la tienda, sin slash final.

`npm run build` consulta `GET /api/products` y regenera `public/sitemap.xml` y `public/robots.txt`. La API debe ser accesible durante el build. Ejecuta nuevamente el build después de importar, activar, desactivar o cambiar slugs de productos.

## Fallback de SPA

El hosting debe responder con `index.html` para toda ruta que no corresponda a un archivo físico. Esto permite refrescar directamente `/producto/:slug`, `/contacto` y rutas administrativas. Conserva los archivos reales como `/sitemap.xml`, `/robots.txt` y assets sin reescribirlos.

Ejemplos equivalentes según el proveedor:

- Nginx: `try_files $uri $uri/ /index.html;`
- Apache: reescribir rutas inexistentes hacia `/index.html`.
- Plataformas estáticas: configurar una rewrite global `/* -> /index.html` con estado 200.
