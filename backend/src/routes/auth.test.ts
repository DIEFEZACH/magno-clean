import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import { authRouter } from "./auth";
import { errorHandler } from "../middleware/errorHandler";
import { prisma } from "../lib/prisma";

test("auth HTTP: absent/invalid cookie is 401, no-store; logout is idempotent with matching cookie path", async () => {
  const app = express();
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const cookie of ["", "magno_refresh=", "magno_refresh=invalid"]) {
      const response = await fetch(`${origin}/api/auth/refresh`, { method: "POST", headers: { Cookie: cookie } });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { message: "Sesión inválida o expirada" });
    }
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`${origin}/api/auth/logout`, { method: "POST" });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const cookie = response.headers.get("set-cookie")!;
      assert.match(cookie, /Path=\/api\/auth/);
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Strict/);
      assert.doesNotMatch(cookie, /Domain=/);
    }
    const original = prisma.refreshToken.findUnique;
    prisma.refreshToken.findUnique = (async () => { throw new Error("internal fixture details"); }) as unknown as typeof original;
    try {
      const response = await fetch(`${origin}/api/auth/refresh`, { method: "POST", headers: { Cookie: `magno_refresh=${"a".repeat(64)}` } });
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { message: "Error interno del servidor" });
      assert.equal(response.headers.get("cache-control"), "no-store");
    } finally { prisma.refreshToken.findUnique = original; }
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
