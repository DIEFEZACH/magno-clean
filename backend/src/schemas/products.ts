import { z } from "zod";

const nullableText = z.string().trim().max(500).nullable().optional();
const price = z.number().finite().nonnegative();

const productFields = {
  slug: z.string().trim().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  code: z.string().trim().min(1).max(100).optional(),
  brand: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(5000),
  imageUrl: z.string().trim().url().nullable().optional(),
  costPrice: price.optional(),
  unitPrice: price.optional(),
  wholesalePrice: price.optional(),
  retailPrice: price.optional(),
  digitalPrice: price.optional(),
  price,
  oldPrice: price.nullable().optional(),
  badge: nullableText,
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
};

export const createProductSchema = z.object(productFields).strict();
export const updateProductSchema = z.object(productFields).partial().strict().refine(
  (data) => Object.keys(data).length > 0,
  "Debe enviarse al menos un campo",
);

export const adjustInventorySchema = z.object({
  newStock: z.number().int().nonnegative(),
  reason: z.string().trim().min(3).max(500),
}).strict();
