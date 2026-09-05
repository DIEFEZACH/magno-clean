import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check, CheckCheck, ChevronDown, CircleAlert, Download, ImageOff, Layers3, Package, RefreshCw, Search } from "lucide-react";
import { apiFetch } from "../lib/api";
import { formatCurrency } from "../components/admin/AdminUi";
import { emptyPublicationFilters, filterPublications, loadPublicationUniverse, publicationEditPath, publicationsCsv, type Publication, type PublicationFilters } from "../lib/adminPublications";

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#117e8d] focus-visible:ring-offset-2";
const button = `inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${focus}`;
const field = `min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 ${focus}`;

function PublicationImage({ item }: { item: Publication }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <div className="flex aspect-square w-20 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white p-2 sm:w-24">
    {item.imageUrl && failedUrl !== item.imageUrl ? <img src={item.imageUrl} alt={item.name} width={96} height={96} loading="lazy" decoding="async" className="h-full w-full object-contain" onError={() => setFailedUrl(item.imageUrl)} /> : <div className="grid justify-items-center gap-1 text-slate-400"><ImageOff size={24} aria-hidden="true" /><span className="text-[10px]">{failedUrl ? "No disponible" : "Sin imagen"}</span></div>}
  </div>;
}

function PublicationChecklist({ item }: { item: Publication }) {
  const complete = item.checks.filter((check) => check.ready).length;
  return <details className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70">
    <summary className={`flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm ${focus}`}>
      <span className="flex items-center gap-2 font-bold">{complete === item.checks.length ? <CheckCheck size={17} className="text-[#117e8d]" aria-hidden="true" /> : <CircleAlert size={17} className="text-amber-700" aria-hidden="true" />}Ficha {complete}/{item.checks.length}</span>
      <span className="flex items-center gap-1 text-xs text-slate-600">{complete === item.checks.length ? "Completa" : "Por completar"}<ChevronDown size={15} aria-hidden="true" /></span>
    </summary>
    <ul className="grid gap-2 border-t border-slate-200 px-3 py-3 text-xs">{item.checks.map((check) => <li key={check.label} className="flex min-w-0 items-start gap-2">{check.ready ? <Check size={14} className="shrink-0 text-[#117e8d]" aria-hidden="true" /> : <CircleAlert size={14} className="shrink-0 text-amber-700" aria-hidden="true" />}<span className="break-words">{check.label}: {check.ready ? "presente" : "pendiente"}</span></li>)}</ul>
  </details>;
}

function priceLabel(item: Publication) {
  if (item.priceFrom === null || item.priceTo === null) return "Precio por completar";
  if (item.priceFrom === item.priceTo) return formatCurrency(item.priceFrom);
  return `${formatCurrency(item.priceFrom)} – ${formatCurrency(item.priceTo)}`;
}

function downloadCsv(items: Publication[], label: string) {
  const url = URL.createObjectURL(new Blob([publicationsCsv(items)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `magno-publicaciones-${label}.csv`;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AdminPublications() {
  const [filters, setFilters] = useState<PublicationFilters>(emptyPublicationFilters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportNotice, setExportNotice] = useState("");
  const query = useQuery({
    queryKey: ["admin-publications-universe"],
    queryFn: ({ signal }) => loadPublicationUniverse(apiFetch, signal),
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const publications = query.data?.publications;
  const visible = useMemo(() => filterPublications(publications || [], filters), [publications, filters]);
  const chosen = visible.filter((item) => selected.has(item.key));
  const allSelected = visible.length > 0 && chosen.length === visible.length;
  const busy = query.isFetching;
  const completeCount = publications?.filter((item) => item.checks.every((check) => check.ready)).length || 0;

  function filter<K extends keyof PublicationFilters>(key: K, value: PublicationFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value })); setSelected(new Set()); setExportNotice("");
  }
  function toggle(item: Publication) {
    setSelected((current) => { const next = new Set(current); if (next.has(item.key)) next.delete(item.key); else next.add(item.key); return next; });
  }
  function exportItems(items: Publication[], label: string) {
    try { downloadCsv(items, label); setExportNotice(`CSV preparado: ${items.length} publicaciones. No se modificaron datos.`); }
    catch { setExportNotice("No pudimos preparar el archivo. Intenta exportar de nuevo."); }
  }

  return <section className="min-h-screen min-w-0 bg-[#f5f7f8] px-3 py-6 text-slate-900 sm:px-6 sm:py-9 lg:px-8">
    <div className="mx-auto min-w-0 max-w-[1440px]">
      <header className="min-w-0 rounded-2xl bg-[#102f38] p-5 text-white sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#92dce4]">Admin · Biblioteca comercial</p>
        <div className="mt-3 flex min-w-0 flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0"><h1 className="break-words text-3xl font-black leading-tight tracking-tight sm:text-4xl">Centro de publicaciones</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">Todo el catálogo, en un solo lugar. Revisa las fichas, abre su editor y exporta lo que necesitas sin cambiar productos.</p></div>
          <button type="button" disabled={busy} className={`${button} shrink-0 self-start border border-white/25 bg-white/10 text-white hover:bg-white/20 focus-visible:ring-white`} onClick={() => { setSelected(new Set()); void query.refetch(); }}><RefreshCw size={17} aria-hidden="true" />{busy ? "Consultando…" : "Actualizar catálogo"}</button>
        </div>
      </header>

      {query.isPending ? <div role="status" className="mt-6 rounded-2xl border border-slate-200 bg-white p-8"><h2 className="text-lg font-bold">Consultando el catálogo completo</h2><p className="mt-2 text-sm text-slate-600">Cargando productos y familias de todas las páginas. No se mostrarán resultados parciales.</p></div> : query.isError ? <div role="alert" className="mt-6 rounded-2xl border border-amber-200 bg-white p-6"><h2 className="text-lg font-bold">No pudimos cargar las publicaciones</h2><p className="mt-2 text-sm text-slate-600">{query.error instanceof Error ? query.error.message : "Intenta de nuevo."}</p><button type="button" disabled={busy} className={`${button} mt-4 bg-[#117e8d] text-white`} onClick={() => void query.refetch()}>Reintentar</button></div> : <>
        <dl className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { label: "Publicaciones administrativas", value: publications?.length || 0, note: "Familias + SKU independientes" },
            { label: "Visibles en catálogo", value: publications?.filter((item) => item.publicVisible).length || 0, note: "Activas y con SKU activo" },
            { label: "Productos consultados", value: query.data?.products.length || 0, note: `${query.data?.families.length || 0} familias · todas las páginas` },
            { label: "Fichas completas", value: completeCount, note: "Presencia de campos, no aprobación" },
          ].map((metric) => <div key={metric.label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><dt className="break-words text-xs font-semibold leading-5 text-slate-600">{metric.label}</dt><dd className="mt-1 text-3xl font-black tracking-tight">{metric.value}</dd><p className="mt-2 break-words text-[11px] leading-4 text-slate-500">{metric.note}</p></div>)}
        </dl>

        <div className="mt-5 min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Estado de las publicaciones">{([
            ["all", "Todas", publications?.length || 0], ["active", "Activas", publications?.filter((item) => item.active).length || 0], ["inactive", "Inactivas", publications?.filter((item) => !item.active).length || 0],
          ] as const).map(([value, label, count]) => <button type="button" key={value} aria-pressed={filters.status === value} onClick={() => filter("status", value)} className={`${button} ${filters.status === value ? "bg-[#117e8d] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{label}<span className="rounded-md bg-black/10 px-1.5 py-0.5 text-xs">{count}</span></button>)}</div>
          <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <label className="grid min-w-0 gap-2 text-xs font-bold lg:col-span-2 xl:col-span-1">Buscar en todo el catálogo<span className="relative min-w-0"><Search size={18} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" aria-hidden="true" /><input type="search" value={filters.search} onChange={(event) => filter("search", event.target.value)} placeholder="Nombre, marca, código o familia" className={`${field} pl-10`} /></span></label>
            <label className="grid min-w-0 gap-2 text-xs font-bold">Tipo<select className={field} value={filters.type} onChange={(event) => filter("type", event.target.value as PublicationFilters["type"])}><option value="all">Familias e individuales</option><option value="FAMILY">Sólo familias</option><option value="PRODUCT">Sólo individuales</option></select></label>
            <label className="grid min-w-0 gap-2 text-xs font-bold">Completitud<select className={field} value={filters.missing} onChange={(event) => filter("missing", event.target.value as PublicationFilters["missing"])}><option value="all">Todas las fichas</option><option value="image">Sin imagen</option><option value="description">Sin descripción</option><option value="incomplete">Por completar</option></select></label>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">El checklist confirma campos presentes; no valida técnicamente imágenes o textos. Editorial: <strong className="font-semibold text-slate-700">Sin evaluar</strong>. Esta vista no consulta ni publica revisiones.</p>
        </div>

        <div className="mt-5 flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0"><p className="text-sm font-bold" aria-live="polite">{visible.length} de {publications?.length || 0} publicaciones · {chosen.length} seleccionadas</p><label className={`mt-1 inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-lg text-sm ${focus}`}><input type="checkbox" className={`h-5 w-5 accent-[#117e8d] ${focus}`} checked={allSelected} disabled={!visible.length || busy} aria-label="Seleccionar todas las publicaciones filtradas" onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((item) => item.key)))} />Seleccionar resultado filtrado</label></div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2"><button type="button" className={`${button} border border-slate-200 bg-white hover:bg-slate-50`} disabled={!chosen.length || busy} onClick={() => exportItems(chosen, "seleccion")}><Download size={17} aria-hidden="true" />Exportar selección ({chosen.length})</button><button type="button" className={`${button} bg-[#102f38] text-white hover:bg-[#117e8d]`} disabled={!visible.length || busy} onClick={() => exportItems(visible, "filtradas")}><Download size={17} aria-hidden="true" />Exportar resultado ({visible.length})</button></div>
        </div>
        <p className="mt-2 min-h-5 text-sm text-[#117e8d]" role="status">{exportNotice}</p>

        {!visible.length ? <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center"><Package className="mx-auto text-slate-400" size={32} aria-hidden="true" /><h2 className="mt-3 text-xl font-bold">{publications?.length ? "Sin coincidencias" : "Aún no hay publicaciones"}</h2><p className="mt-2 text-sm text-slate-600">{publications?.length ? "Prueba con otro nombre, código o filtro." : "Aquí aparecerán los productos y familias existentes; esta vista no crea datos."}</p>{Boolean(publications?.length) && <button type="button" className={`${button} mt-4 border border-slate-200`} onClick={() => { setFilters(emptyPublicationFilters); setSelected(new Set()); }}>Limpiar filtros</button>}</div> : <ul className="mt-3 grid min-w-0 gap-3" aria-label="Publicaciones">
          {visible.map((item) => <li key={item.key} className={`min-w-0 rounded-2xl border bg-white p-4 transition sm:p-5 ${selected.has(item.key) ? "border-[#117e8d] ring-1 ring-[#117e8d]/20" : "border-slate-200"}`}>
            <article className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,.85fr)_minmax(0,.8fr)]">
              <div className="min-w-0"><div className="flex min-w-0 items-start gap-3"><PublicationImage item={item} /><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-1.5"><span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide">{item.type === "FAMILY" ? <Layers3 size={12} aria-hidden="true" /> : <Package size={12} aria-hidden="true" />}{item.type === "FAMILY" ? "Familia" : "Individual"}</span><span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${item.active ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-600"}`}>{item.active ? "Activa" : "Inactiva"}</span></div><h2 className="mt-2 break-words text-lg font-black leading-snug [overflow-wrap:anywhere]">{item.name || "Nombre por completar"}</h2><p className="mt-1 break-words text-xs text-slate-500">{item.brand} · {item.category}</p></div></div>
                <label className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" aria-label={`Seleccionar ${item.name}`} className={`h-5 w-5 accent-[#117e8d] ${focus}`} checked={selected.has(item.key)} disabled={busy} onChange={() => toggle(item)} />Seleccionar publicación</label>
                <p className="mt-1 break-words text-xs leading-5 text-slate-600 [overflow-wrap:anywhere]">{item.type === "FAMILY" ? `${item.products.length} variantes · ${item.products.filter((product) => product.active).length} activas` : `SKU: ${item.products[0]?.code || "Por completar"}`}</p>
                {item.type === "FAMILY" && <details className="mt-1 min-w-0"><summary className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg text-xs font-bold text-[#117e8d] ${focus}`}>Códigos y presentaciones<ChevronDown size={14} aria-hidden="true" /></summary><ul className="grid gap-1 text-xs text-slate-600">{item.products.map((product) => <li key={product.id} className="break-words [overflow-wrap:anywhere]">{product.code || "Sin código"} · {product.variantLabel || "Presentación pendiente"}{!product.active && " · Inactiva"}</li>)}</ul></details>}
              </div>
              <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{item.type === "FAMILY" ? "Precio de presentaciones activas*" : "Precio MXN"}</p><p className="mt-1 break-words text-xl font-black tracking-tight [overflow-wrap:anywhere]">{priceLabel(item)}</p>{item.type === "FAMILY" && <p className="mt-1 text-[10px] leading-4 text-slate-500">* Si no hay activas, muestra el rango registrado.</p>}<div className="mt-4"><PublicationChecklist item={item} /></div><p className="mt-3 text-xs text-slate-500">Editorial: <span className="font-semibold text-slate-700">Sin evaluar</span></p></div>
              <div className="grid min-w-0 content-start gap-2"><Link to={publicationEditPath(item)} className={`${button} bg-[#102f38] text-white hover:bg-[#117e8d]`}>Editar {item.type === "FAMILY" ? "familia" : "producto"}<ArrowUpRight size={16} aria-hidden="true" /></Link>{item.publicVisible ? <Link to={`/producto/${encodeURIComponent(item.slug)}`} className={`${button} border border-slate-200 hover:bg-slate-50`}>Ver publicación<ArrowUpRight size={16} aria-hidden="true" /></Link> : <p className="rounded-xl bg-slate-50 p-3 text-center text-xs leading-5 text-slate-600">No visible en catálogo{item.type === "FAMILY" && item.active ? ": sin variantes activas" : ": ficha inactiva"}.</p>}<p className="text-center text-[10px] leading-4 text-slate-500">Abrir el editor no guarda cambios.</p></div>
            </article>
          </li>)}
        </ul>}
      </>}
    </div>
  </section>;
}
