# Post-V1 — Pulido visual aislado de P2

Base inmutable: `050f890f2704b0b6d6a57c7e76e5520525b8c835`.
Rama: `codex/post-v1-visual-polish`.
Fecha: 2026-09-04 UTC.

## Alcance y limitación

Sólo se auditaron los tres P2 indicados para el lote post-V1. La administración se renderizó con **fixtures locales de auth y API**, no con una sesión autenticada de staging. No hubo usuarios reales, credenciales, solicitudes a DB, cambios de CORS ni operaciones administrativas persistidas. El bloqueo de seguridad del QA admin live permanece documentado en la certificación principal; estas pruebas no lo sustituyen.

## Resultado por P2

| P2 | Antes | Cambio aislado | Después |
| --- | --- | --- | --- |
| Filtros de Pedidos | Estado 43 px; fechas/montos 42 px | `min-h-11` en esos cinco controles | Todos >=44 px |
| Paginación | Pedidos y Productos: botones de 40 px | `min-h-11` en botones | Todos >=44 px |
| Acción “Ver” de Pedidos | Target 29.45×19 px; fuera del área visible de la tabla a 768, 820, 1024, 1280 y 1366 px | Última columna sticky derecha; target >=44 px; nombre accesible del pedido | Visible sin scroll horizontal inicial y después de desplazar la tabla; target 45.45×44 px |
| Letra aislada en título artificial a 768 px | No reproducida exactamente con el título largo de la fixture E2E existente | **Sin cambio de tipografía ni ProductDetail** | Sigue documentado como no reproducido |

Se conservaron las cards móviles de Pedidos, las columnas/datos, la navegación y el scroll interno de la tabla. La columna de acciones fija no elimina la necesidad de desplazamiento horizontal para otras columnas, pero mantiene la acción accesible. La cabecera ahora identifica la columna como “Acciones”.

El título artificial revisado fue “Familia Demo con un nombre deliberadamente largo para validar el ajuste responsive”. A 768 px divide “deliberadamente” entre `deliberadame` y `nte largo para`, sin una línea compuesta por una única letra ni overflow documental. No se amplió el alcance para rediseñar el título. Los filtros del catálogo público y de contenido ya medían al menos 44 px y quedaron intactos.

## Verificación

Anchos reales de viewport: **320, 360, 375, 390, 430, 600, 768, 820, 1024, 1280, 1366, 1440 y 1920 px**. Se midieron cinco rutas de fixture antes/después, 65 combinaciones en cada pasada, sin overflow documental.

- Pruebas frontend: **23/23 unitarias + 60/60 scripts/sitemap**, cero fallidas u omitidas.
- E2E existentes y nuevas: **35/35**, incluyendo 27 regresiones nuevas; 30.36 s de proceso.
- Lint: PASS, 2.69 s. TypeScript: PASS, 2.24 s.
- Build: PASS, 2.67 s, con URLs explícitas de staging y una respuesta de catálogo público previamente capturada. **Build aislado, sin llamadas live ni despliegue**.
- El sitemap de la fixture se generó normalmente: 25 familias + 16 individuales + 1 categoría + 6 estáticas = 48 URLs. Sin stale.
- Los archivos `public/sitemap.xml` y `public/robots.txt` regenerados por prebuild fueron restaurados a sus bytes originales; no forman parte del diff.
- La advertencia de Vite sobre `outDir` fuera del proyecto es deliberada para guardar el artefacto ignorado. Sin warnings de lint/TypeScript.

La primera ejecución de la nueva regresión encontró la paginación de 40 px; una consulta de test demasiado estricta al label de Estado fue corregida en el test. El barrido DOM previo ya había medido el control de 43 px. La suite final completa pasa; no se modificó un label de negocio para satisfacer el test.

Capturas revisadas visualmente: Pedidos a 768 px y Productos a 320 px antes/después; ProductDetail artificial a 768 px. Se guardaron también representativas a 1024 y 1440 px, todas privadas bajo `.local/reports/post-v1-visual-polish/screenshots/`. Medidas detalladas, logs y artefactos permanecen en ese directorio ignorado.

## Exclusiones y entrega

No se tocó backend, schema, migraciones, dependencias, checkout, stock, contenido, medios, producción ni RELEASE_SHA. No hay cambios de runtime en la rama documental de certificación. Este lote se propone como PR separado, **sin merge y fuera del release certificado**. La creación del PR y revisión final quedan a cargo de la coordinación.
