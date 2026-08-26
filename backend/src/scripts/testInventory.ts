import { InventoryMovementType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { consumeReservation, releaseExpiredReservations, releaseReservation, reserveInventory } from "../services/inventory";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(`Fallo: ${message}`);
  console.log(`✓ ${message}`);
}

async function createReservedOrder(productId: string, productName: string, quantity: number, expiresAt = new Date(Date.now() + 60_000)) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        customerName: "Inventory Test", customerEmail: "inventory-test@example.com",
        customerPhone: "5555555555", shippingAddress: "Test 1", city: "CDMX",
        state: "CDMX", postalCode: "01000", country: "MX", subtotal: quantity,
        total: quantity, currency: "MXN",
        items: { create: { productId, productName, productCode: "INV-TEST", quantity, unitPrice: 1, subtotal: quantity } },
      },
    });
    await reserveInventory(tx, order.id, [{ productId, productName, quantity }], expiresAt);
    return order.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function main() {
  const code = `INV-TEST-${Date.now()}`;
  const product = await prisma.product.create({
    data: { slug: code.toLowerCase(), code, name: "Inventory Test", brand: "Test", category: "Test", description: "Temporal", price: 1, stock: 3 },
  });
  try {
    const paidOrder = await createReservedOrder(product.id, product.name, 2);
    let state = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    assert(state.stock === 3 && state.reservedStock === 2, "stock suficiente crea reserva sin descontar stock físico");

    await prisma.$transaction((tx) => consumeReservation(tx, paidOrder), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await prisma.$transaction((tx) => consumeReservation(tx, paidOrder), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    state = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    const sales = await prisma.inventoryMovement.count({ where: { productId: product.id, orderId: paidOrder, type: InventoryMovementType.SALE } });
    assert(state.stock === 1 && state.reservedStock === 0 && sales === 1, "pago aprobado y webhook duplicado consumen una sola vez");

    const rejectedOrder = await createReservedOrder(product.id, product.name, 1);
    await prisma.$transaction((tx) => releaseReservation(tx, rejectedOrder, "Pago rechazado"), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await prisma.$transaction((tx) => releaseReservation(tx, rejectedOrder, "Duplicado"), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    state = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    const releases = await prisma.inventoryMovement.count({ where: { productId: product.id, orderId: rejectedOrder, type: InventoryMovementType.RELEASE } });
    assert(state.stock === 1 && state.reservedStock === 0 && releases === 1, "rechazo/cancelación y liberación duplicada liberan una sola vez");

    const cancelledOrder = await createReservedOrder(product.id, product.name, 1);
    await prisma.$transaction((tx) => releaseReservation(tx, cancelledOrder, "Orden cancelada", InventoryMovementType.CANCELLATION), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    state = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    assert(state.stock === 1 && state.reservedStock === 0, "cancelación libera la reserva sin alterar stock físico");

    const expiredOrder = await createReservedOrder(product.id, product.name, 1, new Date(Date.now() - 1_000));
    const expiredCount = await releaseExpiredReservations(prisma);
    const expired = await prisma.order.findUniqueOrThrow({ where: { id: expiredOrder } });
    state = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    assert(expiredCount >= 1 && expired.status === "CANCELLED" && state.reservedStock === 0, "reserva vencida se libera mediante job");

    const attempts = await Promise.allSettled([
      createReservedOrder(product.id, product.name, 1),
      createReservedOrder(product.id, product.name, 1),
    ]);
    const winners = attempts.filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled");
    assert(winners.length === 1, "dos checkouts simultáneos para la última unidad producen un solo ganador");
    state = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    const active = await prisma.inventoryReservation.count({ where: { productId: product.id, status: "ACTIVE" } });
    assert(state.stock === 1 && state.reservedStock === 1 && active === 1, "la última unidad nunca queda reservada por dos órdenes");
    assert(state.stock - state.reservedStock === 0, "producto agotado expone disponibilidad cero");

    let insufficient = false;
    try { await createReservedOrder(product.id, product.name, 1); } catch { insufficient = true; }
    assert(insufficient, "stock insuficiente rechaza la reserva");
    await prisma.$transaction((tx) => releaseReservation(tx, winners[0].value, "Fin de prueba"), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } finally {
    await prisma.inventoryMovement.deleteMany({ where: { productId: product.id } });
    await prisma.order.deleteMany({ where: { customerEmail: "inventory-test@example.com" } });
    await prisma.product.delete({ where: { id: product.id } });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
