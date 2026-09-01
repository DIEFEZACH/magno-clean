import { Link } from "react-router-dom";
import { useCatalog } from "../../hooks/useCatalog";

export function CategoriesSection({ page = false }: { page?: boolean }) {
  const { filters: { categories }, loading, error, refetch } = useCatalog({ pageSize: 1 });

  return (
    <section className="px-5 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl"><p className="mb-3 text-sm font-black uppercase tracking-[0.25em] text-[#19A2B6]">Explorar</p>{page?<h1 className="text-4xl font-black tracking-[-0.04em] md:text-6xl">Categorías de productos</h1>:<h2 className="text-4xl font-black tracking-[-0.04em] md:text-6xl">Categorías</h2>}
        {loading && <p className="mt-10 text-xl font-black">Cargando categorías...</p>}
        {error && <div className="mt-10 rounded-[2rem] bg-red-50 p-8"><p className="font-black">No pudimos cargar las categorías.</p><button type="button" onClick={() => refetch()} className="mt-4 font-black text-[#19A2B6]">Reintentar</button></div>}
        {!loading && !error && categories.length > 0 && <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{categories.map((category) => <Link key={category} to={`/productos?category=${encodeURIComponent(category)}`} className="rounded-[2rem] bg-[#F5F5F5] p-6 transition hover:-translate-y-1 hover:bg-[#19A2B6]/10"><h3 className="text-xl font-black">{category}</h3><p className="mt-2 text-sm font-bold text-black/45">Explorar productos</p></Link>)}</div>}
        {!loading && !error && categories.length === 0 && <div className="mt-10 rounded-[2rem] bg-[#F5F5F5] p-8">Todavía no hay categorías disponibles.</div>}
      </div>
    </section>
  );
}
