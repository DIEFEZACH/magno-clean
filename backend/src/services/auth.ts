import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { User } from "@prisma/client";
import { env } from "../config/env";
import { AppError } from "../errors/AppError";
import { prisma } from "../lib/prisma";

export const REFRESH_COOKIE = "magno_refresh";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Refresh tokens are opaque randomBytes(48).toString("base64url") values.
// Reject malformed input before hashing it or making any database call.
function isRefreshToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{64}$/.test(token);
}

function invalidRefresh() {
  return new AppError(401, "Sesión inválida o expirada");
}

export function publicUser(user: User) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active };
}

export function createAccessToken(user: User) {
  return jwt.sign(
    { email: user.email, role: user.role, type: "access" },
    env.JWT_ACCESS_SECRET,
    { subject: user.id, expiresIn: env.JWT_ACCESS_EXPIRES_SECONDS },
  );
}

export async function createRefreshToken(userId: string) {
  const token = crypto.randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRES_DAYS * 86400000);
  await prisma.refreshToken.create({ data: { tokenHash: hashToken(token), expiresAt, userId } });
  return { token, expiresAt };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, "Credenciales incorrectas");
  }

  const refresh = await createRefreshToken(user.id);
  return { user, accessToken: createAccessToken(user), refresh };
}

export async function rotateRefreshToken(token: unknown) {
  if (!isRefreshToken(token)) throw invalidRefresh();
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!stored || stored.revokedAt || stored.expiresAt <= new Date() || !stored.user.active) {
    throw invalidRefresh();
  }

  const refresh = await prisma.$transaction(async (tx) => {
    // Only one request may consume a refresh token, even across tabs or servers.
    const claimed = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalidRefresh();
    const nextToken = crypto.randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRES_DAYS * 86400000);
    await tx.refreshToken.create({ data: { tokenHash: hashToken(nextToken), expiresAt, userId: stored.userId } });
    return { token: nextToken, expiresAt };
  });

  return { user: stored.user, accessToken: createAccessToken(stored.user), refresh };
}

export async function revokeRefreshToken(token: unknown) {
  if (!isRefreshToken(token)) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
