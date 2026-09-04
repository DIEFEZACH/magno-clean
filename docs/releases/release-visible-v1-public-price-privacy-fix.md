# P1 — Precio mayorista fuera del contrato público legacy

Base: `050f890f2704b0b6d6a57c7e76e5520525b8c835`.
Rama aislada: `codex/release-visible-v1-public-price-privacy`.
Fecha de validación: 2026-09-04 UTC.

## Hallazgo y alcance

La certificación encontró `wholesalePrice` en la respuesta pública, sin autenticación, de `GET /api/products`. En staging la clave estaba presente en 98/98 productos. La evidencia conserva sólo la presencia del campo, no valores privados. Es un comportamiento legacy preexistente al RELEASE_VISIBLE_V1; el contrato nuevo `/api/catalog` ya lo excluye.

El cambio retira exclusivamente `wholesalePrice` de la selección Prisma del GET público. No modifica el modelo de datos, precios persistidos, cálculos, inventario, checkout, carrito ni rutas administrativas. No existe otro GET público de detalle en ese archivo.

Se conservan exactamente los demás campos y la envoltura `{ products: [...] }`, orden por creación, imágenes y cálculo `availableStock = max(0, stock - reservedStock)`. Las operaciones administrativas de creación y actualización siguen admitiendo `wholesalePrice` para uso interno autorizado.

## Compatibilidad

Los consumidores externos que dependan del campo retirado deberán adaptarse: la eliminación de un campo es una restricción intencional del contrato público por privacidad. No se ha inventariado a consumidores externos ni se afirma que no existan.

El frontend versionado no lee `wholesalePrice`. El hook legacy `useProducts.ts` aún lo declara en un tipo, pero no tiene consumidores/importaciones y no se cambió para mantener el alcance mínimo. El catálogo visible utiliza `/api/catalog`; el administrador lista mediante `/api/admin/products`. Carrito y checkout utilizan el precio comercial `price`, que permanece intacto.

## Regresión y validación aislada

Tres pruebas HTTP usan el router real y un delegado Prisma reemplazado temporalmente por fixtures locales. Nunca contactan una base de datos:

1. Ausencia de `wholesalePrice`, `costPrice`, `familyId`, hash y auditoría en la selección/respuesta; stock y reservas no públicos; compatibilidad exacta del resto de la respuesta y selección de imágenes.
2. Disponibilidad acotada a cero cuando las reservas superan el stock.
3. Respuesta vacía compatible.

Antes del cambio, dos pruebas fallaron específicamente por la selección/exposición de `wholesalePrice`; la respuesta vacía ya pasaba. Después del cambio:

- Backend build: PASS, 2.30 s.
- Backend completo: **221/221 pruebas**, 0 fallidas, 0 omitidas; 299.973 ms de runner.
- Frontend: **23/23 unitarias + 60/60 scripts/sitemap**; PASS.
- Frontend TypeScript y lint: PASS.
- `git diff --check`: PASS.

El entorno local usó exclusivamente datos ficticios, `DOTENV_CONFIG_PATH=/dev/null` y una dirección loopback de DB sin servicio. Se reutilizaron las dependencias ya verificadas de la certificación mediante enlaces ignorados, sin reinstalar, generar clientes ni cambiar paquetes. La evidencia de rojo/verde está ignorada bajo `.local/reports/price-privacy/`.

No se ejecutaron consultas remotas nuevas para esta corrección, escrituras de DB, migraciones, seeds, APPLY, cambios de variables, despliegues ni pagos. El SHA de release permanece fijo y esta rama no queda incluida en él. La revisión y el PR separado deben completarse antes de decidir cualquier liberación; no se autoriza merge ni deployment aquí.
