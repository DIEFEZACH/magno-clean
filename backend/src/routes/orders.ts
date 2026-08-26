import { Router } from "express";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { authenticate, authorize } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateBody } from "../middleware/validate";
import { createOrderSchema } from "../schemas/orders";
import { env } from "../config/env";
import { reserveInventory } from "../services/inventory";

export const ordersRouter = Router();

ordersRouter.post("/", validateBody(createOrderSchema), asyncHandler(async (req, res) => {
  const { customer, items } = req.body;
  const quantities = new Map<string, number>();
  for (const item of items) quantities.set(item.id, (quantities.get(item.id) || 0) + item.quantity);

  const order = await prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      where: { id: { in: [...quantities.keys()] }, active: true },
      select: { id: true, name: true, code: true, price: true },
    });
    if (products.length !== quantities.size) throw new AppError(400, "Uno o más productos no están disponibles");
    const orderItems = products.map((product) => ({
      productId: product.id, productName: product.name, productCode: product.code,
      quantity: quantities.get(product.id)!, unitPrice: product.price,
      subtotal: product.price * quantities.get(product.id)!,
    }));
    const subtotal = orderItems.reduce((total, item) => total + item.subtotal, 0);
    const created = await tx.order.create({
      data: {
        customerName: customer.fullName, customerEmail: customer.email,
        customerPhone: customer.phone, shippingAddress: customer.address,
        city: customer.city, state: "No disponible", postalCode: customer.zipCode,
        country: "MX", subtotal, total: subtotal, currency: "MXN",
        items: { create: orderItems },
      },
      include: { items: true },
    });
    await reserveInventory(tx, created.id, orderItems, new Date(Date.now() + env.INVENTORY_RESERVATION_MINUTES * 60_000));
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  res.status(201).json({ message: "Orden creada correctamente", order: {
    ...order,
    customer: { fullName: order.customerName, email: order.customerEmail, phone: order.customerPhone, address: order.shippingAddress, city: order.city, zipCode: order.postalCode },
    items: order.items.map((item) => ({ id: item.productId, name: item.productName, quantity: item.quantity, price: item.unitPrice })),
  } });
}));

ordersRouter.get("/", authenticate, authorize(Role.ADMIN), asyncHandler(async (_req, res) => {
  const orders = await prisma.order.findMany({ include: { items: true }, orderBy: { createdAt: "desc" } });
  res.json({ orders: orders.map((order) => ({
    id: order.id,
    customer: { fullName: order.customerName, email: order.customerEmail, phone: order.customerPhone, address: order.shippingAddress, city: order.city, zipCode: order.postalCode },
    items: order.items.map((item) => ({ name: item.productName, quantity: item.quantity, price: item.unitPrice })),
    subtotal: order.subtotal,
    createdAt: order.createdAt,
  })) });
}));

ordersRouter.get("/:id/status", asyncHandler(async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const order = await prisma.order.findUnique({ where: { id }, include: { payment: { select: { status: true } } } });
  if (!order) throw new AppError(404, "Orden no encontrada");
  res.json({ orderId: order.id, status: order.status, paymentStatus: order.payment?.status || null });
}));
