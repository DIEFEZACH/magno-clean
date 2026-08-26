import type { RequestHandler } from "express";
import type { ZodType } from "zod";

export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(Object.assign(new Error("Datos inválidos"), {
        statusCode: 400,
        details: result.error.flatten(),
      }));
      return;
    }

    req.body = result.data;
    next();
  };
}
