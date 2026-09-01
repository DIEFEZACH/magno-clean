import type { RequestHandler } from "express";

export function createCheckoutStatusHandler(enabled: boolean): RequestHandler {
  return (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ checkoutEnabled: enabled });
  };
}

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
