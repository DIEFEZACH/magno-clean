import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { prisma } from "../lib/prisma";
import { productsRouter } from "./products";

const publicProduct = {
  id: "product-fixture",
  slug: "producto-fixture",
  code: "FIX-1",
  brand: "Magno Clean",
  name: "Producto fixture",
  category: "Fixture",
  description: "Descripción pública",
  imageUrl: "https://images.example.test/product.webp",
  unitPrice: 100,
  retailPrice: 120,
  digitalPrice: 110,
  price: 110,
  oldPrice: 130,
  badge: null,
  featured: false,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  images: [{ id: "image-fixture", url: "https://images.example.test/product.webp", alt: "Producto fixture", position: 0 }],
};

async function publicResponse(rows: Array<Record<string, unknown>>) {
  let query: { select?: Record<string, unknown>; orderBy?: unknown } | undefined;
  const originalFindMany = prisma.product.findMany;
  prisma.product.findMany = (async (args: typeof query) => {
    query = args;
    // Emulate Prisma's select: an accidental private selection reaches the HTTP response.
    return rows.map((row) => Object.fromEntries(
      Object.entries(row).filter(([key]) => Boolean(args?.select?.[key])),
    ));
  }) as typeof originalFindMany;

  const app = express();
  app.use("/api/products", productsRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/products`);
    assert.equal(response.status, 200);
    return { body: await response.json(), query };
  } finally {
    prisma.product.findMany = originalFindMany;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("GET /api/products no selecciona ni expone precios privados y conserva el contrato público", async () => {
  const { body, query } = await publicResponse([{
    ...publicProduct,
    wholesalePrice: 75,
    costPrice: 50,
    stock: 10,
    reservedStock: 2,
    familyId: "family-private",
    sourceHash: "private-fixture-hash",
    audit: { actor: "private-fixture" },
  }]);

  for (const key of ["wholesalePrice", "costPrice", "familyId", "sourceHash", "audit"]) {
    assert.equal(query?.select?.[key], undefined, `${key} must not be selected`);
    assert.equal(key in body.products[0], false, `${key} must not be public`);
  }
  assert.equal("stock" in body.products[0], false);
  assert.equal("reservedStock" in body.products[0], false);
  assert.deepEqual(body, { products: [{ ...publicProduct, availableStock: 8 }] });
  assert.deepEqual(query?.orderBy, { createdAt: "desc" });
  assert.deepEqual(query?.select?.images, {
    select: { id: true, url: true, alt: true, position: true },
    orderBy: { position: "asc" },
  });
});

test("GET /api/products conserva la disponibilidad acotada a cero sin exponer reservas", async () => {
  const { body } = await publicResponse([{ ...publicProduct, stock: 1, reservedStock: 4, wholesalePrice: 75 }]);
  assert.deepEqual(body, { products: [{ ...publicProduct, availableStock: 0 }] });
});

test("GET /api/products conserva la respuesta vacía", async () => {
  const { body } = await publicResponse([]);
  assert.deepEqual(body, { products: [] });
});
