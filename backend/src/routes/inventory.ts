import { Prisma, Role } from "@prisma/client";
import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { AppError } from "../errors/AppError";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateBody } from "../middleware/validate";
import { adjustInventorySchema } from "../schemas/products";
import { adjustProductInventory } from "../services/inventory";
import {
  executeInventoryImport,
  MAX_INVENTORY_IMPORT_BYTES,
  previewInventoryImport,
} from "../services/inventoryImport";

export const inventoryRouter = Router();

inventoryRouter.use(authenticate, authorize(Role.ADMIN));

const inventoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_INVENTORY_IMPORT_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extensionIsCsv = path.extname(file.originalname).toLowerCase() === ".csv";
    const mimeIsCsv = ["text/csv", "application/csv", "application/vnd.ms-excel", "application/octet-stream"].includes(file.mimetype);
    if (!extensionIsCsv || !mimeIsCsv) return callback(new AppError(400, "Sólo se permite un archivo CSV"));
    callback(null, true);
  },
});

function booleanField(value: unknown, name: string, defaultValue = false) {
  if (value === undefined || value === "") return defaultValue;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  throw new AppError(400, `${name} debe ser true o false`);
}

inventoryRouter.post("/import/preview", inventoryUpload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, "Archivo CSV requerido");
  const strictCatalog = booleanField(req.body.strictCatalog, "strictCatalog");
  const preview = await previewInventoryImport(req.file.buffer, strictCatalog);
  res.json(preview);
}));

inventoryRouter.post("/import", inventoryUpload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, "Archivo CSV requerido");
  if (!booleanField(req.body.confirm, "confirm")) throw new AppError(400, "Confirmación explícita requerida");
  const strictCatalog = booleanField(req.body.strictCatalog, "strictCatalog");
  const expectedChecksum = String(req.body.checksum || "").trim().toLowerCase();
  if (expectedChecksum && !/^[a-f0-9]{64}$/.test(expectedChecksum)) throw new AppError(400, "Checksum inválido");

  const preview = await previewInventoryImport(req.file.buffer, strictCatalog);
  if (expectedChecksum && preview.checksum !== expectedChecksum) throw new AppError(409, "El archivo no coincide con el preview confirmado");
  if (!preview.valid) throw new AppError(400, "El CSV contiene errores", preview);

  const report = await executeInventoryImport(req.file.buffer, strictCatalog, req.user!.id);
  res.json(report);
}));

inventoryRouter.get("/", asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1); const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 20));
  const search = String(req.query.search || "").trim(); const filter = String(req.query.filter || "all");
  const where: Prisma.ProductWhereInput = {
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }] } : {}),
    ...(filter === "out"
      ? { stock: 0 }
      : filter === "low"
        ? { AND: [{ stock: { gt: 0 } }, { stock: { lte: prisma.product.fields.minStock } }] }
        : {}),
  };
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

  const result = await adjustProductInventory({
    productId,
    newStock,
    reason,
    createdById: req.user!.id,
  });

  res.json({
    message: result.changed ? "Inventario ajustado correctamente" : "Sin cambios",
    inventory: {
      stock: result.product.stock,
      reservedStock: result.product.reservedStock,
      availableStock: result.product.stock - result.product.reservedStock,
    },
    movement: result.movement,
  });
}));
