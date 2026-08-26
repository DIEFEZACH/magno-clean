import { OrderStatus } from "@prisma/client";
import { z } from "zod";

export const updateOrderStatusSchema = z.object({
  status: z.enum(OrderStatus),
  reason: z.string().trim().max(500).optional(),
}).strict();

export const orderNoteSchema = z.object({ content: z.string().trim().min(2).max(2000) }).strict();

export const productActionSchema = z.object({
  active: z.boolean().optional(),
  featured: z.boolean().optional(),
}).strict().refine((value) => value.active !== undefined || value.featured !== undefined, "Acción vacía");

export const productImagesSchema = z.object({
  images: z.array(z.object({ url: z.string().url(), alt: z.string().trim().max(200).nullable().optional() }).strict()).max(20),
}).strict();

export const importProductsSchema = z.object({ products: z.array(z.object({
  code: z.string().trim().min(1).max(100), slug: z.string().trim().min(1).max(200),
  brand: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(120), description: z.string().trim().min(1).max(5000),
  imageUrl: z.string().url().nullable().optional(), price: z.number().finite().nonnegative(),
  oldPrice: z.number().finite().nonnegative().nullable().optional(), featured: z.boolean(), active: z.boolean(),
}).strict()).min(1).max(1000) }).strict();

export const companySettingsSchema = z.object({
  companyName: z.string().trim().min(2).max(150), logoUrl: z.string().url().nullable().optional(),
  email: z.string().email().nullable().optional(), phone: z.string().max(50).nullable().optional(),
  website: z.string().url().nullable().optional(), fiscalName: z.string().max(200).nullable().optional(),
  taxId: z.string().max(50).nullable().optional(), fiscalAddress: z.string().max(500).nullable().optional(),
  facebookUrl: z.string().url().nullable().optional(), instagramUrl: z.string().url().nullable().optional(),
  taxRate: z.number().min(0).max(100), shippingFee: z.number().nonnegative(), freeShippingMin: z.number().nonnegative().nullable().optional(),
}).strict();
