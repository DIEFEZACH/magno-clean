import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateBody } from "../middleware/validate";
import { loginSchema } from "../schemas/auth";
import { login, publicUser, REFRESH_COOKIE, revokeRefreshToken, rotateRefreshToken } from "../services/auth";
import { prisma } from "../lib/prisma";

export const authRouter = Router();
authRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: env.AUTH_RATE_LIMIT_MAX, standardHeaders: true, legacyHeaders: false });
const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "strict" as const, path: "/api/auth" };

authRouter.post("/login", authLimiter, validateBody(loginSchema), asyncHandler(async (req, res) => {
  const result = await login(req.body.email, req.body.password);
  res.cookie(REFRESH_COOKIE, result.refresh.token, { ...cookieOptions, expires: result.refresh.expiresAt });
  res.json({ message: "Sesión iniciada correctamente", accessToken: result.accessToken, user: publicUser(result.user) });
}));

authRouter.post("/refresh", authLimiter, asyncHandler(async (req, res) => {
  const result = await rotateRefreshToken(req.cookies?.[REFRESH_COOKIE]);
  res.cookie(REFRESH_COOKIE, result.refresh.token, { ...cookieOptions, expires: result.refresh.expiresAt });
  res.json({ accessToken: result.accessToken, user: publicUser(result.user) });
}));

authRouter.post("/logout", asyncHandler(async (req, res) => {
  await revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.json({ message: "Sesión cerrada correctamente" });
}));

authRouter.get("/me", authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !user.active) return res.status(401).json({ message: "Usuario no disponible" });
  res.json({ user: publicUser(user) });
}));
