import { Router } from "express";
import { AppError } from "../errors/AppError";
import { asyncHandler } from "../middleware/asyncHandler";
import { catalogQuerySchema } from "../schemas/catalog";
import { createCatalogService } from "../services/catalog";

export const catalogRouter = Router();
const catalog = createCatalogService();
const cache = "public, max-age=60, stale-while-revalidate=300";

catalogRouter.get("/", asyncHandler(async (req,res)=>{
  const parsed=catalogQuerySchema.safeParse(req.query);
  if(!parsed.success)throw new AppError(400,"Parámetros de catálogo inválidos",parsed.error.flatten());
  res.setHeader("Cache-Control",cache);res.json(await catalog.list(parsed.data));
}));

catalogRouter.get("/:slug", asyncHandler(async (req,res)=>{
  const slug=String(req.params.slug||"").trim();if(!slug||slug.length>200)throw new AppError(400,"Slug inválido");
  const result=await catalog.detail(slug);if(!result)throw new AppError(404,"Elemento de catálogo no encontrado");
  res.setHeader("Cache-Control",cache);res.json(result);
}));
