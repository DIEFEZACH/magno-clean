# RELEASE VISIBLE V1 — NO_GO

Candidato inmutable: `050f890f2704b0b6d6a57c7e76e5520525b8c835`.
Producción anterior, verificada en ambos proveedores: `f25412ab916549edee0cf4098bca6ad4e29e62c6`.

**No liberar este SHA.** La CI y el catálogo pasan, pero un P0 confirmado impide convertir esta certificación en autorización productiva. Abrir PR de corrección no remedia los entornos existentes. Las correcciones no pertenecen al candidato congelado y requieren revisión, integración y una nueva certificación independiente.

| Prioridad | Hallazgo confirmado | Evidencia / acción separada |
| --- | --- | --- |
| P0 | RLS deshabilitado y privilegios directos anon/authenticated en tablas de aplicación; incluye User/RefreshToken y tablas comerciales en producción, además de editoriales en staging | Metadatos READ ONLY; PR [#17](https://github.com/DIEFEZACH/magno-clean/pull/17), propuesta no aplicada. Confirmar superficie Data API y plan de contención antes de cualquier migración |
| P1 | GET público legacy `/api/products` selecciona/exhibe wholesalePrice | 98/98 respuestas staging contienen la clave; sin registrar valores; PR [#15](https://github.com/DIEFEZACH/magno-clean/pull/15) |
| P1 | `/devoluciones` desborda a 320 px: scrollWidth 338 | Corrección aislada y regresión 39 mediciones; PR [#16](https://github.com/DIEFEZACH/magno-clean/pull/16) |

La posibilidad de explotar el P0 mediante HTTP anónimo **no fue probada** y los schemas expuestos de PostgREST requieren confirmación. Los permisos/RLS de DB sí fueron comprobados; no es una inferencia a partir del código. La auditoría no inspeccionó ni registró valores de contraseñas/tokens y no realizó escrituras de prueba. El backup privado autorizado sí contiene datos de las tablas; no se extrajeron a los reportes. Las guías de [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security) explican por qué el guard Express no protege un acceso directo a tablas expuestas.

## P2 y restricciones de cobertura

- Filtros/paginación 40–43 px y acción Ver de Pedidos: [PR18](https://github.com/DIEFEZACH/magno-clean/pull/18), rama aislada `codex/post-v1-visual-polish`, fuera de este release.
- Letra aislada de título artificial a 768 px: conservar registro y distinguir evidencia histórica de reproducción actual; no afirmar corrección sin reproducción.
- Listado editorial N+1, validación inline de URLs y lifecycle del historial PUBLISHED continúan fuera de alcance. No se debilitó DELETE/UPDATE de PUBLISHED.
- SEO soft-404 SPA, placeholders legales, imágenes compartidas y oldPrice igual al precio actual requieren revisión posterior; no se inventa contenido ni descuentos.
- QA Admin real omitido por seguridad, sin seed ni sesión; tests locales no lo sustituyen.
- Staging checkout true preexistente, stock cero. Cierre false y fallo cerrado probados localmente; producción false confirmado. Nada fue habilitado.
- Safari/iOS físico, lector de pantalla y comportamiento de conexiones reales tras hardening quedan pendientes.

## Condiciones objetivas que sí pasan

- Main/CI y ambos deployments estables de staging en el SHA fijado.
- 309 pruebas existentes + 22 comprobaciones aisladas pasan; build normal staging y simulación productiva aislada pasan.
- Staging: 98 productos, 95 activos, 3 inactivos; 25 familias, 79 vínculos, 16 individuales, 41 publicaciones. Stock/reservas cero.
- DRY-RUN staging 25/79 UNCHANGED, producción 25 CREATE/79 LINK previstos, cero conflictos y cero escrituras.
- Sitemap fresco staging: 48 URLs calculadas, 41 comerciales, 79 slugs agrupados y 3 inactivos excluidos; sin duplicados/localhost/variant query.
- Nuevo backup privado custom, SHA-256 y TOC válidos; no restaurado.
- Producción mantiene seis migraciones y deployments anteriores; checkout false; sin cambios de datos/Storage/DNS/configuración.

## Qué impide autorizar mañana directamente

No basta aprobar el antiguo orden «7–9 → deploy SHA → APPLY». Hace falta revisar/remediar el acceso directo de DB, definir contención del intervalo entre migraciones, integrar sólo las correcciones aprobadas en **otro SHA**, validar staging con roles reales y repetir los gates de seguridad/backup/CI/QA. El runbook adjunto está deliberadamente bloqueado para el candidato actual. No se ejecutó ninguna parte mutante del release.
