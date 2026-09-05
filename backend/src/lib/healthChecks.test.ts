import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import path from "node:path";
import test, { type TestContext } from "node:test";
import express from "express";
import { createHealthChecks } from "./healthChecks";

// Exercise the real index/middleware order, not a second copy of the app.
// Only transport binding and Prisma/telemetry are replaced in this child.
const fixture = `
const express = require('express');
const listen = express.application.listen;
express.application.listen = function (_port, callback) {
  const server = listen.call(this, 0, '127.0.0.1', callback);
  server.once('listening', () => process.send({ kind: 'listening', port: server.address().port, trustProxy: this.get('trust proxy') }));
  return server;
};
const { prisma } = require('./dist/lib/prisma');
let mode = 'ready';
process.on('message', message => { mode = message.mode; process.send({ kind: 'mode', mode }); });
prisma.$transaction = async (callback, options) => {
  process.send({ kind: 'probe', options });
  if (mode === 'fail') throw new Error('private fixture DB failure');
  if (mode === 'hang') return new Promise(() => {});
  return callback({
    $executeRaw: async (sql) => { process.send({ kind: 'sql', text: sql.join('?') }); return 0; },
    $queryRaw: async (sql) => { process.send({ kind: 'sql', text: sql.join('?') }); return [{ value: 1 }]; },
  });
};
prisma.$disconnect = async () => { process.send({ kind: 'disconnect' }); };
require('./dist/lib/errorTracking').flushErrorTracking = async () => { process.send({ kind: 'flush' }); };
require('./dist/index');
`;

async function appFixture(t: TestContext, limit = 2, authLimit = 2) {
  const child = spawn(process.execPath, ["-e", fixture], {
    cwd: path.resolve(__dirname, "../.."),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test", PORT: "4000",
      DATABASE_URL: "postgresql://ci:ci@127.0.0.1:1/health_fixture",
      CORS_ORIGIN: "https://ci.example.invalid",
      JWT_ACCESS_SECRET: "ci-only-not-a-secret-000000000000000000000000",
      JWT_ACCESS_EXPIRES_SECONDS: "900", REFRESH_TOKEN_EXPIRES_DAYS: "7",
      ADMIN_NAME: "CI Admin", ADMIN_EMAIL: "admin@ci.example.invalid", ADMIN_PASSWORD: "ci-only-password",
      MERCADO_PAGO_ACCESS_TOKEN: "ci-only-token", MERCADO_PAGO_WEBHOOK_SECRET: "ci-only-webhook-secret",
      DEFAULT_CURRENCY: "MXN", MAX_ORDER_ITEMS: "100", MAX_ITEM_QUANTITY: "100",
      SUPABASE_URL: "https://ci.example.invalid", SUPABASE_SERVICE_ROLE_KEY: "ci-only-service-role-key",
      RATE_LIMIT_MAX: String(limit), RATE_LIMIT_WINDOW_MS: "60000", AUTH_RATE_LIMIT_MAX: String(authLimit),
      // No local/staging/production environment may fill in missing values.
      DOTENV_CONFIG_PATH: path.join(__dirname, "nonexistent-test-env"),
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const messages: Array<Record<string, any>> = [];
  child.on("message", (message) => messages.push(message as Record<string, any>));
  // Consume logs without leaking them to the test output.
  child.stdout.resume(); child.stderr.resume();
  const exited = once(child, "exit");
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await exited;
  });
  async function waitFor(kind: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      while (true) {
        const existing = messages.find((message) => message.kind === kind);
        if (existing) return existing;
        await once(child, "message", { signal: controller.signal });
      }
    } finally { clearTimeout(timer); }
  }
  const listening = await waitFor("listening");
  assert.equal(listening.trustProxy, 1);
  const origin = `http://127.0.0.1:${listening.port}`;
  const request = (pathname: string, init?: RequestInit) => fetch(origin + pathname, { ...init, signal: AbortSignal.timeout(10000) });
  return {
    request, messages, child, exited,
    async mode(value: string) {
      messages.splice(0, messages.length, ...messages.filter((message) => message.kind !== "mode"));
      child.send({ mode: value });
      await waitFor("mode");
    },
  };
}

test("health: real app GET/HEAD do not consume commercial quota and survive 429", async (t) => {
  const app = await appFixture(t);
  for (const route of ["/health", "/health/", "/HEALTH", "/health?probe=1"]) {
    const response = await app.request(route, { headers: { "X-Request-Id": "health-fixture-1" } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
    assert.equal(response.headers.get("x-request-id"), "health-fixture-1");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("ratelimit-remaining"), null);
  }
  assert.equal((await app.request("/")).headers.get("ratelimit-remaining"), "1");
  const head = await app.request("/health", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.ok(head.headers.get("x-request-id"));
  assert.equal(head.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await app.request("/")).status, 200);
  assert.equal((await app.request("/")).status, 429);
  assert.equal((await app.request("/health")).status, 200);
  assert.equal((await app.request("/health", { method: "HEAD" })).status, 200);
  assert.equal(app.messages.filter((message) => message.kind === "probe").length, 0);
});

test("health: similar paths, wrong methods and forged probe headers do not bypass limiter", async (t) => {
  const app = await appFixture(t, 1);
  assert.equal((await app.request("/")).status, 200);
  for (const route of ["/healthz", "/health/admin", "/healthcheck", "/api/health", "/health%2Fadmin", "//health"]) {
    const response = await app.request(route, { headers: {
      "User-Agent": "Render/1.0 (render-health-check)", "X-Render-Health-Check": "1",
      "X-Health-Check": "true", "X-Forwarded-Host": "health.internal",
    } });
    assert.equal(response.status, 429, route);
  }
  for (const method of ["POST", "PUT", "DELETE"]) {
    assert.equal((await app.request("/health", { method })).status, 429, method);
  }
  assert.equal((await app.request("/ready")).status, 429, "ready remains subject to the global limiter");
  assert.equal((await app.request("/health", { headers: { Origin: "https://unauthorized.example.invalid" } })).status, 403);
});

test("health: login and refresh still share their real auth rate limit", async (t) => {
  const app = await appFixture(t, 100, 2);
  const json = { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" };
  assert.equal((await app.request("/api/auth/login", json)).status, 400);
  assert.equal((await app.request("/api/auth/refresh", json)).status, 401);
  const limited = await app.request("/api/auth/refresh", json);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("cache-control"), "no-store");
  assert.equal((await app.request("/api/auth/login", json)).status, 429);
  assert.equal((await app.request("/health")).status, 200);
  assert.equal(app.messages.filter((message) => message.kind === "probe").length, 0);
});

test("ready: real app keeps DB 200/503, bounded transaction and sanitized security headers", async (t) => {
  const app = await appFixture(t, 20);
  const ready = await app.request("/ready");
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { status: "ready" });
  assert.equal(ready.headers.get("cache-control"), "no-store");
  assert.ok(ready.headers.get("x-request-id"));
  assert.equal(ready.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(app.messages.find((message) => message.kind === "probe").options, { maxWait: 1000, timeout: 1500 });
  assert.deepEqual(app.messages.filter((message) => message.kind === "sql").map((message) => message.text), ["SET LOCAL statement_timeout = '1000ms'", "SELECT 1"]);
  await app.mode("fail");
  const unavailable = await app.request("/ready");
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { status: "not_ready" });
  assert.equal(unavailable.headers.get("cache-control"), "no-store");
  assert.ok(unavailable.headers.get("x-request-id"));
  await app.mode("ready");
  assert.equal((await app.request("/ready")).status, 200);
});

test("ready: hanging probe returns 503 within budget; concurrent/repeated calls cannot queue DB work", async (t) => {
  const app = await appFixture(t, 50);
  await app.mode("hang");
  const start = Date.now();
  const replies = await Promise.all([app.request("/ready"), app.request("/ready"), app.request("/ready")]);
  assert.ok(Date.now() - start < 6000);
  for (const reply of replies) assert.equal(reply.status, 503);
  assert.equal(app.messages.filter((message) => message.kind === "probe").length, 1);
  assert.equal((await app.request("/health")).status, 200);
  const lateStart = Date.now();
  const later = await Promise.all(Array.from({ length: 20 }, () => app.request("/ready")));
  for (const reply of later) assert.equal(reply.status, 503);
  assert.ok(Date.now() - lateStart < 1500, "reuse the settled deadline instead of waiting another three seconds");
  assert.equal(app.messages.filter((message) => message.kind === "probe").length, 1);
});

test("health: shutdown rejects health/HEAD and readiness without DB work", async () => {
  let closing = false;
  let probes = 0;
  const checks = createHealthChecks(async () => { probes += 1; }, () => closing);
  const app = express();
  app.get("/health", checks.health); app.get("/ready", checks.ready);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(origin + "/health")).status, 200);
    closing = true;
    const response = await fetch(origin + "/health");
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "shutting_down" });
    const head = await fetch(origin + "/health", { method: "HEAD" });
    assert.equal(head.status, 503); assert.equal(await head.text(), "");
    assert.equal((await fetch(origin + "/ready")).status, 503);
    assert.equal(probes, 0);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("ready: shutdown beginning during a successful probe cannot report ready", async () => {
  let closing = false;
  let release: () => void;
  let started: () => void;
  const running = new Promise<void>((resolve) => { started = resolve; });
  const checks = createHealthChecks(() => new Promise<void>((resolve) => { release = resolve; started(); }), () => closing);
  const app = express(); app.get("/ready", checks.ready);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const response = fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/ready`);
    await running;
    closing = true; release();
    const result = await response;
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { status: "not_ready" });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("ready: a probe completing after its HTTP deadline releases the single-flight for recovery", async () => {
  let release: () => void;
  let probes = 0;
  const checks = createHealthChecks(() => {
    probes += 1;
    return probes === 1 ? new Promise<void>((resolve) => { release = resolve; }) : Promise.resolve();
  }, () => false);
  const app = express(); app.get("/ready", checks.ready);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(origin + "/ready")).status, 503);
    assert.equal((await fetch(origin + "/ready")).status, 503);
    assert.equal(probes, 1);
    release();
    assert.equal((await fetch(origin + "/ready")).status, 200);
    assert.equal(probes, 2);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("health: real SIGTERM still closes server, disconnects DB and flushes telemetry once", async (t) => {
  const app = await appFixture(t);
  app.child.kill("SIGTERM");
  const [code, signal] = await app.exited;
  assert.equal(code, 0); assert.equal(signal, null);
  assert.equal(app.messages.filter((message) => message.kind === "disconnect").length, 1);
  assert.equal(app.messages.filter((message) => message.kind === "flush").length, 1);
  await assert.rejects(() => app.request("/health"));
});
