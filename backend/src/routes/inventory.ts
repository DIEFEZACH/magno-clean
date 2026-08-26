import { InventoryMovementType, Prisma, Role } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/AppError";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateBody } from "../middleware/validate";
import { adjustInventorySchema } from "../schemas/products";

export const inventoryRouter = Router();

inventoryRouter.use(authenticate, authorize(Role.ADMIN));

inventoryRouter.get("/", asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1); const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 20));
  const search = String(req.query.search || "").trim(); const filter = String(req.query.filter || "all");
  const where: Prisma.ProductWhereInput = { ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }] } : {}), ...(filter === "out" ? { stock: 0 } : filter === "low" ? { AND: [{ stock: { gt: 0 } }, { stock: { lte: 5 } }] } : {}) };
  const [products, total] = await Promise.all([prisma.product.findMany({
    where,
    select: { id: true, code: true, name: true, category: true, stock: true, reservedStock: true },
    orderBy: { name: "asc" },
    skip: (page - 1) * pageSize, take: pageSize,
  }), prisma.product.count({ where })]);
  res.json({ inventory: products.map((product) => ({
    ...product,
    availableStock: product.stock - product.reservedStock,
  })), pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
}));

inventoryRouter.get("/:productId/movements", asyncHandler(async (req, res) => {
  const productId = String(req.params.productId);
  const page = Math.max(1, Number(req.query.page) || 1); const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 20));
  const type = req.query.type ? String(req.query.type) as never : undefined;
  const where: Prisma.InventoryMovementWhereInput = { productId, ...(type ? { type } : {}) };
  const [movements, total] = await Promise.all([prisma.inventoryMovement.findMany({
    where,
    include: { createdBy: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize, take: pageSize,
  }), prisma.inventoryMovement.count({ where })]);
  res.json({ movements, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
}));

inventoryRouter.post("/:productId/adjust", validateBody(adjustInventorySchema), asyncHandler(async (req, res) => {
  const productId = String(req.params.productId);
  const { newStock, reason } = req.body as { newStock: number; reason: string };

  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ stock: number; reservedStock: number }>>`
      SELECT "stock", "reservedStock" FROM "Product" WHERE "id" = ${productId} FOR UPDATE
    `;
    const current = rows[0];
    if (!current) throw new AppError(404, "Producto no encontrado");
    if (newStock < current.reservedStock) {
      throw new AppError(409, "La existencia no puede ser menor que el stock reservado");
    }
    const quantity = newStock - current.stock;
    const product = await tx.product.update({ where: { id: productId }, data: { stock: newStock } });
    const movement = await tx.inventoryMovement.create({
      data: {
        productId,
        type: InventoryMovementType.ADJUSTMENT,
        quantity,
        reason,
        createdById: req.user!.id,
        stockAfter: product.stock,
        reservedStockAfter: product.reservedStock,
      },
    });
    return { product, movement };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  res.json({
    message: "Inventario ajustado correctamente",
    inventory: {
      stock: result.product.stock,
      reservedStock: result.product.reservedStock,
      availableStock: result.product.stock - result.product.reservedStock,
    },
    movement: result.movement,
  });
}));
