# P1 — Precios internos fuera del contrato público legacy

Base: `050f890f2704b0b6d6a57c7e76e5520525b8c835`.
Rama aislada: `codex/release-visible-v1-public-price-privacy`.
Fecha de validación: 2026-09-04 UTC.

## Hallazgo y alcance

La certificación encontró `wholesalePrice` en la respuesta pública, sin autenticación, de `GET /api/products`. En staging la clave estaba presente en 98/98 productos. La evidencia conserva sólo la presencia del campo, no valores privados. La revisión posterior del contrato confirmó que `unitPrice` también seguía seleccionado pese a estar documentado como precio interno. Son comportamientos legacy preexistentes al RELEASE_VISIBLE_V1; el contrato nuevo `/api/catalog` ya excluye ambos campos.

El cambio retira `unitPrice` y `wholesalePrice` de la selección Prisma del GET público y sustituye la propagación del objeto consultado por un serializador público campo por campo. No modifica el modelo de datos, precios persistidos, cálculos, inventario, checkout, carrito ni rutas administrativas. No existe otro GET público de detalle en ese archivo.

Se conservan exactamente la envoltura `{ products: [...] }`, el orden por creación, las imágenes y el cálculo `availableStock = max(0, stock - reservedStock)`. El contrato de cada producto queda limitado a `id`, `slug`, `code`, `brand`, `name`, `category`, `description`, `imageUrl`, `retailPrice`, `digitalPrice`, `price`, `oldPrice`, `badge`, `featured`, `active`, `createdAt`, `updatedAt`, `images` y `availableStock`; cada imagen contiene sólo `id`, `url`, `alt` y `position`. Las operaciones administrativas de creación y actualización siguen admitiendo `costPrice`, `unitPrice` y `wholesalePrice` para uso interno autorizado.

## Compatibilidad

Los consumidores externos que dependan de los campos retirados deberán adaptarse: la eliminación es una restricción intencional del contrato público por privacidad. No se ha inventariado a consumidores externos ni se afirma que no existan.

El frontend versionado no lee `unitPrice` ni `wholesalePrice` desde Product. El hook legacy `useProducts.ts` no tiene consumidores/importaciones y su tipo se alinea con la respuesta corregida. El `unitPrice` de los renglones históricos de pedidos es otro contrato y permanece intacto. El catálogo visible utiliza `/api/catalog`; el administrador lista mediante `/api/admin/products`. Carrito y checkout utilizan el precio comercial `price`, que permanece intacto.

## Regresión y validación aislada

Cuatro pruebas HTTP usan el router real y un delegado Prisma reemplazado temporalmente por fixtures locales. Nunca contactan una base de datos:

1. Ausencia de `unitPrice`, `wholesalePrice`, `costPrice`, campos internos de familia, hash y auditoría en la selección/respuesta; stock y reservas no públicos; allowlist exacta de consulta y respuesta, incluida la selección de imágenes.
2. Disponibilidad acotada a cero cuando las reservas superan el stock.
3. Respuesta vacía compatible.
4. Creación administrativa autenticada conserva `costPrice`, `unitPrice` y `wholesalePrice` en la escritura interna.

La regresión original probó rojo/verde para `wholesalePrice`; la ampliación del contrato cubre también `unitPrice`, el serializador explícito y la preservación administrativa. Después del cambio:

- Prisma Client 7.10.0: generate PASS; schema validate PASS.
- Backend build: PASS, 2.01 s.
- Backend completo: **222/222 pruebas**, 0 fallidas, 0 omitidas; 332.865 ms de runner.
- Frontend: **23/23 unitarias + 60/60 scripts/sitemap**; PASS, 2.17 s total.
- Frontend TypeScript/Vite: PASS, 2.89 s; lint: PASS, 3.10 s.
- `git diff --check`: PASS.

El entorno local usó exclusivamente datos ficticios, `DOTENV_CONFIG_PATH=/dev/null` y una dirección loopback de DB sin servicio. Se reutilizaron las dependencias ya verificadas de la certificación mediante enlaces ignorados, sin reinstalar, generar clientes ni cambiar paquetes. La evidencia de rojo/verde está ignorada bajo `.local/reports/price-privacy/`.

No se ejecutaron consultas remotas nuevas para esta corrección, escrituras de DB, migraciones, seeds, APPLY, cambios de variables, despliegues ni pagos. El SHA de release permanece fijo y esta rama no queda incluida en él. La revisión y el PR separado deben completarse antes de decidir cualquier liberación; no se autoriza merge ni deployment aquí.
