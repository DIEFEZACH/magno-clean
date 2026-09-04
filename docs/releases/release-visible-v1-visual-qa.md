# QA visual y accesibilidad — candidato congelado

RELEASE_SHA: `050f890f2704b0b6d6a57c7e76e5520525b8c835`. Fecha: 2026-09-04 UTC. Esta evidencia no certifica ninguna corrección posterior como parte del candidato.

## Navegador real, no tamaños simulados por CSS

Chromium headless local abrió el frontend HTTPS real de staging. Se aplicó `setViewportSize` y se midió `innerWidth` en cada ancho: **320, 360, 375, 390, 430, 600, 768, 820, 1024, 1280, 1366, 1440, 1920**. No se sustituyeron las respuestas públicas de staging. Se bloquearon métodos distintos de GET/HEAD/OPTIONS; no hubo login, checkout, cambios de stock ni publicaciones.

**247 mediciones = 19 rutas × 13 anchos.** Hubo 19 navegaciones directas y una recarga por ruta (19), todas HTTP 200; no 247 recargas. Las rutas fueron `/`, `/productos`, `/categorias`, `/producto/citrical`, `/producto/chazam`, `/producto/orange-liquid`, `/producto/multifibras`, `/producto/apc-tnt`, `/producto/neutro-car-20-lts`, `/carrito`, `/checkout`, `/nosotros`, `/contacto`, `/soporte`, `/privacidad`, `/terminos`, `/devoluciones`, `/ruta-inexistente`, `/admin/login`. Sitemap y robots se verificaron como recursos, no como pantallas responsive.

- 246 combinaciones sin overflow. **P1: `/devoluciones` a 320 px mide scrollWidth=338** por el título de 48 px. No se oculta este fallo dentro de un resultado global verde.
- Ningún control fuera del viewport en el barrido; cero imágenes rotas, errores de página/consola, warnings de consola o fallos HTTP/red inesperados en esas navegaciones.
- No headings vacíos en los estados renderizados. Un H1 claro por página y estructura H2 inspeccionada.
- El enlace de salto recibe foco visible (outline de 3 px); `reduced-motion` activo y medido en los 13 anchos. La auditoría no equivale a certificación WCAG completa ni a pruebas con lector de pantalla real.
- Menú móvil probado a 320/375/430/600/768/820: apertura, ciclo de Tab y Shift+Tab, Escape, bloqueo/restauración de scroll y retorno del foco aprobados.
- Navegación Home → Productos comprobada en el mismo documento, sin reload.
- `/ruta-inexistente` muestra la pantalla 404, pero devuelve HTTP 200 por fallback SPA: **soft-404**, pendiente SEO conocido; no se presenta como 404 HTTP.
- Se guardaron 42 capturas privadas de Home, catálogo, detalle, carrito, checkout y login. No están incluidas en Git.
- Muestra adicional de cambios de layout durante carga: Home, Productos y CITRICAL a 320/768/1440, nueve mediciones con PerformanceObserver. Suma máxima observada 0.06631 (CITRICAL 320); Home 0. Es una muestra de laboratorio, no p75 de usuarios ni garantía de cero CLS.

## ProductDetail real

Se verificaron **18 variantes por query**, cinco queries inválidas y cinco slugs históricos representativos: CITRICAL PLCT1/2/3; CHAZAM PLCZ1/2/3; ORANGE LIQUID PLOL1/PLOLG/PLOL5/PLOL20; MULTIFIBRAS EMLF1/EMLFG/EMLF5/EMLF20; APC TNT APC1/APCG/APC5/APC20.

18/18 seleccionan el código esperado y mantienen canonical familiar sin query. 5/5 slugs históricos seleccionan su Product y canonical familiar; 5/5 queries inválidas vuelven a la primera variante en orden. Cero errores de consola y cero overflow en esas comprobaciones a 768 px. Labels, precios, oldPrice e imágenes responden al Product seleccionado; fieldset/legend, aria-pressed y anuncio discreto están presentes.

**Todos los stocks de staging son cero.** Los chips agotados están deshabilitados: no se forzaron clics ni disponibilidad. La interacción por teclado/cambio de variante disponible sin recarga se cubrió con los E2E locales existentes, no con inventario real. La API validó además los 18 slugs históricos y un producto individual real; la matriz de readiness distingue seis detalles visualmente recorridos de los otros 35 revisados por contrato/componente.

La galería física conserva prioridad y proporción estable; imágenes con alt y dimensiones explícitas, miniaturas/galería múltiple cubiertas por fixtures locales porque ProductImage staging=0. Relacionados no repiten SKU hermanos. El carrito conserva Product.id, nunca el id familiar.

Staging conserva su configuración TEST existente **checkoutEnabled=true**, sin alterarla. En vivo se validaron agotado, carrito vacío y checkout vacío. El cierre false, error/timeout y estados de compra se verificaron aisladamente con mocks locales; no se afirma que staging esté configurado false. Producción permanece false.

Un primer intento automatizado de esperar el selector agotó su timeout; un diagnóstico nuevo obtuvo API 200 y selector correcto, y el recorrido completo posterior pasó. No se cambió la aplicación para ello.

## Admin: límite explícito de cobertura

**QA autenticado de staging OMITIDO POR SEGURIDAD.** La inspección de metadatos encontró `User` y `RefreshToken` con RLS deshabilitado y privilegios de clientes directos. No se creó el administrador temporal, no se usaron sus credenciales, no se creó sesión ni token. User=0 y RefreshToken=0 permanecen intactos.

Las pruebas locales de UI/contratos y la corrección P2 usan datos ficticios interceptados, no una sesión real de staging. No sustituyen la validación de login/restauración/logout, permisos y pantallas administrativas contra Supabase. Debe repetirse tras la remediación de seguridad autorizada. No se abrió CORS temporal ni wildcard.

## Hallazgos aislados, no incorporados al release

- P1 legal móvil: PR [#16](https://github.com/DIEFEZACH/magno-clean/pull/16). Reduce el H1 sólo en móvil y permite romper palabras. Regresión aislada y repetición en su Preview real `3f0e1448`: tres rutas legales × 13 anchos, 39 mediciones aprobadas en cada ejecución, sin `overflow-x-hidden`. Esta corrección no está en staging estable ni en RELEASE_SHA.
- P2: filtros/paginaciones 40–43 px y acción Ver de Pedidos con scroll interno. Se investigan únicamente en `codex/post-v1-visual-polish`; no modifican este candidato.
- P2 conocido: una letra aislada con título artificial a 768 px. No generalizar de un fixture a nombres reales; registrar reproducción o no reproducción en el PR separado.
- Algunos enlaces inline/breadcrumbs son menores de 44 px y el logo móvil mide 40 px; requieren revisión de contexto/espaciado, no todos se clasifican automáticamente como fallo WCAG.
- Precios anterior y actual iguales pueden producir un tachado sin descuento real: observación de presentación, no autorización para modificar precios.
- Safari móvil sólo revisado conceptualmente por estilos; no se ejecutó Safari/iOS físico. No se afirma validación de touch hardware ni lector de pantalla.

Evidencias locales ignoradas: `.local/reports/release-visible-v1/public-qa.json`, `variant-qa.json`, `layout-shift-sample.json`, `screenshots/`. Las capturas son privadas; no contienen sesiones ni datos personales.
