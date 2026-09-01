import { z } from "zod";

const optionalText = z.preprocess((value) => value === undefined || value === "" ? undefined : value, z.string().trim().max(120).optional());
const optionalBoolean = z.preprocess((value) => {
  if (value === undefined || value === "") return undefined;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
}, z.boolean().optional());

export const catalogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
  search: optionalText,
  category: optionalText,
  brand: optionalText,
  featured: optionalBoolean,
  sort: z.enum(["featured", "name-asc", "name-desc", "price-asc", "price-desc", "newest", "oldest"]).default("featured"),
}).strict();

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
