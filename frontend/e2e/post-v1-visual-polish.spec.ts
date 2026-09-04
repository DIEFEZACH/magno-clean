import { expect, test, type Page } from "@playwright/test";

// UI-only fixtures. Never authenticate against staging or create real orders/users.
const order = {
  id: "cuid12345678901234567890123",
  customerName: "Cliente de prueba",
  customerEmail: "fixture@example.test",
  total: 1234.56,
  status: "PROCESSING",
  createdAt: "2026-01-01T12:00:00Z",
  payment: { status: "APPROVED" },
  _count: { items: 3 },
};

async function mockAdmin(page: Page) {
  await page.route("http://api.media-b.test/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/auth/refresh") return route.fulfill({ json: {
      accessToken: "isolated-fixture-not-a-real-token",
      user: { id: "fixture-admin", name: "Admin fixture", email: "admin@example.test", role: "ADMIN", active: true },
    } });
    if (request.method() !== "GET") return route.abort();
    const pagination = { page: Number(url.searchParams.get("page") || 1), pages: 2, total: 21 };
    if (url.pathname === "/api/admin/orders") return route.fulfill({ json: { orders: [order], pagination } });
    if (url.pathname === "/api/admin/products") return route.fulfill({ json: { products: [], pagination } });
    return route.fulfill({ status: 404, json: { message: "No fixture defined" } });
  });
}

for (const width of [320, 360, 375, 390, 430, 600, 768, 820, 1024, 1280, 1366, 1440, 1920]) {
  test(`filtros y paginación de pedidos tienen targets de 44px a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1050 });
    await mockAdmin(page);
    await page.goto("/admin/orders");
    await expect(page.getByRole("heading", { name: "Pedidos (21)" })).toBeVisible();
    const statusBox = await page.getByRole("combobox").boundingBox();
    expect(statusBox?.height).toBeGreaterThanOrEqual(44);
    for (const name of ["Fecha desde", "Fecha hasta", "Monto mínimo", "Monto máximo"]) {
      const box = await page.getByLabel(name, { exact: true }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    for (const name of ["Anterior", "Siguiente"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    const metrics = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }));
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.width);
    if (width >= 768) {
      const link = page.getByRole("link", { name: `Ver pedido ${order.id}`, exact: true });
      const table = page.locator("table");
      const wrapper = table.locator("..");
      const linkBox = await link.boundingBox();
      const wrapperBox = await wrapper.boundingBox();
      expect(linkBox?.width).toBeGreaterThanOrEqual(44);
      expect(linkBox?.height).toBeGreaterThanOrEqual(44);
      expect(linkBox!.x).toBeGreaterThanOrEqual(wrapperBox!.x);
      expect(linkBox!.x + linkBox!.width).toBeLessThanOrEqual(wrapperBox!.x + wrapperBox!.width);
      await wrapper.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
      const scrolled = await link.boundingBox();
      expect(scrolled!.x).toBeGreaterThanOrEqual(wrapperBox!.x);
      expect(scrolled!.x + scrolled!.width).toBeLessThanOrEqual(wrapperBox!.x + wrapperBox!.width);
      await link.focus();
      await expect(link).toBeFocused();
    } else {
      await expect(page.getByRole("link", { name: "Ver pedido", exact: true })).toBeVisible();
    }
  });

  test(`paginación de productos tiene targets de 44px a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1050 });
    await mockAdmin(page);
    await page.goto("/admin/products");
    await expect(page.getByRole("heading", { name: "Productos", exact: true })).toBeVisible();
    for (const name of ["Anterior", "Siguiente"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });
}

test("paginación conserva su navegación de lectura", async ({ page }) => {
  await mockAdmin(page);
  await page.goto("/admin/orders");
  await expect(page.getByRole("heading", { name: "Pedidos (21)" })).toBeVisible();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole("button", { name: "Siguiente", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Anterior", exact: true }).click();
  await expect(page).toHaveURL(/page=1/);
});
