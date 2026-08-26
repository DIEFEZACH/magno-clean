# Checklist de producción

## Bloqueadores actuales

- [ ] Elegir/crear proveedor y conectar repositorio Git remoto.
- [ ] Comprar/configurar dominio y DNS/HTTPS.
- [ ] Configurar secretos en staging y producción.
- [ ] Confirmar plan, backups y pooler de Supabase.
- [ ] Cargar inventario real; no habilitar ventas con stock cero.
- [ ] Sustituir contraseña admin de prueba y verificar 401/403.
- [ ] Programar y observar el cron de reservas.
- [ ] Validar staging completo con Mercado Pago TEST.
- [ ] Revisar textos legales; mantener noindex mientras sean provisionales.

## Release

- [ ] CI verde; audits revisados; seis migraciones presentes y `migrate deploy` exitoso.
- [ ] CORS sólo HTTPS real; cookies HttpOnly/Secure/SameSite; sin localhost ni mixed content.
- [ ] `/health` y `/ready` responden; logs tienen requestId y no secretos.
- [ ] SPA fallback funciona y `/api/*` nunca sirve `index.html`.
- [ ] Sitemap fresco contiene el catálogo activo; robots y canonical usan dominio real.
- [ ] Storage, catálogo, imágenes, carrito, checkout TEST, webhook, inventario y cron validados.
- [ ] Smoke: `/`, `/productos`, producto, 404, admin products/orders/inventory, sitemap y robots.
- [ ] Rollback ensayado y restauración de backup verificada.
- [ ] Credenciales y cobros productivos siguen desactivados hasta autorización explícita.
