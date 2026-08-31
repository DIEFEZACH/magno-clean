import type { ErrorRequestHandler, RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError";
import { MulterError } from "multer";
import { captureException } from "../lib/errorTracking";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  let statusCode = error.statusCode || 500;
  let message = error.message || "Error interno del servidor";

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") { statusCode = 409; message = "Ya existe un registro con esos datos"; }
    if (error.code === "P2025") { statusCode = 404; message = "Registro no encontrado"; }
    if (error.code === "P2034") { statusCode = 409; message = "Conflicto concurrente; vuelve a intentar"; }
  }
  if (error instanceof MulterError) {
    const inventoryImport = req.originalUrl.startsWith("/api/admin/inventory/import");
    statusCode = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message = error.code === "LIMIT_FILE_SIZE"
      ? inventoryImport ? "El CSV supera el tamaño máximo de 1 MB" : "La imagen supera el tamaño máximo permitido"
      : inventoryImport ? "Archivo CSV inválido" : "Archivo de imagen inválido";
  }

  req.log?.error({ err: error, statusCode }, message);
  if (statusCode >= 500) captureException(error, String(req.id || ""));
  res.status(statusCode).json({
    message: statusCode >= 500 ? "Error interno del servidor" : message,
    ...(error.details ? { errors: error.details } : {}),
  });
};
