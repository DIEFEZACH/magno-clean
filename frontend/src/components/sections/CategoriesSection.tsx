import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useCatalogNavigation } from "../../hooks/useCatalogNavigation";

export function CategoriesSection({ page = false }: { page?: boolean }) {
  const { items, loading, error } = useCatalogNavigation();
  const families = items.filter((item) => item.type === "FAMILY");
  const preferred = ["multifibras-orange", "apc-tnt", "blue-gel", "shampoo-alfombras", "orange-liquid", "neutro-car"];
  const selection = preferred.flatMap((slug) => families.filter((family) => family.slug === slug));
  const categories = [...new Set(items.map((item) => item.category))];
  return <section className="bg-white px-5 py-12 md:px-8 md:py-16 xl:px-12"><div className="mx-auto max-w-7xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#16818f]">Explora a tu manera</p>{page ? <h1 className="text-3xl font-black tracking-[-0.045em] text-[#142f33] sm:text-4xl">Categorías del catálogo</h1> : <h2 className="text-3xl font-black tracking-[-0.045em] text-[#142f33] sm:text-4xl">Encuentra tu familia de productos</h2>}</div><Link to="/productos" className="inline-flex min-h-11 items-center gap-3 text-xs font-bold text-[#16818f]">Ver todo <ArrowRight size={17}/></Link></div>
    {loading && <p className="mt-8 text-sm" role="status">Cargando catálogo…</p>}{error && <p className="mt-8 text-sm">No pudimos cargar las categorías. <Link className="underline" to="/productos">Reintentar desde el catálogo</Link></p>}
    {page && categories.length > 0 && <div className="mt-8 grid gap-4 sm:grid-cols-2">{categories.map((category) => <Link key={category} to={`/productos?category=${encodeURIComponent(category)}`} className="flex min-h-24 items-center justify-between rounded-xl bg-[#eff5f3] p-6 text-xl font-bold text-[#142f33]">{category}<ArrowUpRight size={24}/></Link>)}</div>}
    {selection.length > 0 && <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-6">{selection.map((family) => <Link key={family.id} to={`/producto/${family.slug}`} className="group min-w-0 text-center"><div className="mx-auto flex aspect-square w-full max-w-44 items-center justify-center rounded-full border border-[#e4eae8] bg-[#f5f7f6] p-5 transition group-hover:border-[#168fa1] group-hover:bg-[#e5f1ef]">{family.imageUrl && <img src={family.imageUrl} alt="" width="180" height="180" loading="lazy" decoding="async" className="h-full w-full object-contain mix-blend-multiply"/>}</div><h3 className="mt-4 break-words text-xs font-bold text-[#142f33]">{family.name}</h3><p className="mt-1 text-[11px] text-black/45">{family.variantCount} presentaciones</p></Link>)}</div>}
    {!loading && !error && !items.length && <p className="mt-8">Todavía no hay categorías disponibles.</p>}
  </div></section>;
}
