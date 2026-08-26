import { OrderStatus, Prisma, Role } from "@prisma/client";
import { Router } from "express";
import crypto from "node:crypto";
import multer from "multer";
import { AppError } from "../errors/AppError";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateBody } from "../middleware/validate";
import { companySettingsSchema, importProductsSchema, orderNoteSchema, productActionSchema, productImagesSchema, updateOrderStatusSchema } from "../schemas/admin";
import { releaseReservation } from "../services/inventory";
import { deleteProductImage, uploadProductImage } from "../services/productImageStorage";

export const adminRouter = Router();
adminRouter.use(authenticate, authorize(Role.ADMIN));
const allowedImageTypes = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"], ["image/avif", "avif"]]);
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.PRODUCT_IMAGE_MAX_BYTES, files: 1 }, fileFilter: (_req, file, callback) => callback(null, allowedImageTypes.has(file.mimetype)) });
function hasValidImageSignature(file: Express.Multer.File) {
  const bytes = file.buffer;
  if (file.mimetype === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (file.mimetype === "image/webp") return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  if (file.mimetype === "image/avif") return bytes.subarray(4, 12).toString().startsWith("ftyp") && ["avif", "avis"].includes(bytes.subarray(8, 12).toString());
  return false;
}

function paging(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(query.pageSize) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

const paidStatuses: OrderStatus[] = [OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED];

adminRouter.get("/dashboard", asyncHandler(async (_req, res) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week = new Date(today); week.setDate(week.getDate() - 6);
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const sales = (since?: Date) => prisma.order.aggregate({ where: { status: { in: paidStatuses }, ...(since ? { createdAt: { gte: since } } : {}) }, _sum: { total: true }, _avg: { total: true }, _count: true });
  const [todaySales, weekSales, monthSales, allSales, statuses, soldOut, lowStock, customers, daily, monthly, topProducts, topCategories] = await Promise.all([
    sales(today), sales(week), sales(month), sales(),
    prisma.order.groupBy({ by: ["status"], _count: true }),
    prisma.product.count({ where: { active: true, stock: { lte: 0 } } }),
    prisma.product.count({ where: { active: true, AND: [{ stock: { gt: 0 } }, { stock: { lte: 5 } }] } }),
    prisma.order.findMany({ distinct: ["customerEmail"], select: { customerEmail: true } }).then((rows) => rows.length),
    prisma.$queryRaw<Array<{ label: string; total: number }>>`SELECT TO_CHAR("createdAt", 'YYYY-MM-DD') label, COALESCE(SUM("total"),0)::float total FROM "Order" WHERE "status" IN ('PAID','PROCESSING','SHIPPED','DELIVERED') AND "createdAt" >= ${week} GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<Array<{ label: string; total: number }>>`SELECT TO_CHAR("createdAt", 'YYYY-MM') label, COALESCE(SUM("total"),0)::float total FROM "Order" WHERE "status" IN ('PAID','PROCESSING','SHIPPED','DELIVERED') GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
    prisma.$queryRaw<Array<{ name: string; quantity: number; total: number }>>`SELECT oi."productName" name, SUM(oi."quantity")::int quantity, SUM(oi."subtotal")::float total FROM "OrderItem" oi JOIN "Order" o ON o.id=oi."orderId" WHERE o.status IN ('PAID','PROCESSING','SHIPPED','DELIVERED') GROUP BY 1 ORDER BY quantity DESC LIMIT 8`,
    prisma.$queryRaw<Array<{ name: string; quantity: number }>>`SELECT COALESCE(p.category,'Sin categoría') name, SUM(oi.quantity)::int quantity FROM "OrderItem" oi JOIN "Order" o ON o.id=oi."orderId" LEFT JOIN "Product" p ON p.id=oi."productId" WHERE o.status IN ('PAID','PROCESSING','SHIPPED','DELIVERED') GROUP BY 1 ORDER BY quantity DESC LIMIT 8`,
  ]);
  const counts = Object.fromEntries(statuses.map((item) => [item.status, item._count]));
  res.json({ metrics: { salesToday: todaySales._sum.total || 0, salesWeek: weekSales._sum.total || 0, salesMonth: monthSales._sum.total || 0, pendingOrders: counts.PENDING || 0, paidOrders: counts.PAID || 0, shippedOrders: counts.SHIPPED || 0, cancelledOrders: counts.CANCELLED || 0, soldOutProducts: soldOut, lowStockProducts: lowStock, customers, averageTicket: allSales._avg.total || 0, totalRevenue: allSales._sum.total || 0 }, charts: { daily, monthly: monthly.reverse(), topProducts, topCategories } });
}));

adminRouter.get("/orders", asyncHandler(async (req, res) => {
  const { page, pageSize, skip } = paging(req.query);
  const search = String(req.query.search || "").trim();
  const status = Object.values(OrderStatus).includes(req.query.status as OrderStatus) ? req.query.status as OrderStatus : undefined;
  const min = Number(req.query.minAmount); const max = Number(req.query.maxAmount);
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(`${String(req.query.to)}T23:59:59.999Z`) : undefined;
  const where: Prisma.OrderWhereInput = {
    ...(status ? { status } : {}),
    ...(search ? { OR: [{ id: { contains: search, mode: "insensitive" } }, { customerName: { contains: search, mode: "insensitive" } }, { customerEmail: { contains: search, mode: "insensitive" } }, { items: { some: { productCode: { contains: search, mode: "insensitive" } } } }] } : {}),
    ...(!Number.isNaN(min) || !Number.isNaN(max) ? { total: { ...(!Number.isNaN(min) ? { gte: min } : {}), ...(!Number.isNaN(max) ? { lte: max } : {}) } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };
  const sort = req.query.sort === "oldest" ? "asc" : "desc";
  const [orders, total] = await Promise.all([prisma.order.findMany({ where, skip, take: pageSize, orderBy: { createdAt: sort }, include: { payment: { select: { status: true, providerPaymentId: true } }, _count: { select: { items: true } } } }), prisma.order.count({ where })]);
  res.json({ orders, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
}));

adminRouter.get("/orders/:id", asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: String(req.params.id) }, include: { items: true, payment: true, reservations: { include: { product: { select: { name: true, code: true } } } }, notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } }, statusHistory: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: "asc" } } } });
  if (!order) throw new AppError(404, "Pedido no encontrado");
  res.json({ order });
}));

adminRouter.patch("/orders/:id/status", validateBody(updateOrderStatusSchema), asyncHandler(async (req, res) => {
  const id = String(req.params.id); const { status, reason } = req.body;
  const order = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id } });
    if (!current) throw new AppError(404, "Pedido no encontrado");
    if (current.status === status) return current;
    const allowed: Partial<Record<OrderStatus, OrderStatus[]>> = {
      PENDING: [OrderStatus.CANCELLED], PAID: [OrderStatus.PROCESSING],
      PROCESSING: [OrderStatus.SHIPPED], SHIPPED: [OrderStatus.DELIVERED],
    };
    if (!allowed[current.status]?.includes(status)) throw new AppError(409, `Transición no permitida: ${current.status} → ${status}`);
    if (current.status === OrderStatus.PENDING && status === OrderStatus.CANCELLED) await releaseReservation(tx, id, "Cancelación administrativa");
    await tx.orderStatusHistory.create({ data: { orderId: id, from: current.status, to: status, reason, actorId: req.user!.id } });
    return tx.order.update({ where: { id }, data: { status } });
  });
  res.json({ message: "Estado actualizado", order });
}));

adminRouter.post("/orders/:id/notes", validateBody(orderNoteSchema), asyncHandler(async (req, res) => {
  const note = await prisma.orderNote.create({ data: { orderId: String(req.params.id), authorId: req.user!.id, content: req.body.content }, include: { author: { select: { name: true } } } });
  res.status(201).json({ note });
}));

adminRouter.get("/customers", asyncHandler(async (req, res) => {
  const { page, pageSize, skip } = paging(req.query); const search = String(req.query.search || "").trim();
  const filter = search ? Prisma.sql`WHERE "customerName" ILIKE ${`%${search}%`} OR "customerEmail" ILIKE ${`%${search}%`} OR "customerPhone" ILIKE ${`%${search}%`}` : Prisma.empty;
  const customers = await prisma.$queryRaw<Array<{ email: string; name: string; phone: string; orders: number; total: number; lastOrder: Date; fullCount: number }>>(Prisma.sql`SELECT "customerEmail" email, MAX("customerName") name, MAX("customerPhone") phone, COUNT(*)::int orders, COALESCE(SUM(CASE WHEN status IN ('PAID','PROCESSING','SHIPPED','DELIVERED') THEN total ELSE 0 END),0)::float total, MAX("createdAt") "lastOrder", COUNT(*) OVER()::int "fullCount" FROM "Order" ${filter} GROUP BY "customerEmail" ORDER BY "lastOrder" DESC LIMIT ${pageSize} OFFSET ${skip}`);
  const total = customers[0]?.fullCount || 0; res.json({ customers: customers.map(({ fullCount, ...item }) => item), pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
}));

adminRouter.get("/customers/:email", asyncHandler(async (req, res) => {
  const email = decodeURIComponent(String(req.params.email));
  const orders = await prisma.order.findMany({ where: { customerEmail: email }, include: { items: true, payment: { select: { status: true } } }, orderBy: { createdAt: "desc" } });
  if (!orders.length) throw new AppError(404, "Cliente no encontrado");
  const addresses = [...new Map(orders.map((o) => [`${o.shippingAddress}|${o.postalCode}`, { address: o.shippingAddress, city: o.city, state: o.state, postalCode: o.postalCode, country: o.country }])).values()];
  res.json({ customer: { name: orders[0].customerName, email, phone: orders[0].customerPhone, orders: orders.length, total: orders.filter((o) => paidStatuses.includes(o.status)).reduce((sum, o) => sum + o.total, 0), lastOrder: orders[0].createdAt, addresses }, orders });
}));

adminRouter.get("/products", asyncHandler(async (req, res) => {
  const { page, pageSize, skip } = paging(req.query); const search = String(req.query.search || "").trim(); const category = String(req.query.category || "");
  const where: Prisma.ProductWhereInput = { ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }, { slug: { contains: search, mode: "insensitive" } }] } : {}), ...(category ? { category } : {}) };
  const [products, total] = await Promise.all([prisma.product.findMany({ where, skip, take: pageSize, orderBy: { createdAt: "desc" }, include: { images: { orderBy: { position: "asc" } } } }), prisma.product.count({ where })]);
  res.json({ products: products.map((p) => ({ ...p, availableStock: p.stock - p.reservedStock })), pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
}));

adminRouter.get("/products/export.csv", asyncHandler(async (_req, res) => {
  const products = await prisma.product.findMany({ orderBy: { name: "asc" } });
  const fields = ["code","slug","brand","name","category","description","imageUrl","price","oldPrice","featured","active"] as const;
  const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [fields.join(","), ...products.map((product) => fields.map((field) => cell(product[field])).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", "attachment; filename=magno-products.csv"); res.send(`\uFEFF${csv}`);
}));

adminRouter.post("/products/import", validateBody(importProductsSchema), asyncHandler(async (req, res) => {
  let created = 0; let updated = 0;
  for (const row of req.body.products) {
    const exists = await prisma.product.findUnique({ where: { code: row.code }, select: { id: true } });
    await prisma.product.upsert({ where: { code: row.code }, create: { ...row, digitalPrice: row.price }, update: { ...row, digitalPrice: row.price } });
    if (exists) updated += 1; else created += 1;
  }
  res.json({ created, updated });
}));

adminRouter.get("/products/:id", asyncHandler(async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: String(req.params.id) }, include: { images: { orderBy: { position: "asc" } } } });
  if (!product) throw new AppError(404, "Producto no encontrado");
  res.json({ product: { ...product, availableStock: product.stock - product.reservedStock } });
}));

adminRouter.post("/products/:id/duplicate", asyncHandler(async (req, res) => {
  const source = await prisma.product.findUnique({ where: { id: String(req.params.id) }, include: { images: true } }); if (!source) throw new AppError(404, "Producto no encontrado");
  const suffix = Date.now().toString().slice(-6); const { id: _id, createdAt: _c, updatedAt: _u, stock: _s, reservedStock: _r, images, ...data } = source;
  const product = await prisma.product.create({ data: { ...data, name: `${source.name} copia`, slug: `${source.slug}-copia-${suffix}`, code: `${source.code}-COPY-${suffix}`, active: false, featured: false, stock: 0, images: { create: images.map((image, position) => ({ url: image.url, alt: image.alt, position })) } } });
  res.status(201).json({ product });
}));

adminRouter.patch("/products/:id", validateBody(productActionSchema), asyncHandler(async (req, res) => {
  const product = await prisma.product.update({ where: { id: String(req.params.id) }, data: req.body }); res.json({ product });
}));

adminRouter.put("/products/:id/images", validateBody(productImagesSchema), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const ownedCount = await prisma.productImage.count({ where: { productId: id, storagePath: { not: null } } });
  if (ownedCount + req.body.images.length > env.PRODUCT_IMAGE_MAX_COUNT) throw new AppError(409, `Máximo ${env.PRODUCT_IMAGE_MAX_COUNT} imágenes por producto`);
  await prisma.$transaction([prisma.productImage.deleteMany({ where: { productId: id, storagePath: null } }), prisma.productImage.createMany({ data: req.body.images.map((image: { url: string; alt?: string | null }, position: number) => ({ productId: id, url: image.url, alt: image.alt, position: ownedCount + position })) })]);
  const images = await prisma.productImage.findMany({ where: { productId: id }, orderBy: { position: "asc" } }); res.json({ images });
}));

adminRouter.post("/products/:id/images/upload", imageUpload.single("image"), asyncHandler(async (req, res) => {
  const productId = String(req.params.id);
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true, _count: { select: { images: true } } } });
  if (!product) throw new AppError(404, "Producto no encontrado");
  if (!req.file) throw new AppError(400, "Selecciona una imagen JPEG, PNG, WEBP o AVIF válida");
  if (!hasValidImageSignature(req.file)) throw new AppError(400, "El contenido del archivo no coincide con un formato de imagen permitido");
  if (product._count.images >= env.PRODUCT_IMAGE_MAX_COUNT) throw new AppError(409, `Máximo ${env.PRODUCT_IMAGE_MAX_COUNT} imágenes por producto`);
  const extension = allowedImageTypes.get(req.file.mimetype)!;
  const storagePath = `products/${productId}/${crypto.randomUUID()}.${extension}`;
  const url = await uploadProductImage(storagePath, req.file);
  try {
    const image = await prisma.productImage.create({ data: { productId, url, storagePath, alt: String(req.body.alt || product.name).slice(0, 200), position: product._count.images } });
    if (product._count.images === 0) await prisma.product.update({ where: { id: productId }, data: { imageUrl: url } });
    res.status(201).json({ image });
  } catch (error) { await deleteProductImage(storagePath); throw error; }
}));

adminRouter.post("/products/:id/images/reorder", asyncHandler(async (req, res) => {
  const productId = String(req.params.id); const imageIds = Array.isArray(req.body.imageIds) ? req.body.imageIds.map(String) : [];
  const owned = await prisma.productImage.count({ where: { productId, id: { in: imageIds } } });
  if (!imageIds.length || owned !== imageIds.length) throw new AppError(400, "Orden de imágenes inválido");
  await prisma.$transaction(imageIds.map((id, position) => prisma.productImage.update({ where: { id }, data: { position } })));
  res.json({ images: await prisma.productImage.findMany({ where: { productId }, orderBy: { position: "asc" } }) });
}));

adminRouter.patch("/products/:id/images/:imageId/primary", asyncHandler(async (req, res) => {
  const productId = String(req.params.id); const imageId = String(req.params.imageId);
  const image = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
  if (!image) throw new AppError(404, "Imagen no encontrada");
  const images = await prisma.productImage.findMany({ where: { productId }, orderBy: { position: "asc" } });
  const reordered = [image, ...images.filter((item) => item.id !== imageId)];
  await prisma.$transaction([prisma.product.update({ where: { id: productId }, data: { imageUrl: image.url } }), ...reordered.map((item, position) => prisma.productImage.update({ where: { id: item.id }, data: { position } }))]);
  res.json({ image });
}));

adminRouter.delete("/products/:id/images/:imageId", asyncHandler(async (req, res) => {
  const productId = String(req.params.id); const imageId = String(req.params.imageId);
  const image = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
  if (!image) throw new AppError(404, "Imagen no encontrada");
  if (image.storagePath) await deleteProductImage(image.storagePath);
  await prisma.productImage.delete({ where: { id: imageId } });
  const remaining = await prisma.productImage.findMany({ where: { productId }, orderBy: { position: "asc" } });
  await prisma.$transaction([prisma.product.update({ where: { id: productId }, data: { imageUrl: remaining[0]?.url || null } }), ...remaining.map((item, position) => prisma.productImage.update({ where: { id: item.id }, data: { position } }))]);
  res.json({ message: "Imagen eliminada", images: remaining });
}));

adminRouter.get("/settings", asyncHandler(async (_req, res) => {
  const settings = await prisma.companySettings.upsert({ where: { id: "default" }, update: {}, create: {} }); res.json({ settings, mercadoPago: { configured: Boolean(env.MERCADO_PAGO_ACCESS_TOKEN), webhookConfigured: Boolean(env.MERCADO_PAGO_WEBHOOK_SECRET) } });
}));

adminRouter.put("/settings", validateBody(companySettingsSchema), asyncHandler(async (req, res) => {
  const settings = await prisma.companySettings.upsert({ where: { id: "default" }, update: req.body, create: { ...req.body, id: "default" } }); res.json({ settings });
}));
