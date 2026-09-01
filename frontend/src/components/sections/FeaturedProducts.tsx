import { Link } from "react-router-dom";
import { ProductCard } from "../product/ProductCard";
import { useCatalog } from "../../hooks/useCatalog";

export function FeaturedProducts() {
  const { items: featured, loading, error, refetch } = useCatalog({ featured: true, pageSize: 6 });

  return (
    <section className="bg-[#F5F5F5] px-5 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-3 text-sm font-black uppercase tracking-[0.25em] text-[#19A2B6]">Selección</p><h2 className="text-4xl font-black tracking-[-0.04em] md:text-6xl">Productos destacados</h2></div><Link to="/productos" className="font-black text-[#19A2B6]">Ver catálogo completo</Link></div>
        {loading && <p className="mt-10 text-xl font-black">Cargando productos...</p>}
        {error && <div className="mt-10 rounded-[2rem] bg-white p-8"><p className="font-black">No pudimos cargar los productos destacados.</p><button type="button" onClick={() => refetch()} className="mt-4 font-black text-[#19A2B6]">Reintentar</button></div>}
        {!loading && !error && featured.length > 0 && <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">{featured.map((product) => <ProductCard key={`${product.type}-${product.id}`} product={product} />)}</div>}
        {!loading && !error && featured.length === 0 && <div className="mt-10 flex flex-col items-start justify-between gap-5 rounded-[2rem] bg-white p-8 md:flex-row md:items-center"><div><h3 className="text-2xl font-black">Descubre el catálogo completo</h3><p className="mt-2 text-black/55">Explora las soluciones disponibles por categoría, presentación o aplicación.</p></div><Link to="/productos" className="rounded-full bg-[#19A2B6] px-6 py-3 text-sm font-black text-white">Ver productos</Link></div>}
      </div>
    </section>
  );
}
