import { Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { ProductCard } from "../components/product/ProductCard";
import { useProducts } from "../hooks/useProducts";
import { Seo } from "../components/Seo";

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function Products() {
  const { products, loading, error, refetch } = useProducts();
  const [params, setParams] = useSearchParams();
  const search = params.get("search") || "";
  const category = params.get("category") || "";
  const seoTitle=category?`${category}: productos de limpieza`:search?`Resultados para ${search}`:"Catálogo de productos";
  const seoDescription=category?`Explora los productos Magno Clean disponibles en la categoría ${category}.`:"Explora productos Magno Clean para limpieza residencial, comercial e industrial.";
  const visibleProducts = products.filter((product) => {
    const term = normalize(search.trim());
    const matchesSearch = !term || [product.name, product.slug, product.code, product.category].some((value) => normalize(value).includes(term));
    return matchesSearch && (!category || product.category === category);
  });

  function updateSearch(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("search", value);
    else next.delete("search");
    next.delete("focus");
    setParams(next, { replace: true });
  }

  function clearFilters() {
    setParams({}, { replace: true });
  }

  if (loading) return <section className="px-5 py-20 lg:px-8"><h1 className="text-5xl font-black">Cargando productos...</h1></section>;
  if (error) return <section className="px-5 py-20 lg:px-8"><div className="mx-auto max-w-7xl rounded-[2rem] bg-red-50 p-8"><h1 className="text-3xl font-black">No pudimos cargar el catálogo</h1><p className="mt-3 text-black/60">{error}</p><button type="button" onClick={() => refetch()} className="mt-6 rounded-full bg-[#111111] px-6 py-3 text-sm font-black text-white">Reintentar</button></div></section>;

  return (
    <><Seo title={seoTitle} description={seoDescription} path={category?`/productos?category=${encodeURIComponent(category)}`:"/productos"}/><section className="bg-[#F5F5F5] px-5 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.25em] text-[#19A2B6]">Catálogo</p>
          <h1 className="text-5xl font-black tracking-[-0.05em] md:text-7xl">Productos Magno Clean</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-black/60">Explora nuestra línea de soluciones para limpieza residencial, comercial e industrial.</p>
        </div>
        <label className="relative mb-8 block max-w-2xl">
          <Search className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-black/35" size={20} />
          <input autoFocus={params.get("focus") === "search"} value={search} onChange={(event) => updateSearch(event.target.value)} className="w-full rounded-2xl border border-black/10 bg-white py-4 pl-14 pr-5 font-semibold outline-none focus:border-[#19A2B6]" placeholder="Buscar por nombre, código o categoría..." />
        </label>
        {category && <p className="mb-6 text-sm font-black text-[#19A2B6]">Categoría: {category}</p>}
        {visibleProducts.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{visibleProducts.map((product) => <ProductCard key={product.id} product={{ ...product, oldPrice: product.oldPrice ?? undefined, badge: product.badge ?? undefined }} />)}</div>
        ) : (
          <div className="rounded-[2rem] bg-white px-6 py-20 text-center shadow-sm"><h2 className="text-3xl font-black">No encontramos productos</h2><p className="mt-3 text-black/55">Prueba con otra búsqueda o elimina los filtros.</p><button type="button" onClick={clearFilters} className="mt-6 rounded-full bg-[#19A2B6] px-6 py-3 text-sm font-black text-white">Limpiar filtros</button></div>
        )}
      </div>
    </section></>
  );
}
