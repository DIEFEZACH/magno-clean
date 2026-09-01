import assert from "node:assert/strict";
import test from "node:test";
import { createProductFamilySchema, linkProductVariantSchema, updateProductFamilySchema, updateProductVariantSchema } from "./admin";

test("acepta una familia estructural válida", () => {
  const result = createProductFamilySchema.safeParse({
    slug: "chazam",
    name: "CHAZAM",
    brand: "Magno Clean",
    category: "Limpieza",
    description: "Contenido estructural pendiente de aprobación.",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.variantType, "Presentación");
    assert.equal(result.data.alwaysShowAsFamily, false);
  }
});

test("rechaza slugs, etiquetas y órdenes inválidos", () => {
  assert.equal(createProductFamilySchema.safeParse({ slug: "CHAZAM 1", name: "CHAZAM", brand: "Magno Clean", category: "Limpieza", description: "Descripción" }).success, false);
  assert.equal(linkProductVariantSchema.safeParse({ productId: "product-1", variantLabel: " ", variantSortOrder: 0 }).success, false);
  assert.equal(linkProductVariantSchema.safeParse({ productId: "product-1", variantLabel: "1 L", variantSortOrder: -1 }).success, false);
});

test("rechaza actualizaciones vacías", () => {
  assert.equal(updateProductFamilySchema.safeParse({}).success, false);
  assert.equal(updateProductVariantSchema.safeParse({}).success, false);
});

test("confirmMove nunca se activa implícitamente", () => {
  const result = linkProductVariantSchema.parse({ productId: "product-1", variantLabel: "5 L", variantSortOrder: 2 });
  assert.equal(result.confirmMove, false);
});
