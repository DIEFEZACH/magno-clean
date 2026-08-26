import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env";
import { AppError } from "../errors/AppError";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateBody } from "../middleware/validate";
import { checkoutSchema } from "../schemas/orders";
import { createCheckout } from "../services/checkout";

export const checkoutRouter = Router();
const checkoutLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.CHECKOUT_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
});

checkoutRouter.post("/create-preference", checkoutLimiter, validateBody(checkoutSchema), asyncHandler(async (req, res) => {
  const idempotencyKey = req.header("Idempotency-Key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
    throw new AppError(400, "Idempotency-Key es obligatorio y debe tener entre 16 y 128 caracteres");
  }

  const result = await createCheckout(prisma, req.body, idempotencyKey);
  res.status(201).json(result);
}));
