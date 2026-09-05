import { describe, expect, it, vi } from "vitest";
import { buildPublications, emptyPublicationFilters, escapePublicationCsv, filterPublications, loadPublicationUniverse, publicationEditPath, publicationsCsv, type PublicationFamily, type PublicationProduct } from "./adminPublications";

const family: PublicationFamily = { id: "f1", slug: "familia-naranja", name: "Familia Naranja", brand: "Magno", category: "Limpieza", description: "Descripción familiar", imageUrl: null, active: true, variantType: "Presentación" };
const product = (id: string, extra: Partial<PublicationProduct> = {}): PublicationProduct => ({ id, slug: `producto-${id}`, code: `SKU-${id}`, name: `Producto ${id}`, brand: "Magno", category: "Limpieza", description: "Descripción existente", imageUrl: "https://images.example/product.webp", price: 100, active: true, familyId: null, variantLabel: null, variantSortOrder: 0, ...extra });
const fixture = () => buildPublications([
  product("1", { familyId: family.id, variantLabel: "1 L", variantSortOrder: 1 }),
  product("2", { familyId: family.id, variantLabel: "5 L", price: 350, variantSortOrder: 2 }),
  product("3", { familyId: family.id, variantLabel: "20 L", price: 800, variantSortOrder: 3, active: false }),
  product("4", { name: "Ácido cítrico", imageUrl: null, description: "" }),
  product("5", { active: false }),
], [family]);
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe("read-only publications universe", () => {
  it("groups each family once without duplicating its SKU and preserves inactive singles", () => {
    const items = fixture();
    expect(items).toHaveLength(3);
    expect(items.filter((item) => item.type === "FAMILY")).toHaveLength(1);
    const grouped = items.find((item) => item.type === "FAMILY")!;
    expect(grouped.products.map((item) => item.code)).toEqual(["SKU-1", "SKU-2", "SKU-3"]);
    expect(grouped.priceFrom).toBe(100); expect(grouped.priceTo).toBe(350);
    expect(grouped.imageUrl).toBe("https://images.example/product.webp");
    expect(items.find((item) => item.id === "5")?.publicVisible).toBe(false);
  });
  it("does not announce a family with no active variants as publicly visible", () => {
    const [item] = buildPublications([product("1", { familyId: "f1", active: false })], [family]);
    expect(item.publicVisible).toBe(false); expect(item.active).toBe(true);
    expect(item.checks.find((check) => check.label === "Presentaciones")?.ready).toBe(false);
  });
  it("does not silently drop orphaned family associations", () => {
    expect(() => buildPublications([product("1", { familyId: "missing" })], [])).toThrow(/asociación/);
  });
  it("searches all products, variants, codes, brand, names and accents", () => {
    const items = fixture();
    for (const search of ["naranja", "SKU-2", "5 L"]) expect(filterPublications(items, { ...emptyPublicationFilters, search }).map((item) => item.id)).toEqual(["f1"]);
    expect(filterPublications(items, { ...emptyPublicationFilters, search: "acido citrico" }).map((item) => item.id)).toEqual(["4"]);
    expect(filterPublications(items, { ...emptyPublicationFilters, search: "magno" })).toHaveLength(3);
  });
  it("filters active, inactive, family, individual, missing images and descriptions", () => {
    const items = fixture();
    expect(filterPublications(items, { ...emptyPublicationFilters, status: "inactive" }).map((item) => item.id)).toEqual(["5"]);
    expect(filterPublications(items, { ...emptyPublicationFilters, status: "active" })).toHaveLength(2);
    expect(filterPublications(items, { ...emptyPublicationFilters, type: "FAMILY" })).toHaveLength(1);
    expect(filterPublications(items, { ...emptyPublicationFilters, type: "PRODUCT" })).toHaveLength(2);
    for (const missing of ["image", "description", "incomplete"] as const) expect(filterPublications(items, { ...emptyPublicationFilters, missing }).map((item) => item.id)).toEqual(["4"]);
  });
  it("does not consider zero, negative or invalid prices complete", () => {
    for (const price of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const [item] = buildPublications([product("1", { price })], []);
      expect(item.priceFrom).toBeNull(); expect(item.checks.find((check) => check.label === "Precio válido")?.ready).toBe(false);
    }
  });
  it("loads every page of both collections instead of claiming a first page is the universe", async () => {
    const get = vi.fn(async (path: string) => {
      const page = Number(new URL(path, "https://test.example").searchParams.get("page"));
      if (path.includes("product-families")) return json({ families: page === 1 ? [family] : [{ ...family, id: "f2", name: "Second family" }], pagination: { page, total: 2, pages: 2 } });
      return json({ products: [{ ...product(String(page)), ...(page === 2 ? { costPrice: 50, stock: 100, reservedStock: 10, storagePath: "private", sourceTechnicalData: {} } : {}) }], pagination: { page, total: 3, pages: 3 } });
    });
    const result = await loadPublicationUniverse(get);
    expect(result.products).toHaveLength(3); expect(result.families).toHaveLength(2); expect(get).toHaveBeenCalledTimes(5);
    expect(get.mock.calls.every(([path]) => path.includes("pageSize=100"))).toBe(true);
    for (const key of ["costPrice", "stock", "reservedStock", "storagePath", "sourceTechnicalData"]) expect(JSON.stringify(result)).not.toContain(`"${key}"`);
    expect(get.mock.calls.some(([path]) => path.includes("website-content"))).toBe(false);
  });
  it("rejects partial results, duplicate rows, changing totals and authorization errors", async () => {
    for (const scenario of ["partial", "duplicate", "changed", "forbidden"]) {
      const get = async (path: string) => {
        if (path.includes("product-families")) return json({ families: [], pagination: { page: 1, total: 0, pages: 0 } });
        if (scenario === "forbidden") return json({}, 403);
        const page = Number(new URL(path, "https://test.example").searchParams.get("page"));
        return json({ products: [product(scenario === "duplicate" ? "1" : String(page))], pagination: { page, total: scenario === "changed" && page === 2 ? 3 : 2, pages: scenario === "partial" ? 1 : 2 } });
      };
      await expect(loadPublicationUniverse(get)).rejects.toThrow();
    }
  });
  it("uses ProductImage fallback but rejects unsafe image URLs", async () => {
    const get = async (path: string) => path.includes("product-families") ? json({ families: [], pagination: { page: 1, total: 0, pages: 0 } }) : json({ products: [{ ...product("1"), imageUrl: "javascript:alert(1)", images: [{ url: "https://images.example/gallery.webp" }] }], pagination: { page: 1, total: 1, pages: 1 } });
    expect((await loadPublicationUniverse(get)).products[0].imageUrl).toBe("https://images.example/gallery.webp");
  });
});

describe("publication export and editor links", () => {
  it("uses existing editors with encoded identifiers", () => {
    const items = fixture();
    expect(publicationEditPath(items.find((item) => item.type === "FAMILY")!)).toBe("/admin/product-families?family=f1&edit=1");
    expect(publicationEditPath(items.find((item) => item.id === "4")!)).toBe("/admin/products/4/edit");
  });
  it("quotes commas, quotes, line breaks and neutralizes text spreadsheet formulas", () => {
    expect(escapePublicationCsv('Cleaner, "fresh"\nsecond line')).toBe('"Cleaner, ""fresh""\nsecond line"');
    for (const value of ["=HYPERLINK(1)", " +SUM(1)", "-1+2", "@IMPORT(1)", "\tcommand", "\rdata", "\nline"]) expect(escapePublicationCsv(value).startsWith('"\'')).toBe(true);
    expect(escapePublicationCsv(123.5)).toBe("123.5"); expect(escapePublicationCsv(Number.NaN)).toBe("");
  });
  it("exports only selected view-model fields, no inventory, private prices, identifiers or editorial internals", () => {
    const items = fixture(); const csv = publicationsCsv([items.find((item) => item.id === "4")!]);
    expect(csv.startsWith("\uFEFF")).toBe(true); expect(csv).toContain("Ácido cítrico"); expect(csv).toContain("Sin evaluar");
    expect(csv).not.toContain("Familia Naranja");
    for (const key of ["costPrice", "wholesalePrice", "stock", "reservedStock", "sourceTechnicalData", "createdBy", "familyId"]) expect(csv).not.toContain(key);
    expect(csv.split("\r\n")).toHaveLength(3);
  });
});
