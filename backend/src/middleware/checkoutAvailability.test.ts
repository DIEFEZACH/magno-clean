import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { createCheckoutAvailabilityGuard, createCheckoutStatusHandler } from "./checkoutAvailability";

async function withTestServer(
  enabled: boolean,
  downstream: () => void,
  assertion: (url: string) => Promise<void>,
) {
  const app = express();
  app.post("/api/checkout/create-preference", createCheckoutAvailabilityGuard(enabled), (_req, res) => {
    downstream();
    res.sendStatus(204);
  });
  const server = app.listen(0, "127.0.0.1");

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const { port } = server.address() as AddressInfo;
    await assertion(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("el estado público expone únicamente la disponibilidad del checkout", async () => {
  for (const enabled of [false, true]) {
    const app = express();
    app.get("/api/checkout/status", createCheckoutStatusHandler(enabled));
    const server = app.listen(0, "127.0.0.1");

    try {
      await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/api/checkout/status`);

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { checkoutEnabled: enabled });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
});

test("checkout deshabilitado responde 503 antes de cualquier efecto secundario", async () => {
  const effects = {
    orders: 0,
    payments: 0,
    reservations: 0,
    reservedStockUpdates: 0,
    mercadoPagoCalls: 0,
  };

  await withTestServer(false, () => {
    effects.orders += 1;
    effects.payments += 1;
    effects.reservations += 1;
    effects.reservedStockUpdates += 1;
    effects.mercadoPagoCalls += 1;
  }, async (url) => {
    const response = await fetch(`${url}/api/checkout/create-preference`, { method: "POST" });

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      code: "CHECKOUT_DISABLED",
      message: "El checkout no está disponible temporalmente",
    });
  });

  assert.deepEqual(effects, {
    orders: 0,
    payments: 0,
    reservations: 0,
    reservedStockUpdates: 0,
    mercadoPagoCalls: 0,
  });
});

test("checkout habilitado conserva el flujo existente", async () => {
  let downstreamCalls = 0;

  await withTestServer(true, () => {
    downstreamCalls += 1;
  }, async (url) => {
    const response = await fetch(`${url}/api/checkout/create-preference`, { method: "POST" });
    assert.equal(response.status, 204);
  });

  assert.equal(downstreamCalls, 1);
});
