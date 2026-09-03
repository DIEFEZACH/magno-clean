import { Router } from "express";
import { AppError } from "../errors/AppError";
import { asyncHandler } from "../middleware/asyncHandler";
import { catalogQuerySchema } from "../schemas/catalog";
import { createCatalogService } from "../services/catalog";

export const CATALOG_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

export function createCatalogRouter(catalog:ReturnType<typeof createCatalogService>=createCatalogService()) {
  const router = Router();
  router.get("/", asyncHandler(async (req,res)=>{
    const parsed=catalogQuerySchema.safeParse(req.query);
    if(!parsed.success)throw new AppError(400,"Parámetros de catálogo inválidos",parsed.error.flatten());
    res.setHeader("Cache-Control",CATALOG_CACHE_CONTROL);res.json(await catalog.list(parsed.data));
  }));

  router.get("/:slug", asyncHandler(async (req,res)=>{
    const slug=String(req.params.slug||"").trim();if(!slug||slug.length>200)throw new AppError(400,"Slug inválido");
    const result=await catalog.detail(slug);if(!result)throw new AppError(404,"Elemento de catálogo no encontrado");
    res.setHeader("Cache-Control",CATALOG_CACHE_CONTROL);res.json(result);
  }));
  return router;
}

export const catalogRouter = createCatalogRouter();
