import {
  InventoryMovementType,
  InventoryReservationStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { AppError } from "../errors/AppError";
import { prisma } from "../lib/prisma";

type Tx = Prisma.TransactionClient;
type StockRow = { stock: number; reservedStock: number };
type ReservationRow = {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  status: InventoryReservationStatus;
};

export type AdjustProductInventoryInput = {
  productId: string;
  newStock: number;
  reason: string;
  createdById: string;
};

export async function adjustProductInventoryInTransaction(
  tx: Tx,
  input: AdjustProductInventoryInput,
) {
  const rows = await tx.$queryRaw<StockRow[]>`
    SELECT "stock", "reservedStock" FROM "Product" WHERE "id" = ${input.productId} FOR UPDATE
  `;
  const current = rows[0];
  if (!current) throw new AppError(404, "Producto no encontrado");
  if (input.newStock < current.reservedStock) {
    throw new AppError(409, "La existencia no puede ser menor que el stock reservado");
  }
  if (input.newStock === current.stock) {
    return { product: current, movement: null, changed: false as const, previousStock: current.stock };
  }

  const quantity = input.newStock - current.stock;
  const product = await tx.product.update({
    where: { id: input.productId },
    data: { stock: input.newStock },
  });
  const inventoryMovement = await tx.inventoryMovement.create({
    data: {
      productId: input.productId,
      type: InventoryMovementType.ADJUSTMENT,
      quantity,
      reason: input.reason,
      createdById: input.createdById,
      stockAfter: product.stock,
      reservedStockAfter: product.reservedStock,
    },
  });
  return { product, movement: inventoryMovement, changed: true as const, previousStock: current.stock };
}

export async function adjustProductInventory(input: AdjustProductInventoryInput) {
  return prisma.$transaction(
    (tx) => adjustProductInventoryInTransaction(tx, input),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function stockState(tx: Tx, productId: string) {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { stock: true, reservedStock: true },
  });
  if (!product) throw new AppError(404, "Producto no encontrado");
  return product;
}

async function movement(
  tx: Tx,
  data: {
    productId: string;
    type: InventoryMovementType;
    quantity: number;
    reason?: string;
    orderId?: string;
    createdById?: string;
  },
) {
  const state = await stockState(tx, data.productId);
  await tx.inventoryMovement.create({
    data: { ...data, stockAfter: state.stock, reservedStockAfter: state.reservedStock },
  });
}

export async function reserveInventory(
  tx: Tx,
  orderId: string,
  items: Array<{ productId: string; productName: string; quantity: number }>,
  expiresAt: Date,
) {
  for (const item of [...items].sort((a, b) => a.productId.localeCompare(b.productId))) {
    const rows = await tx.$queryRaw<StockRow[]>`
      UPDATE "Product"
      SET "reservedStock" = "reservedStock" + ${item.quantity}, "updatedAt" = NOW()
      WHERE "id" = ${item.productId}
        AND "active" = true
        AND "stock" - "reservedStock" >= ${item.quantity}
      RETURNING "stock", "reservedStock"
    `;
    if (rows.length !== 1) {
      throw new AppError(409, `Stock insuficiente para ${item.productName}`, {
        productId: item.productId,
        productName: item.productName,
      });
    }
    await tx.inventoryReservation.create({
      data: { orderId, productId: item.productId, quantity: item.quantity, expiresAt },
    });
    await movement(tx, {
      productId: item.productId,
      type: InventoryMovementType.RESERVATION,
      quantity: item.quantity,
      reason: "Reserva creada para checkout",
      orderId,
    });
  }
}

async function lockedReservations(tx: Tx, orderId: string) {
  return tx.$queryRaw<ReservationRow[]>`
    SELECT "id", "orderId", "productId", "quantity", "status"
    FROM "InventoryReservation"
    WHERE "orderId" = ${orderId}
    ORDER BY "productId"
    FOR UPDATE
  `;
}

export async function consumeReservation(tx: Tx, orderId: string) {
  const reservations = await lockedReservations(tx, orderId);
  for (const reservation of reservations) {
    if (reservation.status === InventoryReservationStatus.RELEASED) {
      const lateSale = await tx.$executeRaw`
        UPDATE "Product"
        SET "stock" = "stock" - ${reservation.quantity}, "updatedAt" = NOW()
        WHERE "id" = ${reservation.productId}
          AND "stock" - "reservedStock" >= ${reservation.quantity}
      `;
      if (lateSale !== 1) throw new AppError(409, "Pago aprobado después de vencer la reserva; requiere conciliación manual");
      await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { status: InventoryReservationStatus.CONSUMED } });
      await movement(tx, {
        productId: reservation.productId,
        type: InventoryMovementType.SALE,
        quantity: -reservation.quantity,
        reason: "Pago aprobado después de liberar la reserva",
        orderId,
      });
      continue;
    }
    if (reservation.status !== InventoryReservationStatus.ACTIVE) continue;
    const updated = await tx.$executeRaw`
      UPDATE "Product"
      SET "stock" = "stock" - ${reservation.quantity},
          "reservedStock" = "reservedStock" - ${reservation.quantity},
          "updatedAt" = NOW()
      WHERE "id" = ${reservation.productId}
        AND "stock" >= ${reservation.quantity}
        AND "reservedStock" >= ${reservation.quantity}
    `;
    if (updated !== 1) throw new AppError(409, "La reserva de inventario es inconsistente");
    await tx.inventoryReservation.update({
      where: { id: reservation.id },
      data: { status: InventoryReservationStatus.CONSUMED },
    });
    await movement(tx, {
      productId: reservation.productId,
      type: InventoryMovementType.SALE,
      quantity: -reservation.quantity,
      reason: "Pago aprobado; reserva convertida en venta",
      orderId,
    });
  }
}

export async function releaseReservation(
  tx: Tx,
  orderId: string,
  reason: string,
  type: InventoryMovementType = InventoryMovementType.RELEASE,
) {
  const reservations = await lockedReservations(tx, orderId);
  for (const reservation of reservations) {
    if (reservation.status !== InventoryReservationStatus.ACTIVE) continue;
    const updated = await tx.$executeRaw`
      UPDATE "Product"
      SET "reservedStock" = "reservedStock" - ${reservation.quantity}, "updatedAt" = NOW()
      WHERE "id" = ${reservation.productId} AND "reservedStock" >= ${reservation.quantity}
    `;
    if (updated !== 1) throw new AppError(409, "La reserva de inventario es inconsistente");
    await tx.inventoryReservation.update({
      where: { id: reservation.id },
      data: { status: InventoryReservationStatus.RELEASED },
    });
    await movement(tx, {
      productId: reservation.productId,
      type,
      quantity: -reservation.quantity,
      reason,
      orderId,
    });
  }
}

export async function returnConsumedInventory(tx: Tx, orderId: string, reason: string) {
  const reservations = await lockedReservations(tx, orderId);
  for (const reservation of reservations) {
    if (reservation.status !== InventoryReservationStatus.CONSUMED) continue;
    await tx.product.update({
      where: { id: reservation.productId },
      data: { stock: { increment: reservation.quantity } },
    });
    await tx.inventoryReservation.update({
      where: { id: reservation.id },
      data: { status: InventoryReservationStatus.RETURNED },
    });
    await movement(tx, {
      productId: reservation.productId,
      type: InventoryMovementType.RETURN,
      quantity: reservation.quantity,
      reason,
      orderId,
    });
  }
}

export async function releaseExpiredReservations(prisma: PrismaClient, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ orderId: string }>>`
      SELECT "orderId"
      FROM "InventoryReservation"
      WHERE "status" = 'ACTIVE'::"InventoryReservationStatus" AND "expiresAt" <= ${now}
      FOR UPDATE SKIP LOCKED
    `;
    const orders = [...new Set(locked.map((row) => row.orderId))].map((orderId) => ({ orderId }));
    for (const { orderId } of orders) {
      await releaseReservation(tx, orderId, "Reserva vencida", InventoryMovementType.RELEASE);
      await tx.order.updateMany({
        where: { id: orderId, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
    }
    return orders.length;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
