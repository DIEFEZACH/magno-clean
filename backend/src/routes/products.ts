import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateBody } from "../middleware/validate";
import { createProductSchema, updateProductSchema } from "../schemas/products";
import { deleteProductImage } from "../services/productImageStorage";

export const productsRouter = Router();

const productFields = [
  "slug",
  "code",
  "brand",
  "name",
  "category",
  "description",
  "imageUrl",
  "costPrice",
  "unitPrice",
  "wholesalePrice",
  "retailPrice",
  "digitalPrice",
  "price",
  "oldPrice",
  "badge",
  "featured",
  "active",
] as const;

function productData(body: Record<string, unknown>, creating = false) {
  const data: Record<string, unknown> = {};

  for (const field of productFields) {
    if (body[field] !== undefined) data[field] = body[field];
  }

  if (body.digitalPrice !== undefined) {
    data.digitalPrice = body.digitalPrice;
    data.price = body.digitalPrice;
  } else if (body.price !== undefined) {
    data.price = body.price;
    data.digitalPrice = body.price;
  }

  if (creating) {
    data.code ??= body.slug;
    data.brand ??= "Magno Clean";
    data.price ??= 0;
    data.digitalPrice ??= data.price;
  }

  return data;
}

const publicProductSourceSelect = {
  id: true,
  slug: true,
  code: true,
  brand: true,
  name: true,
  category: true,
  description: true,
  imageUrl: true,
  retailPrice: true,
  digitalPrice: true,
  price: true,
  oldPrice: true,
  badge: true,
  featured: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  stock: true,
  reservedStock: true,
  images: {
    select: { id: true, url: true, alt: true, position: true },
    orderBy: { position: "asc" as const },
  },
} satisfies Prisma.ProductSelect;

type PublicProductSource = Prisma.ProductGetPayload<{ select: typeof publicProductSourceSelect }>;

function serializePublicProduct(product: PublicProductSource) {
  return {
    id: product.id,
    slug: product.slug,
    code: product.code,
    brand: product.brand,
    name: product.name,
    category: product.category,
    description: product.description,
    imageUrl: product.imageUrl,
    retailPrice: product.retailPrice,
    digitalPrice: product.digitalPrice,
    price: product.price,
    oldPrice: product.oldPrice,
    badge: product.badge,
    featured: product.featured,
    active: product.active,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alt,
      position: image.position,
    })),
    availableStock: Math.max(0, product.stock - product.reservedStock),
  };
}

productsRouter.get("/", asyncHandler(async (_req, res) => {
  const products = await prisma.product.findMany({
    select: publicProductSourceSelect,
    orderBy: { createdAt: "desc" },
  });

  res.json({ products: products.map(serializePublicProduct) });
}));

productsRouter.post("/", authenticate, authorize(Role.ADMIN), validateBody(createProductSchema), asyncHandler(async (req, res) => {
  const product = await prisma.product.create({
    data: productData(req.body, true) as Prisma.ProductCreateInput,
  });

  res.status(201).json({
    message: "Producto creado correctamente",
    product,
  });
}));

productsRouter.put("/:id", authenticate, authorize(Role.ADMIN), validateBody(updateProductSchema), asyncHandler(async (req, res) => {
  const id = String(req.params.id);

  const product = await prisma.product.update({
    where: { id },
    data: productData(req.body) as Prisma.ProductUpdateInput,
  });

  res.json({
    message: "Producto actualizado correctamente",
    product,
  });
}));

productsRouter.delete("/:id", authenticate, authorize(Role.ADMIN), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const ownedImages = await prisma.productImage.findMany({ where: { productId: id, storagePath: { not: null } }, select: { storagePath: true } });
  for (const image of ownedImages) if (image.storagePath) await deleteProductImage(image.storagePath);
  await prisma.product.delete({
    where: { id },
  });

  res.json({
    message: "Producto eliminado correctamente",
  });
}));
