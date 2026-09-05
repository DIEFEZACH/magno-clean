import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { revokeRefreshToken, rotateRefreshToken } from "./auth";

const token = "a".repeat(64);
const user = { id: "auth-fixture", email: "test@example.invalid", name: "Fixture", role: "ADMIN", active: true };
const stored = () => ({ id: "refresh-fixture", userId: user.id, user, expiresAt: new Date(Date.now() + 60000), revokedAt: null });
const is401 = (error: unknown) => error instanceof AppError && error.statusCode === 401;

test("missing, empty and malformed refresh tokens return 401 before any Prisma call", async () => {
  const original = prisma.refreshToken.findUnique;
  let calls = 0;
  prisma.refreshToken.findUnique = (async () => { calls++; throw new Error("Must not query"); }) as unknown as typeof original;
  try {
    for (const value of [undefined, null, "", " ", "short", "a".repeat(65), "!".repeat(64), [], {}]) {
      await assert.rejects(() => rotateRefreshToken(value), is401);
    }
    assert.equal(calls, 0);
  } finally { prisma.refreshToken.findUnique = original; }
});

test("unknown, revoked, expired and inactive refresh sessions return 401", async () => {
  const original = prisma.refreshToken.findUnique;
  try {
    for (const value of [null, { ...stored(), revokedAt: new Date() }, { ...stored(), expiresAt: new Date(0) }, { ...stored(), user: { ...user, active: false } }]) {
      prisma.refreshToken.findUnique = (async () => value) as unknown as typeof original;
      await assert.rejects(() => rotateRefreshToken(token), is401);
    }
  } finally { prisma.refreshToken.findUnique = original; }
});

test("infrastructure failures remain infrastructure failures, not invalid credentials", async () => {
  const original = prisma.refreshToken.findUnique;
  const infrastructureError = new Error("Database unavailable fixture");
  prisma.refreshToken.findUnique = (async () => { throw infrastructureError; }) as unknown as typeof original;
  try { await assert.rejects(() => rotateRefreshToken(token), (error) => error === infrastructureError); }
  finally { prisma.refreshToken.findUnique = original; }
});

test("rotation atomically claims one token and creates exactly one successor", async () => {
  const originalFind = prisma.refreshToken.findUnique;
  const originalTransaction = prisma.$transaction;
  let claimed = false;
  let creates = 0;
  const tx = { refreshToken: {
    updateMany: async (args: { where: Record<string, unknown> }) => {
      assert.deepEqual(args.where.revokedAt, null);
      assert.ok(args.where.expiresAt);
      if (claimed) return { count: 0 };
      claimed = true;
      return { count: 1 };
    },
    create: async () => { creates++; },
  } };
  prisma.refreshToken.findUnique = (async () => stored()) as unknown as typeof originalFind;
  prisma.$transaction = (async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)) as unknown as typeof originalTransaction;
  try {
    const results = await Promise.allSettled([rotateRefreshToken(token), rotateRefreshToken(token)]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(rejected?.status === "rejected" && is401(rejected.reason));
    assert.equal(creates, 1);
    const fulfilled = results.find((result) => result.status === "fulfilled");
    assert.ok(fulfilled?.status === "fulfilled");
    assert.equal(fulfilled.value.refresh.token.length, 64);
    assert.notEqual(fulfilled.value.refresh.token, token);
  } finally { prisma.refreshToken.findUnique = originalFind; prisma.$transaction = originalTransaction; }
});

test("logout with missing or malformed cookie is safe and makes no Prisma call", async () => {
  const original = prisma.refreshToken.updateMany;
  let calls = 0;
  prisma.refreshToken.updateMany = (async () => { calls++; return { count: 0 }; }) as typeof original;
  try {
    for (const value of [undefined, null, "", "invalid", {}]) await revokeRefreshToken(value);
    assert.equal(calls, 0);
    await revokeRefreshToken(token);
    await revokeRefreshToken(token);
    assert.equal(calls, 2);
  } finally { prisma.refreshToken.updateMany = original; }
});
