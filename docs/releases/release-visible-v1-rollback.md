# Rollback operativo — release visible V1

RELEASE_SHA auditado: `050f890f2704b0b6d6a57c7e76e5520525b8c835`. **NO_GO actual: no hay release productivo nuevo que revertir.** Los pasos siguientes sólo preparan una reversa futura autorizada del sucesor recertificado. No se ejecutaron.

## Artefactos de retorno verificados

| Servicio | Deployment anterior | Commit |
| --- | --- | --- |
| Cloudflare Pages producción, magno-clean | 33398ca5-6ca9-4240-a52c-390500faf08f | f25412ab916549edee0cf4098bca6ad4e29e62c6 |
| Render producción, magno-clean-api | dep-daauc8nlk1mc73ag4he0 | f25412ab916549edee0cf4098bca6ad4e29e62c6 |

Confirmar de nuevo la identidad del proveedor y que el artefacto sigue disponible antes de una futura ventana. No reconstruir “latest”, no usar auto-deploy y no sustituir IDs por aproximación. Si el proveedor no permite seleccionar inequívocamente el artefacto, detener y escalar al responsable de plataforma.

## Señales y tiempo de decisión propuesto

- Salud/ready no recuperan HTTP200, errores500 sostenidos o frontend incompatible con API.
- Catálogo distinto de25 familias/16 individuales/79 variantes/41 publicaciones, conflictos del plan o slugs inaccesibles.
- Sitemap de origen incorrecto, variante duplicada, checkout productivo activo o exposición de datos privados.
- Cambio no previsto de inventario, órdenes, pagos, contenido o Storage: detener inmediatamente y preservar evidencia.

Propuesta operativa a aceptar antes de la ventana: congelar avance al primer fallo crítico; diagnóstico inicial máximo5 minutos; decidir rollback de artefactos dentro de10 minutos si no hay corrección segura autorizada. Son umbrales de gestión, no tiempos medidos del proveedor. No esperar un plazo si hay riesgo de datos.

Roles sin personas inventadas: responsable de release decide GO/rollback; operador Pages/Render ejecuta únicamente su artefacto autorizado; responsable DB evalúa schema/consistencia; QA registra evidencia y valida salida. Antes de abrir ventana deben asignarse nombres y canal de incidentes.

## Orden de reversa

1. Detener cualquier paso pendiente; mantener CHECKOUT_ENABLED=false y auto-deploy apagado. No cambiar variables para ocultar el fallo.
2. Si el frontend nuevo fue publicado, en Pages producción restaurar primero deployment `33398ca5-6ca9-4240-a52c-390500faf08f`. Verificar el SHA efectivo y las rutas públicas. Así no queda frontend nuevo dependiendo de backend antiguo sin catálogo.
3. Si el backend nuevo fue publicado y requiere reversa, en Render producción restaurar deployment `dep-daauc8nlk1mc73ag4he0`. Verificar SHA,/health,/ready,/api/products y gate de checkout.
4. Si el frontend nunca cambió, no tocar Pages: revertir sólo el backend que cambió. Si ningún artefacto cambió, no ejecutar rollback por reflejo.
5. Conservar schema aditivo, Product, familias ya confirmadas y todo contenido editorial persistente. El frontend anterior puede seguir consumiendo /api/products; no requiere eliminar ProductFamily.
6. Ejecutar smoke de compatibilidad legacy, revisar conteos/inventario y cerrar la reversa sólo con evidencia.

**Advertencia de seguridad:** volver a los artefactos anteriores no corrige el P0 preexistente de grants/RLS ni necesariamente el P1 legacy de campos privados. Una reversa visual no es una remediación de seguridad. Mantener NO_GO y escalar la mitigación específica mediante autorización separada; no ocultar esa limitación.

## Familias: antes y después del commit

Antes del commit de APPLY, el aplicador usa una transacción Serializable y revierte completamente ante conflicto. No reintentar automáticamente: volver a leer/conciliar primero.

Después de commit, **no existe en el release una herramienta aprobada de desagrupación/reversa**. No inventar un comando ni usar DELETE de familias como atajo. Si fuese imprescindible deshacer agrupación, requiere diseño, revisión, pruebas y autorización independientes:

- Identificar exactamente las familias creadas por el plan aprobado y los79 Product originales; no actuar por prefijo o nombre parecido.
- Transacción atómica, preview y protección de campos. Cambiar exclusivamente familyId,variantLabel,variantSortOrder; updatedAt automático debe documentarse.
- Nunca borrar Product ni modificar precio,nombre,código,slug,imágenes,stock,reservas,órdenes,pagos o fuentes editoriales.
- Sólo podría considerarse eliminar una familia creada por esa operación si está vacía y no tiene contenido/dependencias que se perderían por cascade; no eliminar familias preexistentes ni WebsiteContent que exista posteriormente.
- Conciliar antes/después y demostrar rollback ante conflicto. Hasta que exista esa herramienta revisada, esta acción permanece BLOCKED.

## Schema y backup

No ejecutar rollback.sql como primera respuesta; los archivos de reversa pueden quitar tablas/columnas o historial. No db push,migrate dev,migrate reset,restauración ni manipulación del historial para forzar estado exitoso. Una migración interrumpida puede haber dejado parte del schema: inspección READ ONLY antes de decidir cualquier reparación.

Backup disponible: `magno-clean-production-20260904T094814587Z.dump`,260,328 bytes,SHA-256 `a2addba48cfe529b028f392ce789d1d7b1a76b8cafdb9be6c20087bbdd471055`,TOC438. No se ensayó restauración. No contiene los binarios de Storage ni roles globales; no es respaldo integral de Supabase. No crear otro backup ni borrar anteriores durante esta documentación.

Restaurar sólo ante corrupción real, después de evaluación de pérdida de datos posteriores, destino/ventana revisados y autorización expresa. No restaurar sobre staging baseline para “probar”.

## Evidencia de cierre

Registrar timestamps UTC, responsables, deployments/SHA antes/después,HTTP de salud,contrato legacy,conteos98/95/3,estado de agrupación realmente conservado,stock/reservas sin cambio y CHECKOUT_ENABLED=false. Registrar los fallos sin payloads,URLs privadas,tokens ni contraseñas. Conservar dump y evidencia local sin publicarlos. Requerir una nueva decisión de release: un rollback no convierte al SHA auditado en GO.
