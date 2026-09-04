# Roadmap posterior al release visible V1

RELEASE_SHA: `050f890f2704b0b6d6a57c7e76e5520525b8c835`. Documento de propuesta; no modifica runtime, datos ni activación comercial.

Post-V1; exactamente seis lotes propuestos. Ninguna función es condición para el release visible con checkout cerrado. P1 indica exigencia de seguridad/operación al habilitar esa función futura, no defecto P1 del RELEASE_SHA. P2 mejora opcional. No se identifica P0 en esta propuesta.

S: cambio acotado; M: varios componentes; L: flujo completo con seguridad/integración; XL: integración/compliance y coordinación sustancial. No son fechas ni promesas.

## Alcance y decisiones

- DB y endpoints son hipótesis de diseño para el PR, no infraestructura autorizada ni ya implementada.
- Cada lote permanece en un solo dominio; proveedor, migración y publicación requieren su propio alcance explícito.
- No usar borradores técnicos ni candidatos multimedia como aprobación de seguridad o publicación.
- Comercio, envío, facturación y pagos continúan bloqueados por decisiones de negocio; no activar checkout en estos lotes.

## Exactamente los próximos seis lotes

| Lote | Dominio y valor visible | Alcance limitado | Validación en staging | Estimación |
| --- | --- | --- | --- | --- |
| 1. Centro de publicaciones y completitud | PUBLICACIONES: El operador encuentra qué falta y dónde corregirlo. | Una vista read-only de 41 publicaciones; checklist explicable y enlaces a editores; sin acciones masivas en este lote. | 41 filas, filtros,401/403, móvil/teclado; 0 escrituras. | M |
| 2. Métricas por periodo y comparación | METRICAS_OPERATIVAS: Comparaciones honestas con fechas y base visible. | Ventanas7/30/90 y periodo anterior sobre datos existentes; definiciones de venta documentadas. | Fixtures sanitizados; base 0; cancelaciones; TZ; evitar datos ficticios como resultados reales. | M |
| 3. Portada y una campaña controlada | CONTENIDO_DE_PORTADA: Actualizar mensaje de portada con control de revisión. | Un hero y un bloque de campaña con preview/borrador/publicación explícita; sin CMS genérico. | Draft no público; cambio reversible; 13 breakpoints; motion reducido; presupuesto de assets. | L |
| 4. Base de comunicación transaccional | NOTIFICACIONES_TRANSACCIONALES: El operador ve entrega/fallo real y puede rastrear un mensaje. | Un proveedor aprobado, envío de prueba sandbox y reintento/idempotencia; una plantilla operativa. | Sólo destinatarios de prueba autorizados; duplicado, timeout, callback firmado; 0 correo productivo. | L |
| 5. Cuenta segura y recuperación | IDENTIDAD_DE_CLIENTE: Cliente puede entrar, verificar correo y recuperar acceso. | Registro/verificación, sesión y recuperación sobre identidad de Magno; requiere lote 4 y decisiones de privacidad. | Cuentas reversibles de prueba; no enumeración; tokens de un uso; ownership; logout/cleanup. | L |
| 6. Compartir publicaciones | DIFUSION_DE_PRODUCTO: Compartir producto o variante conforme decisión explícita. | Web Share con copiar enlace fallback y canonical familiar; sin proveedor ni DB nueva. | Slug histórico, canonical sin tokens, cancelación, clipboard denegado, móvil/desktop y teclado. | S |

Los lotes 4→5 tienen dependencia explícita. Los demás pueden ordenarse por capacidad tras revisar negocio. Los IDs 3, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 23, 24 quedan en backlog sin asignar un séptimo lote ni prometer fecha.

## Inventario de 24 funciones

El JSON compañero contiene por función modelo propuesto, endpoints, frontend, seguridad, dependencias, pruebas, decisiones y rama sugerida. Todo endpoint se etiqueta como propuesta, no como contrato existente.

| ID | Función / estado actual | Valor | Tamaño / prioridad | Decisión pendiente | PR sugerido |
| --- | --- | --- | --- | --- | --- |
| 1 | **Centro de publicaciones**. Productos, familias y contenido se administran por separado. | Reducir saltos entre módulos y distinguir publicación comercial de SKU. | M / P2; no bloquea V1 | Modelo de estado visible vs editorial; quién opera el panel. | `codex/post-v1-publication-center` |
| 2 | **Checklist de completitud**. No existe puntuación consolidada; este informe es documental. | Mostrar faltantes sin confundir contenido disponible con aprobado. | S / P2; no bloquea V1 | Criterios y pesos aprobados; puntuación no equivale a permiso para publicar. | `codex/post-v1-publication-checklist` |
| 3 | **Acciones masivas**. Edición individual; aplicadores especializados con gates separados. | Ahorrar operación repetitiva con revisión previa. | M / P2; no bloquea V1 | Primer conjunto exacto de acciones; límites; reversibilidad. | `codex/post-v1-publication-bulk` |
| 4 | **Métricas 7/30/90 días**. Dashboard con hoy/semana/mes y rankings. | Comparar operación en ventanas reproducibles. | M / P2; no bloquea V1 | Ventas brutas/netas, devoluciones, zona horaria y límites. | `codex/post-v1-metrics-periods` |
| 5 | **Comparación con periodo anterior**. Sin comparación configurable equivalente. | Entender variación con contexto. | S / P2; no bloquea V1 | Regla base 0, periodos parciales y definición de ventas. | `codex/post-v1-metrics-comparison` |
| 6 | **Editor de portada y campañas**. Home codificada; editorial de productos ya existe. | Actualizar mensaje comercial sin modificar cada despliegue. | L / P2; no bloquea V1 | Contenido propietario, fechas, caducidad, derechos y presupuesto de video. | `codex/post-v1-home-campaigns` |
| 7 | **Cuenta de cliente**. Auth de backend existe; UI pública de cuenta no completa. | Permitir autoservicio con identidad verificable. | L / P1; no bloquea V1 | Registro abierto o invitado; términos/privacidad; retención de cuenta. | `codex/post-v1-customer-account` |
| 8 | **Verificación de correo**. Sin flujo público de confirmación inspeccionado. | Reducir cuentas falsas y habilitar acciones sensibles. | M / P1; no bloquea V1 | Proveedor remitente, expiración y acciones que exigen verificación. | `codex/post-v1-email-verification` |
| 9 | **Recuperación de contraseña**. No hay forgot/reset en auth del release. | Recuperar acceso sin intervención manual. | M / P1; no bloquea V1 | Caducidad; política de contraseña; revocación de sesiones. | `codex/post-v1-password-recovery` |
| 10 | **Direcciones guardadas**. Dirección por pedido; no libreta de cuenta. | Reducir fricción de captura repetida. | M / P2; no bloquea V1 | Cantidad máxima, campos, reglas postal/cobertura. | `codex/post-v1-saved-addresses` |
| 11 | **Historial de pedidos**. Sólo administrativo; no historial público autenticado. | Dar visibilidad postcompra al cliente. | L / P2; no bloquea V1 | Migración/vinculación de invitados y visibilidad de facturas. | `codex/post-v1-order-history` |
| 12 | **Favoritos**. No existentes en UI pública. | Guardar interés por publicación comercial. | M / P2; no bloquea V1 | Favorito familiar o SKU; invitados; sincronización y privacidad. | `codex/post-v1-favorites` |
| 13 | **Repetir pedido**. No existe autoservicio. | Agilizar recompra sin usar precio/inventario históricos. | M / P2; no bloquea V1 | Sustituciones; productos inactivos; política de cantidades. | `codex/post-v1-reorder` |
| 14 | **Cotización de envío**. Sin cotizador certificado. | Mostrar costo/cobertura antes de pagar cuando se abra comercio. | L / P1; no bloquea V1 | Paquetería, cobertura, químicos, dimensiones, subsidio y contrato. | `codex/post-v1-shipping-quotes` |
| 15 | **Seguimiento**. Estados administrativos de pedido. | Reducir consultas sobre entrega. | M / P2; no bloquea V1 | Quién actualiza guía; proveedor; eventos y precisión SLA. | `codex/post-v1-shipment-tracking` |
| 16 | **Concierge**. Sin asistente público. | Orientar búsqueda y derivar consultas complejas. | M / P2; no bloquea V1 | Dueño técnico, canales y límite de asesoría; reglas vs IA. | `codex/post-v1-guided-help` |
| 17 | **WhatsApp**. Contacto deriva a catálogo/soporte, sin número configurado. | Facilitar contacto comercial verificable. | S / P2; no bloquea V1 | Número, horarios, responsable, consentimiento y copy. | `codex/post-v1-whatsapp` |
| 18 | **Newsletter real**. No flujo real; Albert inspeccionado sólo simula éxito. | Crear audiencia con consentimiento. | L / P2; no bloquea V1 | Proveedor, frecuencia, responsable, consentimiento y política de baja. | `codex/post-v1-newsletter` |
| 19 | **Compartir producto**. Sin control específico inspeccionado. | Facilitar compartir una publicación correcta. | S / P2; no bloquea V1 | Formato del mensaje y si compartir variante seleccionada. | `codex/post-v1-share-product` |
| 20 | **Métodos de pago adicionales**. Mercado Pago existente; checkout cerrado. | Ampliar opciones sólo con caso de negocio. | XL / P1; no bloquea V1 | Proveedor/comisiones/contrato/reembolso/conciliación y autorización comercial. | `codex/post-v1-payment-provider` |
| 21 | **Facturación**. Sin módulo fiscal certificado. | Atender solicitudes fiscales con trazabilidad. | XL / P1; no bloquea V1 | Responsable fiscal, PAC, reglas de emisión/cancelación; asesoría especializada. | `codex/post-v1-invoicing` |
| 22 | **Notificaciones transaccionales**. Sin entrega de correo certificada en este release. | Comunicar identidad/pedido con resultados reales. | L / P1; no bloquea V1 | Proveedor, remitente, plantillas, retención y límites. | `codex/post-v1-transactional-email` |
| 23 | **Analytics**. Dashboard operativo no es analítica de navegación. | Medir interés real para priorizar producto y UX. | M / P2; no bloquea V1 | Proveedor, eventos, consentimiento, atribución, retención. | `codex/post-v1-analytics` |
| 24 | **Auditoría avanzada**. Auditoría editorial/operaciones existentes; no centro global certificado. | Investigar cambios y controlar operaciones sensibles. | L / P1; no bloquea V1 | Eventos obligatorios, responsables, retención, exportación. | `codex/post-v1-audit-center` |

## Criterio común de salida

Pruebas backend/frontend proporcionales al cambio; staging con fixtures reversibles; aislamiento de roles/propiedad; estados loading/error/empty; teclado, foco, responsive y reduced motion; no secretos en logs; confirmación de que checkout sigue cerrado salvo autorización independiente. Ningún lote copia arquitectura o datos de Albert.

Compartir puede ser pequeño, pero no debe filtrar parámetros administrativos. Favoritos, historial, direcciones, envío, concierge y facturación necesitan decisiones expresas: no se implementan por aparecer en una referencia.
