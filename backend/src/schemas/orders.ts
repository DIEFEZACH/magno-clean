import { z } from "zod";
import { env } from "../config/env";

const customerSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().regex(/^[+\d][\d\s().-]{7,29}$/, "Teléfono inválido"),
  address: z.string().trim().min(5).max(250),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  zipCode: z.string().trim().min(5).max(12),
  country: z.string().trim().min(2).max(80),
}).strict();

const checkoutItemsSchema = z.array(z.object({
  id: z.string().trim().min(1),
  quantity: z.number().int().positive().max(env.MAX_ITEM_QUANTITY),
}).strict()).min(1).max(env.MAX_ORDER_ITEMS);

export const checkoutSchema = z.object({
  customer: customerSchema,
  items: checkoutItemsSchema,
}).strict();

export const createOrderSchema = z.object({
  customer: z.object({
    fullName: z.string().trim().min(3).max(120),
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    phone: z.string().trim().min(10).max(30),
    address: z.string().trim().min(5).max(250),
    city: z.string().trim().min(2).max(100),
    zipCode: z.string().trim().min(5).max(12),
  }).strict(),
  items: z.array(z.object({
    id: z.string().min(1),
    quantity: z.number().int().positive().max(env.MAX_ITEM_QUANTITY),
  }).passthrough()).min(1).max(env.MAX_ORDER_ITEMS),
  subtotal: z.number().finite().nonnegative().optional(),
}).strict();
