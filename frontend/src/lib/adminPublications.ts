/** Read-only, explicit view model. Administrative API internals never enter the export. */
export type PublicationProduct = {
  id: string; slug: string; code: string; brand: string; name: string; category: string;
  description: string; price: number; imageUrl: string | null; active: boolean;
  familyId: string | null; variantLabel: string | null; variantSortOrder: number;
};
export type PublicationFamily = {
  id: string; slug: string; brand: string; name: string; category: string;
  description: string; imageUrl: string | null; active: boolean; variantType: string;
};
export type PublicationCheck = { label: string; ready: boolean };
export type Publication = {
  key: string; id: string; type: "FAMILY" | "PRODUCT"; slug: string; name: string;
  brand: string; category: string; description: string; imageUrl: string | null;
  active: boolean; publicVisible: boolean; products: PublicationProduct[];
  priceFrom: number | null; priceTo: number | null; checks: PublicationCheck[];
};
export type PublicationFilters = {
  search: string; status: "all" | "active" | "inactive";
  type: "all" | "FAMILY" | "PRODUCT";
  missing: "all" | "image" | "description" | "incomplete";
};
export const emptyPublicationFilters: PublicationFilters = { search: "", status: "all", type: "all", missing: "all" };
export const normalizePublicationSearch = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
const present = (text: string | null | undefined) => Boolean(text?.trim());
const validPrice = (value: number) => Number.isFinite(value) && value > 0;

function safeImage(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("El catálogo devolvió un formato inesperado. Vuelve a cargarlo.");
  return value as Record<string, unknown>;
}
function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("El catálogo está incompleto. Vuelve a cargarlo antes de exportar.");
  return value;
}
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function parseProduct(value: unknown): PublicationProduct {
  const data = record(value);
  const images = Array.isArray(data.images) ? data.images.map(record) : [];
  return {
    id: requiredString(data.id), slug: requiredString(data.slug), code: text(data.code),
    name: text(data.name), brand: text(data.brand), category: text(data.category), description: text(data.description),
    price: typeof data.price === "number" ? data.price : Number.NaN,
    imageUrl: safeImage(data.imageUrl) || images.map((image) => safeImage(image.url)).find(Boolean) || null,
    active: data.active === true, familyId: typeof data.familyId === "string" ? data.familyId : null,
    variantLabel: typeof data.variantLabel === "string" ? data.variantLabel : null,
    variantSortOrder: typeof data.variantSortOrder === "number" ? data.variantSortOrder : 0,
  };
}
function parseFamily(value: unknown): PublicationFamily {
  const data = record(value);
  return {
    id: requiredString(data.id), slug: requiredString(data.slug), name: text(data.name),
    brand: text(data.brand), category: text(data.category), description: text(data.description),
    imageUrl: safeImage(data.imageUrl), active: data.active === true, variantType: text(data.variantType),
  };
}

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
async function allPages<T extends { id: string }>(fetcher: Fetcher, endpoint: string, collection: "products" | "families", parse: (value: unknown) => T, signal?: AbortSignal): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let expectedTotal: number | null = null;
  let expectedPages: number | null = null;
  for (let page = 1; page <= 200; page += 1) {
    const response = await fetcher(`${endpoint}?page=${page}&pageSize=100`, { signal });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Tu sesión no permite consultar publicaciones. Vuelve a iniciar sesión." : "No pudimos cargar el catálogo completo. Intenta de nuevo.");
    const data = record(await response.json());
    const pagination = record(data.pagination);
    const rows = data[collection];
    const { total, pages } = pagination;
    if (!Array.isArray(rows) || !Number.isInteger(total) || Number(total) < 0 || !Number.isInteger(pages) || Number(pages) < 0 || pagination.page !== page || Number(pages) > 200) {
      throw new Error("No pudimos verificar todas las páginas del catálogo. No se mostrará una lista parcial.");
    }
    if (expectedTotal !== null && (expectedTotal !== total || expectedPages !== pages)) throw new Error("El catálogo cambió mientras se cargaba. Actualiza para consultar la lista completa.");
    expectedTotal = Number(total); expectedPages = Number(pages);
    for (const row of rows) {
      const item = parse(row);
      if (seen.has(item.id)) throw new Error("El catálogo cambió mientras se cargaba. Actualiza para evitar duplicados.");
      seen.add(item.id); items.push(item);
    }
    if (page >= expectedPages) {
      if (items.length !== expectedTotal) throw new Error("La lista de publicaciones está incompleta. Actualiza antes de continuar.");
      return items;
    }
    if (rows.length === 0) throw new Error("Falta una página del catálogo. Intenta de nuevo.");
  }
  throw new Error("El catálogo excede la capacidad de esta vista. No se exportarán resultados parciales.");
}

export async function loadPublicationUniverse(fetcher: Fetcher, signal?: AbortSignal) {
  const [products, families] = await Promise.all([
    allPages(fetcher, "/api/admin/products", "products", parseProduct, signal),
    allPages(fetcher, "/api/admin/product-families", "families", parseFamily, signal),
  ]);
  return { products, families, publications: buildPublications(products, families) };
}

export function buildPublications(products: PublicationProduct[], families: PublicationFamily[]): Publication[] {
  const familyIds = new Set(families.map((family) => family.id));
  if (products.some((product) => product.familyId && !familyIds.has(product.familyId))) throw new Error("Una asociación de familia cambió durante la consulta. Vuelve a cargar el catálogo.");
  const grouped = new Map<string, PublicationProduct[]>();
  for (const product of products) if (product.familyId) grouped.set(product.familyId, [...(grouped.get(product.familyId) || []), product]);
  const prepare = (source: PublicationFamily | PublicationProduct, type: Publication["type"], variants: PublicationProduct[]): Publication => {
    const ordered = [...variants].sort((a, b) => a.variantSortOrder - b.variantSortOrder || a.code.localeCompare(b.code, "es"));
    const activeVariants = ordered.filter((product) => product.active);
    const prices = (activeVariants.length ? activeVariants : ordered).map((product) => product.price).filter(validPrice);
    const imageUrl = source.imageUrl || activeVariants.find((product) => product.imageUrl)?.imageUrl || ordered.find((product) => product.imageUrl)?.imageUrl || null;
    const checks = [
      { label: "Nombre", ready: present(source.name) },
      { label: type === "FAMILY" ? "Códigos de variantes" : "Código SKU", ready: ordered.length > 0 && ordered.every((product) => present(product.code)) },
      { label: "Precio válido", ready: ordered.length > 0 && ordered.every((product) => validPrice(product.price)) },
      { label: "Imagen", ready: Boolean(imageUrl) },
      ...(type === "FAMILY" ? [{ label: "Presentaciones", ready: ordered.length > 0 && ordered.every((product) => present(product.variantLabel)) }] : []),
      { label: "Descripción", ready: present(source.description) },
    ];
    return { key: `${type}:${source.id}`, id: source.id, type, slug: source.slug, name: source.name, brand: source.brand, category: source.category,
      description: source.description, imageUrl, active: source.active, publicVisible: source.active && activeVariants.length > 0,
      products: ordered, priceFrom: prices.length ? Math.min(...prices) : null, priceTo: prices.length ? Math.max(...prices) : null, checks };
  };
  return [
    ...families.map((family) => prepare(family, "FAMILY", grouped.get(family.id) || [])),
    ...products.filter((product) => !product.familyId).map((product) => prepare(product, "PRODUCT", [product])),
  ].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function filterPublications(publications: Publication[], filters: PublicationFilters): Publication[] {
  const query = normalizePublicationSearch(filters.search);
  return publications.filter((item) => {
    if (filters.status !== "all" && item.active !== (filters.status === "active")) return false;
    if (filters.type !== "all" && item.type !== filters.type) return false;
    if (filters.missing === "image" && item.imageUrl) return false;
    if (filters.missing === "description" && present(item.description)) return false;
    if (filters.missing === "incomplete" && item.checks.every((check) => check.ready)) return false;
    return !query || normalizePublicationSearch([item.name, item.brand, item.category, item.slug, ...item.products.flatMap((product) => [product.code, product.name, product.variantLabel || ""])].join(" ")).includes(query);
  });
}

export function publicationEditPath(item: Publication): string {
  return item.type === "PRODUCT" ? `/admin/products/${encodeURIComponent(item.id)}/edit` : `/admin/product-families?family=${encodeURIComponent(item.id)}&edit=1`;
}

/** Every text field is quoted and formula-neutralized; numeric fields are emitted only when finite. */
export function escapePublicationCsv(value: string | number): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  // Control characters can conceal a spreadsheet formula prefix; checking them is intentional.
  // eslint-disable-next-line no-control-regex
  const protectedValue = /^[\s\u0000-\u001f\u007f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}
export function publicationsCsv(publications: Publication[]): string {
  const rows: Array<Array<string | number>> = [["Tipo", "Nombre", "Marca", "Categoría", "Códigos SKU", "Presentaciones", "Activo", "Visible en catálogo", "Precio desde MXN", "Precio hasta MXN", "Imagen disponible", "Descripción disponible", "Campos completos", "Campos faltantes", "Estado editorial", "Ruta pública"]];
  for (const item of publications) rows.push([
    item.type === "FAMILY" ? "Familia" : "Producto", item.name, item.brand, item.category,
    item.products.map((product) => product.code).join(" | "), item.products.map((product) => product.variantLabel || "").filter(Boolean).join(" | "),
    item.active ? "Sí" : "No", item.publicVisible ? "Sí" : "No", item.priceFrom ?? "", item.priceTo ?? "", item.imageUrl ? "Sí" : "No", present(item.description) ? "Sí" : "No",
    `${item.checks.filter((check) => check.ready).length}/${item.checks.length}`, item.checks.filter((check) => !check.ready).map((check) => check.label).join(" | "),
    "Sin evaluar", item.publicVisible ? `/producto/${encodeURIComponent(item.slug)}` : "",
  ]);
  return `\uFEFF${rows.map((row) => row.map(escapePublicationCsv).join(",")).join("\r\n")}\r\n`;
}
