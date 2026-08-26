CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REFUNDED', 'FAILED');

ALTER TABLE "Order"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "customerName" TEXT,
  ADD COLUMN "customerEmail" TEXT,
  ADD COLUMN "customerPhone" TEXT,
  ADD COLUMN "shippingAddress" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "shipping" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "total" DOUBLE PRECISION,
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Order"
SET
  "customerName" = COALESCE("customer"->>'fullName', 'Cliente'),
  "customerEmail" = COALESCE("customer"->>'email', 'sin-correo@example.invalid'),
  "customerPhone" = COALESCE("customer"->>'phone', 'No disponible'),
  "shippingAddress" = COALESCE("customer"->>'address', 'No disponible'),
  "city" = COALESCE("customer"->>'city', 'No disponible'),
  "state" = COALESCE("customer"->>'state', 'No disponible'),
  "postalCode" = COALESCE("customer"->>'zipCode', 'No disponible'),
  "country" = COALESCE("customer"->>'country', 'MX'),
  "total" = "subtotal",
  "currency" = 'MXN',
  "updatedAt" = "createdAt";

CREATE TABLE "OrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "productCode" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "subtotal" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

INSERT INTO "OrderItem" ("id", "orderId", "productId", "productName", "productCode", "quantity", "unitPrice", "subtotal")
SELECT
  o."id" || '-legacy-' || item.ordinality,
  o."id",
  COALESCE(item.value->>'id', 'legacy-product'),
  COALESCE(item.value->>'name', 'Producto histórico'),
  COALESCE(item.value->>'code', ''),
  COALESCE((item.value->>'quantity')::INTEGER, 1),
  COALESCE((item.value->>'price')::DOUBLE PRECISION, 0),
  COALESCE((item.value->>'price')::DOUBLE PRECISION, 0) * COALESCE((item.value->>'quantity')::INTEGER, 1)
FROM "Order" o
CROSS JOIN LATERAL jsonb_array_elements(o."items") WITH ORDINALITY AS item(value, ordinality);

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "providerPreferenceId" TEXT,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "rawResponse" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order"
  ALTER COLUMN "customerName" SET NOT NULL,
  ALTER COLUMN "customerEmail" SET NOT NULL,
  ALTER COLUMN "customerPhone" SET NOT NULL,
  ALTER COLUMN "shippingAddress" SET NOT NULL,
  ALTER COLUMN "city" SET NOT NULL,
  ALTER COLUMN "state" SET NOT NULL,
  ALTER COLUMN "postalCode" SET NOT NULL,
  ALTER COLUMN "country" SET NOT NULL,
  ALTER COLUMN "total" SET NOT NULL,
  ALTER COLUMN "currency" SET NOT NULL,
  DROP COLUMN "customer",
  DROP COLUMN "items";

CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");
CREATE INDEX "Order_customerEmail_idx" ON "Order"("customerEmail");
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");
CREATE UNIQUE INDEX "Payment_providerPreferenceId_key" ON "Payment"("providerPreferenceId");

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
