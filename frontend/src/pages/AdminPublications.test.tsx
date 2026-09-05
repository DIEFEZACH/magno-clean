import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPublications } from "./AdminPublications";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../lib/api", () => ({ apiFetch: mocks.fetch }));
const row = (id: string, extra: object = {}) => ({ id, code: `CODE-${id}`, slug: `product-${id}`, name: `Producto ${id}`, brand: "Magno Clean", category: "Limpieza", description: "Texto registrado", price: 50, imageUrl: "https://images.example/product.webp", active: true, familyId: null, variantLabel: null, variantSortOrder: 0, ...extra });
const family = { id: "f1", name: "Naranja", slug: "naranja", brand: "Magno Clean", category: "Limpieza", active: true, imageUrl: null, description: "Texto familiar", variantType: "Presentación" };
const response = (key: string, rows: unknown[], page = 1, pages = 1, total = rows.length) => new Response(JSON.stringify({ [key]: rows, pagination: { page, pages, total } }));
function renderPage() {
  return render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AdminPublications /></QueryClientProvider></MemoryRouter>);
}

describe("Admin publication center", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.fetch.mockImplementation(async (path: string) => path.includes("product-families") ? response("families", [family]) : response("products", [row("1", { familyId: "f1", variantLabel: "1 L" }), row("2", { familyId: "f1", variantLabel: "5 L" }), row("3", { active: false, imageUrl: null, description: "" })]));
  });
  it("lists grouped data, field checklist, editor links, public visibility and honest editorial unknown state", async () => {
    renderPage();
    const list = await screen.findByRole("list", { name: "Publicaciones" });
    expect(within(list).getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Editar familia" })).toHaveAttribute("href", "/admin/product-families?family=f1&edit=1");
    expect(screen.getByRole("link", { name: "Editar producto" })).toHaveAttribute("href", "/admin/products/3/edit");
    expect(screen.getByRole("link", { name: "Ver publicación" })).toHaveAttribute("href", "/producto/naranja");
    expect(screen.getAllByText("Sin evaluar").length).toBeGreaterThan(0);
    expect(screen.getByText("Ficha 6/6")).toBeVisible();
    expect(screen.getByText("Ficha 3/5")).toBeVisible();
    expect(screen.queryByRole("button", { name: /activar|publicar|stock/i })).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it("loads beyond the first product page and searches variant codes without duplicates", async () => {
    mocks.fetch.mockImplementation(async (path: string) => path.includes("product-families") ? response("families", [family]) : path.includes("page=1") ? response("products", [row("1", { familyId: "f1", variantLabel: "1 L" })], 1, 2, 2) : response("products", [row("2", { familyId: "f1", variantLabel: "5 L" })], 2, 2, 2));
    const user = userEvent.setup(); renderPage(); await screen.findByRole("list", { name: "Publicaciones" });
    await user.type(screen.getByRole("searchbox"), "CODE-2");
    expect(screen.getByRole("heading", { name: "Naranja" })).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });
  it("filters across the universe, resets selection and offers a recoverable empty result", async () => {
    const user = userEvent.setup(); renderPage(); await screen.findByRole("list", { name: "Publicaciones" });
    await user.click(screen.getByRole("checkbox", { name: "Seleccionar Naranja" }));
    expect(screen.getByRole("button", { name: "Exportar selección (1)" })).toBeEnabled();
    await user.selectOptions(screen.getByLabelText("Completitud"), "image");
    expect(screen.queryByRole("heading", { name: "Naranja" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exportar selección (0)" })).toBeDisabled();
    await user.type(screen.getByRole("searchbox"), "imposible");
    expect(screen.getByRole("heading", { name: "Sin coincidencias" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });
  it("shows loading then error with retry without an infinite skeleton or a partial list", async () => {
    let rejectRequest: (error: Error) => void = () => {};
    mocks.fetch.mockImplementation(() => new Promise<Response>((_, reject) => { rejectRequest = reject; }));
    renderPage(); expect(screen.getByText("Consultando el catálogo completo")).toBeVisible();
    rejectRequest(new Error("No pudimos cargar el catálogo completo. Intenta de nuevo."));
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar");
    expect(screen.queryByRole("list", { name: "Publicaciones" })).not.toBeInTheDocument();
    mocks.fetch.mockImplementation(async (path: string) => response(path.includes("product-families") ? "families" : "products", [], 1, 0));
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Aún no hay publicaciones" })).toBeVisible();
  });
  it("exports selected and filtered CSV locally, with keyboard-friendly controls and no writes", async () => {
    const create = vi.fn(() => "blob:test"); const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup(); renderPage(); await screen.findByRole("list", { name: "Publicaciones" });
    const select = screen.getByRole("checkbox", { name: "Seleccionar Naranja" }); select.focus(); await user.keyboard(" ");
    expect(select).toBeChecked(); expect(select).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Exportar selección (1)" }));
    expect(create).toHaveBeenCalledOnce(); expect(click).toHaveBeenCalledOnce();
    expect(screen.getByText("CSV preparado: 1 publicaciones. No se modificaron datos.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Exportar resultado (2)" }));
    expect(create).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls.every(([, init]) => !init.method)).toBe(true);
    click.mockRestore(); vi.unstubAllGlobals();
  });
  it("does not collapse the layout when an image fails", async () => {
    renderPage(); const image = await screen.findByRole("img", { name: "Naranja" });
    expect(image).toHaveAttribute("width", "96"); expect(image).toHaveAttribute("height", "96");
    fireEvent.error(image);
    await waitFor(() => expect(screen.queryByRole("img", { name: "Naranja" })).not.toBeInTheDocument());
    expect(screen.getByText("No disponible")).toBeVisible();
  });
});
