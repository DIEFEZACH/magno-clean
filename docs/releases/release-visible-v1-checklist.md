# Checklist de liberación — NO_GO actual

RELEASE_SHA fijo: `050f890f2704b0b6d6a57c7e76e5520525b8c835`. Esta lista no autoriza ejecutar comandos. Una casilla vacía no equivale a evidencia aprobada.

## Resultado de esta certificación

- [x] SHA auditado fijado y documentación separada del runtime.
- [x] Artefactos productivos anteriores identificados: Pages33398ca5-6ca9-4240-a52c-390500faf08f y Renderdep-daauc8nlk1mc73ag4he0, ambosf25412ab916549edee0cf4098bca6ad4e29e62c6.
- [x] Backup nuevo verificado:260,328 bytes,TOC438,SHA-256a2addba48cfe529b028f392ce789d1d7b1a76b8cafdb9be6c20087bbdd471055; sin restauración.
- [x] Plan canónico hash686cec7028b355fcc171fad41d2881af4442c9cea68f3a13b576c957bcea0710;41 publicaciones esperadas.
- [x] Staging conserva98 Product,25 familias,79 vínculos,16 individuales,218 objetos y stock/reservas0.
- [x] No se aplicaron migraciones/APPLY/deployments productivos durante esta certificación.
- [ ] P0 grants/RLS resuelto y recertificado. **FALLA: confirmado, bloquea.**
- [ ] P1 wholesalePrice legacy corregido y sin exposición. **FALLA en SHA auditado.**
- [ ] P1 overflow legal a320 px corregido y verificado. **FALLA en SHA auditado.**
- [ ] Nuevo SHA corregido con CI,staging y certificación aprobados. **No existe autorización de release del sucesor en esta tarea.**

## Antes de la futura ventana

- [ ] Asignar responsable de release,operador de plataforma,responsable DB y QA; canal y tiempos de incidente.
- [ ] Aprobar expresamente SHA sucesor y lista exacta de operaciones; mantener este RELEASE_SHA histórico sin alterar.
- [ ] Confirmar producción congelada,auto-deploy Off y artifacts de reversa disponibles.
- [ ] Verificar presencia por nombres de variables productivas y CHECKOUT_ENABLED=false; no cambiar valores.
- [ ] Confirmar Mercado Pago LIVE desactivado; no checkout,pagos ni webhooks reales.
- [ ] Aceptar vigencia del backup y verificar archivo/hash/TOC en su ubicación privada; no restaurar.
- [ ] Revalidar base98/95/3 y seis migraciones sin fallos ni hashes divergentes.
- [ ] Aprobar manifiesto completo del sucesor incluyendo corrección de seguridad posterior a9; no autorizar7–9 como solución suficiente al P0.
- [ ] Revisar/ensayar launcher aislado del [runbook](release-visible-v1-runbook.md); sin fallback .env,CA oficial y TLS estricto.

## Secuencia de operaciones futuras, cada una con GO propio

- [ ] G3: migrar únicamente lista aprobada; verificar N/N exitosas y protección efectiva de tablas; ante fallo parar.
- [ ] G4: deploy manual backend en SHA aprobado; /health,/ready200; /api/products sin privados; /api/catalog compatible; checkout false.
- [ ] G5: DRY-RUN completo sin pre-migration:25 CREATE,79 LINK,16 individuales,0 conflictos/desconocidos/cambios protegidos/escrituras.
- [ ] G6: autorización APPLY específica; única transacción; sólo familyId/variantLabel/variantSortOrder; updatedAt esperado.
- [ ] G7: verificar98/95/3,25 familias,79 vínculos,16 individuales,41 publicaciones; DRY-RUN posterior25/79 UNCHANGED y0 escrituras.
- [ ] G8: build frontend con API/SITE productivos,SITEMAP_ENVIRONMENT=production,SITEMAP_ALLOW_STALE=false; no build:ci ni artefacto staging.
- [ ] G8: sitemap41 comerciales+categorías+6 estáticas,robots exacto,0 variantes/inactivos/duplicados/localhost/admin/carrito/checkout.
- [ ] G8: deploy manual Pages del mismo SHA; confirmar dominio y artefacto efectivos.
- [ ] G9: smoke de familias/individuales/slugs históricos/query/canonical/imágenes/responsive y checkout cerrado.

## Cierre obligatorio

- [ ] CHECKOUT_ENABLED=false productivo observado en proveedor y endpoint. Staging observado true con stock0 no es evidencia de producción.
- [ ] WebsiteContent publicado0 y WebsiteContentMedia0; no publicación editorial o asociaciones accidentales.
- [ ] Sin modificaciones de stock,reservas,órdenes,pagos,Storage,DNS,MX/SPF/DKIM/DMARC/SRV.
- [ ] Sin seeds/importadores/media:sync/staging:catalog:apply/backups de retención ejecutados automáticamente.
- [ ] User/RefreshToken temporales de QA retirados si se hubieran autorizado; no borrar baseline.
- [ ] Salud final200/200; triggers editoriales habilitados; permisos de seguridad final correctos.
- [ ] Evidencia sanitizada,commit/deploy IDs,timestamps,responsables y decisión final registrados.
- [ ] Si falla un gate,detener y usar [rollback operativo](release-visible-v1-rollback.md),no SQL destructivo.

Ningún P2 visual opcional se incorpora al SHA auditado por esta lista. Ningún PR correctivo se fusiona como parte de esta documentación.
