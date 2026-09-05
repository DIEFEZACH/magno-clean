import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { ProductCard } from "../product/ProductCard";
import { useCatalog } from "../../hooks/useCatalog";

export function FeaturedProducts() {
  // Browsing selection, not a sales ranking or a popularity claim.
  const { items, loading, error, refetch } = useCatalog({ pageSize: 4, sort: "name-asc" });
  return <section className="bg-[#f5f7f6] px-5 py-12 md:px-8 md:py-16 xl:px-12"><div className="mx-auto max-w-7xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#16818f]">Directo del catálogo</p><h2 className="text-3xl font-black tracking-[-0.045em] text-[#142f33] sm:text-4xl">Descubre Magno Clean</h2></div><Link to="/productos" className="inline-flex min-h-11 items-center gap-3 text-xs font-bold text-[#16818f]">Explorar productos <ArrowRight size={17}/></Link></div>{loading && <p className="mt-8" role="status">Cargando productos…</p>}{error && <div className="mt-8 rounded-xl bg-white p-6"><p>No pudimos cargar esta selección.</p><button type="button" onClick={() => refetch()} className="mt-3 min-h-11 font-bold text-[#16818f]">Reintentar</button></div>}{!loading && !error && <div className="mt-8 grid gap-4 min-[390px]:grid-cols-2 lg:grid-cols-4">{items.map((item) => <ProductCard key={`${item.type}-${item.id}`} product={item}/>)}</div>}</div></section>;
}
