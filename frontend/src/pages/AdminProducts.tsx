import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Search, SlidersHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAdminFeedback } from "../components/admin/AdminFeedback";

type Product = { id: string; slug: string; name: string; category: string; description: string; price: number; oldPrice?: number | null; badge?: string | null; imageUrl?: string | null; createdAt: string; availableStock: number; active:boolean; featured:boolean };
type ProductForm = { slug: string; name: string; category: string; description: string; price: string; oldPrice: string; badge: string; imageUrl: string };
type SortOption = "name-asc" | "name-desc" | "price-asc" | "price-desc" | "newest" | "oldest";

const initialForm: ProductForm = { slug: "", name: "", category: "", description: "", price: "", oldPrice: "", badge: "", imageUrl: "" };

function generateSlug(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<ProductForm>(initialForm);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const feedback = useAdminFeedback();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category))].sort((a, b) => a.localeCompare(b, "es")),
    [products],
  );

  const visibleProducts = useMemo(() => {
    const term = normalizeText(search.trim());
    return products
      .filter((product) => {
        const matchesSearch = !term || [product.name, product.slug, product.category].some((value) => normalizeText(value).includes(term));
        const matchesCategory = category === "all" || product.category === category;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        if (sort === "name-asc") return a.name.localeCompare(b.name, "es");
        if (sort === "name-desc") return b.name.localeCompare(a.name, "es");
        if (sort === "price-asc") return a.price - b.price;
        if (sort === "price-desc") return b.price - a.price;
        if (sort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [category, products, search, sort]);

  function clearFilters() {
    setSearch("");
    setCategory("all");
    setSort("newest");
  }

  async function fetchProducts() {
    const response = await apiFetch(`/api/admin/products?page=${page}&pageSize=20&search=${encodeURIComponent(search)}&category=${category === "all" ? "" : encodeURIComponent(category)}`);
    const data = await response.json();
    setProducts(data.products || []);
    setPages(data.pagination?.pages || 1);
    setTotalProducts(data.pagination?.total || 0);
  }

  async function deleteProduct(id: string) {
    feedback.confirm({ title: "Eliminar producto", description: "Esta acción elimina el producto y no se puede deshacer.", destructive: true, confirmLabel: "Eliminar", action: async () => { setPendingAction(id); try { const response = await apiFetch(`/api/products/${id}`, { method: "DELETE" }); if (!response.ok) throw new Error("No se pudo eliminar el producto"); await queryClient.invalidateQueries({ queryKey: ["products"] }); await fetchProducts(); feedback.toast("success", "Producto eliminado"); } catch (error) { feedback.toast("error", error instanceof Error ? error.message : "No se pudo eliminar"); } finally { setPendingAction(null); } } });
  }

  async function duplicateProduct(id: string) {
    setPendingAction(id); try { const response=await apiFetch(`/api/admin/products/${id}/duplicate`, { method: "POST" }); if(!response.ok)throw new Error("No se pudo duplicar el producto"); await fetchProducts(); feedback.toast("success","Producto duplicado"); } catch(error){feedback.toast("error",error instanceof Error?error.message:"No se pudo duplicar")} finally{setPendingAction(null)}
  }

  async function quickUpdate(id: string, data: { active?: boolean; featured?: boolean }) {
    setPendingAction(id); const response=await apiFetch(`/api/admin/products/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if(!response.ok){setPendingAction(null);feedback.toast("error","No se pudo actualizar el producto");return}
    setProducts((current) => current.map((product) => product.id === id ? { ...product, ...data } : product));
    await queryClient.invalidateQueries({ queryKey: ["products"] });
    setPendingAction(null); feedback.toast("success",data.active===false?"Producto desactivado":data.active===true?"Producto activado":"Producto actualizado");
  }

  async function exportProducts() {
    const response = await apiFetch("/api/admin/products/export.csv");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a"); link.href = url; link.download = "magno-products.csv"; link.click(); URL.revokeObjectURL(url);
  }

  async function importProducts(file: File) {
    if (pendingAction) return;
    setPendingAction("import");
    const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    const parse = (line: string) => [...line.matchAll(/(?:^|,)(?:"((?:""|[^"])*)"|([^,]*))/g)].map((match) => (match[1] ?? match[2] ?? "").replace(/""/g, '"'));
    const headers = parse(lines.shift() || "");
    const imported = lines.map((line) => {
      const values = parse(line); const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
      return { code: row.code, slug: row.slug, brand: row.brand || "Magno Clean", name: row.name, category: row.category, description: row.description, imageUrl: row.imageUrl || null, price: Number(row.price), oldPrice: row.oldPrice ? Number(row.oldPrice) : null, featured: row.featured === "true", active: row.active !== "false" };
    });
    const response=await apiFetch("/api/admin/products/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ products: imported }) });
    if(!response.ok){setPendingAction(null);return feedback.toast("error","No se pudo importar el CSV")}await fetchProducts();setPendingAction(null);feedback.toast("success",`${imported.length} registros procesados`);
  }

  async function submitProduct(event: React.FormEvent) {
    event.preventDefault();
    if (pendingAction) return;
    setPendingAction("create");
    const payload = { slug: form.slug, name: form.name, category: form.category, description: form.description, price: Number(form.price), oldPrice: form.oldPrice ? Number(form.oldPrice) : null, badge: form.badge || null, imageUrl: form.imageUrl || null };
    const response = await apiFetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) { setPendingAction(null); feedback.toast("error", "No se pudo crear el producto"); return; }
    await queryClient.invalidateQueries({ queryKey: ["products"] });
    setForm(initialForm);
    setShowForm(false);
    fetchProducts();
    feedback.toast("success","Producto creado correctamente");
    setPendingAction(null);
  }

  function toggleCreateForm() {
    setForm(initialForm);
    setShowForm((visible) => !visible);
  }

  useEffect(() => {
    async function loadProducts() {
      const response = await apiFetch(`/api/admin/products?page=${page}&pageSize=20&search=${encodeURIComponent(search)}&category=${category === "all" ? "" : encodeURIComponent(category)}`);
      const data = await response.json();
      setProducts(data.products || []);
      setPages(data.pagination?.pages || 1);
      setTotalProducts(data.pagination?.total || 0);
    }
    loadProducts();
  }, [page, search, category]);

  return (
    <section className="min-h-screen bg-[#F5F5F5] px-5 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 text-sm font-black uppercase tracking-[0.25em] text-[#19A2B6]">Admin</p>
            <h1 className="text-5xl font-black tracking-[-0.05em]">Productos</h1>
          </div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={exportProducts} className="rounded-full bg-white px-5 py-3 text-sm font-black">Exportar Excel/CSV</button><label className="cursor-pointer rounded-full bg-[#111] px-5 py-3 text-sm font-black text-white">Importar CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProducts(file); }} /></label><button type="button" onClick={toggleCreateForm} className="w-fit rounded-full bg-[#19A2B6] px-6 py-3 text-sm font-black text-white transition hover:bg-[#111111]">{showForm ? "Cerrar formulario" : "Nuevo producto"}</button></div>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, y: -16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16, scale: 0.98 }} transition={{ duration: 0.25, ease: "easeOut" }} className="mt-10 grid gap-6 lg:grid-cols-[1fr_360px]">
              <form onSubmit={submitProduct} className="grid gap-5 rounded-[2rem] bg-white p-6 shadow-sm">
                <h2 className="text-3xl font-black">Nuevo producto</h2>
                <div className="grid gap-5 md:grid-cols-2">
                  <input value={form.name} onChange={(event) => { const name = event.target.value; setForm({ ...form, name, slug: generateSlug(name) }); }} required className="rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]" placeholder="Nombre" />
                  <input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} required className="rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]" placeholder="Slug" />
                  <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} required className="rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]" placeholder="Categoría" />
                  <input value={form.badge} onChange={(event) => setForm({ ...form, badge: event.target.value })} className="rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]" placeholder="Badge" />
                  <input value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} className="rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6] md:col-span-2" placeholder="URL de imagen" />
                  <input value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required type="number" className="rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]" placeholder="Precio" />
                  <input value={form.oldPrice} onChange={(event) => setForm({ ...form, oldPrice: event.target.value })} type="number" className="rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]" placeholder="Precio anterior" />
                </div>
                <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required className="min-h-32 rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]" placeholder="Descripción" />
                <button disabled={pendingAction === "create"} className="w-fit rounded-full bg-[#19A2B6] px-8 py-4 text-sm font-black text-white transition hover:bg-[#111111] disabled:opacity-50">{pendingAction === "create" ? "Creando..." : "Crear producto"}</button>
              </form>
              <aside className="h-fit rounded-[2rem] bg-white p-6 shadow-sm">
                <p className="mb-3 text-sm font-black uppercase tracking-[0.25em] text-[#EF8329]">Preview</p>
                <div className="rounded-[1.75rem] bg-gradient-to-br from-[#19A2B6]/10 to-[#EF8329]/10 p-5">
                  {form.badge && <span className="rounded-full bg-[#EF8329] px-3 py-1 text-xs font-black text-white">{form.badge}</span>}
                  <div className="mt-10 flex h-48 items-center justify-center overflow-hidden rounded-[1.5rem] bg-white shadow-sm">{form.imageUrl ? <img src={form.imageUrl} alt={form.name || "Preview producto"} className="h-full w-full object-contain p-4" /> : <span className="text-4xl font-black text-[#19A2B6]">MC</span>}</div>
                </div>
                <p className="mt-5 text-sm font-black text-[#19A2B6]">{form.category || "Categoría"}</p>
                <h3 className="mt-2 text-2xl font-black">{form.name || "Nombre del producto"}</h3>
                <p className="mt-3 text-sm leading-6 text-black/55">{form.description || "Descripción del producto..."}</p>
                <p className="mt-5 text-2xl font-black">{new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(form.price || 0))}</p>
              </aside>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-10 rounded-[2rem] bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-black/35" size={19} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-2xl border border-black/10 py-3.5 pl-12 pr-4 font-semibold outline-none transition focus:border-[#19A2B6]" placeholder="Buscar producto..." />
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:flex">
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="min-w-48 rounded-2xl border border-black/10 bg-white px-4 py-3.5 font-bold outline-none focus:border-[#19A2B6]">
                <option value="all">Todas las categorías</option>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <label className="relative">
                <SlidersHorizontal className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-black/35" size={18} />
                <select value={sort} onChange={(event) => setSort(event.target.value as SortOption)} className="w-full min-w-48 appearance-none rounded-2xl border border-black/10 bg-white py-3.5 pl-12 pr-8 font-bold outline-none focus:border-[#19A2B6]">
                  <option value="name-asc">Nombre A-Z</option>
                  <option value="name-desc">Nombre Z-A</option>
                  <option value="price-asc">Precio menor</option>
                  <option value="price-desc">Precio mayor</option>
                  <option value="newest">Más recientes</option>
                  <option value="oldest">Más antiguos</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-black tracking-[-0.03em]">Productos ({totalProducts})</h2>
          {(search || category !== "all" || sort !== "newest") && <button type="button" onClick={clearFilters} className="text-sm font-black text-[#19A2B6] transition hover:text-[#111111]">Limpiar filtros</button>}
        </div>

        {visibleProducts.length > 0 ? (
          <div className="mt-5 overflow-hidden rounded-[2rem] bg-white shadow-sm">
            <div className="hidden grid-cols-[72px_minmax(0,1.7fr)_minmax(130px,0.8fr)_minmax(130px,0.7fr)_auto] items-center gap-4 border-b border-black/5 px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-black/40 md:grid">
              <span>Imagen</span><span>Producto</span><span>Categoría</span><span>Precio</span><span>Acciones</span>
            </div>
            {visibleProducts.map((product) => (
              <article key={product.id} className="grid gap-4 border-b border-black/5 p-5 last:border-b-0 md:grid-cols-[72px_minmax(0,1.7fr)_minmax(130px,0.8fr)_minmax(130px,0.7fr)_auto] md:items-center">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#19A2B6]/10 to-[#EF8329]/10">
                  {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain p-2" /> : <span className="text-lg font-black text-[#19A2B6]">MC</span>}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-lg font-black">{product.name}</h3>
                    {product.badge && <span className="rounded-full bg-[#EF8329]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#EF8329]">{product.badge}</span>}
                  </div>
                  <p className="mt-1 truncate text-xs font-bold text-black/40">/{product.slug}</p>
                  <p className={`mt-1 text-xs font-black ${product.availableStock > 0 ? "text-emerald-600" : "text-red-500"}`}>{product.availableStock > 0 ? `${product.availableStock} disponibles` : "Agotado"}</p>
                </div>
                <p className="text-sm font-black text-[#19A2B6]">{product.category}</p>
                <div>
                  <p className="font-black">{new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(product.price)}</p>
                  {product.oldPrice && <p className="mt-0.5 text-xs font-bold text-black/35 line-through">{new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(product.oldPrice)}</p>}
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <button disabled={pendingAction===product.id} type="button" onClick={() => product.active?feedback.confirm({title:"Desactivar producto",description:"Dejará de aparecer en el catálogo público.",confirmLabel:"Desactivar",action:()=>quickUpdate(product.id,{active:false})}):quickUpdate(product.id,{active:true})} className="rounded-full bg-black/5 px-4 py-2.5 text-xs font-black disabled:opacity-40">{product.active ? "Desactivar" : "Activar"}</button>
                  <button disabled={pendingAction===product.id} type="button" onClick={() => quickUpdate(product.id, { featured: !product.featured })} className="rounded-full bg-[#EF8329]/10 px-4 py-2.5 text-xs font-black text-[#EF8329] disabled:opacity-40">{product.featured ? "Quitar destacado" : "Destacar"}</button>
                  <button disabled={pendingAction===product.id} type="button" onClick={() => duplicateProduct(product.id)} className="rounded-full bg-[#19A2B6]/10 px-4 py-2.5 text-xs font-black text-[#19A2B6] disabled:opacity-40">Duplicar</button>
                  <button type="button" onClick={() => navigate(`/admin/products/${product.id}/edit`)} className="rounded-full bg-[#111111] px-4 py-2.5 text-xs font-black text-white transition hover:bg-[#19A2B6]">Editar</button>
                  <button type="button" onClick={() => deleteProduct(product.id)} className="rounded-full bg-red-500 px-4 py-2.5 text-xs font-black text-white transition hover:opacity-80">Eliminar</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-5 flex min-h-72 flex-col items-center justify-center rounded-[2rem] bg-white px-6 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#19A2B6]/10"><Search className="text-[#19A2B6]" size={28} /></div>
            <h3 className="mt-5 text-2xl font-black">No encontramos productos</h3>
            <p className="mt-2 max-w-md text-sm font-semibold text-black/50">Prueba con otro término o restablece la categoría y el ordenamiento.</p>
            <button type="button" onClick={clearFilters} className="mt-6 rounded-full bg-[#19A2B6] px-6 py-3 text-sm font-black text-white transition hover:bg-[#111111]">Limpiar filtros</button>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-3"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-full bg-white px-5 py-2 font-black disabled:opacity-30">Anterior</button><span className="py-2 text-sm font-black">{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage((value) => value + 1)} className="rounded-full bg-white px-5 py-2 font-black disabled:opacity-30">Siguiente</button></div>
      </div>
    </section>
  );
}
