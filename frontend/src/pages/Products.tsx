import { Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { ProductCard } from "../components/product/ProductCard";
import { Seo } from "../components/Seo";
import { useCatalog } from "../hooks/useCatalog";
import type { CatalogSort } from "../types/catalog";

const sorts: Array<{value:CatalogSort;label:string}>=[{value:"featured",label:"Destacados"},{value:"name-asc",label:"Nombre A–Z"},{value:"name-desc",label:"Nombre Z–A"},{value:"price-asc",label:"Precio menor"},{value:"price-desc",label:"Precio mayor"},{value:"newest",label:"Más recientes"},{value:"oldest",label:"Más antiguos"}];

export function Products(){
  const [params,setParams]=useSearchParams();
  const search=params.get("search")||"",category=params.get("category")||"",brand=params.get("brand")||"";
  const sort=(params.get("sort")||"featured") as CatalogSort;
  const page=Math.max(1,Number(params.get("page"))||1);
  const {items,pagination,filters,loading,error,refetch}=useCatalog({page,pageSize:24,search,category,brand,sort});
  const seoTitle=category?`${category}: productos de limpieza`:search?`Resultados para ${search}`:"Catálogo de productos";
  const seoDescription=category?`Explora los productos Magno Clean disponibles en la categoría ${category}.`:"Explora productos Magno Clean para limpieza residencial, comercial e industrial.";
  function update(key:string,value:string){const next=new URLSearchParams(params);if(value)next.set(key,value);else next.delete(key);if(key!=="page")next.delete("page");next.delete("focus");setParams(next,{replace:true});}
  function clearFilters(){setParams({},{replace:true});}
  return <><Seo title={seoTitle} description={seoDescription} path={category?`/productos?category=${encodeURIComponent(category)}`:"/productos"}/><section className="bg-[#F5F5F5] px-4 py-12 sm:px-5 sm:py-16 lg:px-8 lg:py-20"><div className="mx-auto max-w-7xl">
    <div className="mb-8 sm:mb-10"><p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-[#19A2B6] sm:text-sm sm:tracking-[0.25em]">Catálogo</p><h1 className="break-words text-4xl font-black tracking-[-0.05em] sm:text-5xl md:text-7xl">Productos Magno Clean</h1><p className="mt-5 max-w-2xl text-base leading-7 text-black/60 sm:text-lg sm:leading-8">Explora nuestra línea de soluciones para limpieza residencial, comercial e industrial.</p></div>
    <div className="mb-8 grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
      <label className="relative"><span className="sr-only">Buscar productos</span><Search className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-black/35" size={20}/><input autoFocus={params.get("focus")==="search"} value={search} onChange={(event)=>update("search",event.target.value)} className="min-h-14 w-full rounded-2xl border border-black/10 bg-white py-4 pl-14 pr-5 font-semibold outline-none focus:border-[#19A2B6]" placeholder="Buscar producto..."/></label>
      <label><span className="sr-only">Categoría</span><select value={category} onChange={(event)=>update("category",event.target.value)} className="min-h-14 w-full rounded-2xl border border-black/10 bg-white px-4 font-bold"><option value="">Todas las categorías</option>{filters.categories.map((value)=><option key={value}>{value}</option>)}</select></label>
      <label><span className="sr-only">Marca</span><select value={brand} onChange={(event)=>update("brand",event.target.value)} className="min-h-14 w-full rounded-2xl border border-black/10 bg-white px-4 font-bold"><option value="">Todas las marcas</option>{filters.brands.map((value)=><option key={value}>{value}</option>)}</select></label>
      <label><span className="sr-only">Ordenar catálogo</span><select value={sort} onChange={(event)=>update("sort",event.target.value)} className="min-h-14 w-full rounded-2xl border border-black/10 bg-white px-4 font-bold">{sorts.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    </div>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><p className="font-black">{pagination.total} {pagination.total===1?"resultado":"resultados"}</p>{(search||category||brand||sort!=="featured")&&<button type="button" onClick={clearFilters} className="min-h-11 rounded-full border border-black/15 px-5 text-sm font-black">Limpiar filtros</button>}</div>
    {loading?<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-label="Cargando catálogo">{Array.from({length:6},(_,index)=><div key={index} className="h-[32rem] animate-pulse rounded-[2.25rem] bg-white"/>)}</div>:error?<div className="rounded-[2rem] bg-red-50 p-8"><h2 className="text-3xl font-black">No pudimos cargar el catálogo</h2><p className="mt-3 text-black/60">{error}</p><button type="button" onClick={()=>refetch()} className="mt-6 rounded-full bg-[#111] px-6 py-3 text-sm font-black text-white">Reintentar</button></div>:items.length?<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{items.map((item)=><ProductCard key={`${item.type}-${item.id}`} product={item}/>)}</div>:<div className="rounded-[2rem] bg-white px-6 py-20 text-center shadow-sm"><h2 className="text-3xl font-black">No encontramos productos</h2><p className="mt-3 text-black/55">Prueba con otra búsqueda o elimina los filtros.</p><button type="button" onClick={clearFilters} className="mt-6 rounded-full bg-[#19A2B6] px-6 py-3 text-sm font-black text-white">Limpiar filtros</button></div>}
    {!loading&&!error&&pagination.pages>1&&<nav aria-label="Paginación del catálogo" className="mt-10 flex items-center justify-center gap-4"><button type="button" disabled={page<=1} onClick={()=>update("page",String(page-1))} className="min-h-11 rounded-full border border-black/15 px-5 font-black disabled:opacity-35">Anterior</button><span className="font-bold">Página {page} de {pagination.pages}</span><button type="button" disabled={page>=pagination.pages} onClick={()=>update("page",String(page+1))} className="min-h-11 rounded-full border border-black/15 px-5 font-black disabled:opacity-35">Siguiente</button></nav>}
  </div></section></>;
}
