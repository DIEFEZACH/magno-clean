import type { RequestHandler } from "express";

export function createCheckoutAvailabilityGuard(enabled: boolean): RequestHandler {
  return (_req, res, next) => {
    if (enabled) {
      next();
      return;
    }

    res.status(503).json({
      code: "CHECKOUT_DISABLED",
      message: "El checkout no está disponible temporalmente",
    });
  };
}
