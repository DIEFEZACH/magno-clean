import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FilePenLine, RefreshCw, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { AdminPageHeader, AdminSkeleton } from "../components/admin/AdminUi";
import { apiFetch } from "../lib/api";
import { fetchWebsiteContent } from "../lib/websiteContent";
import type { ContentTargetType, WebsiteContent, WebsiteContentStatus } from "../types/websiteContent";

type Target = { id: string; type: ContentTargetType; name: string; code?: string; family?: string; content: WebsiteContent | null };
type Filter = "ALL" | WebsiteContentStatus | "NONE" | "CONFLICT";
const statusLabel: Record<WebsiteContentStatus, string> = { DRAFT: "Borrador", REVIEW: "En revisión", APPROVED: "Aprobado", PUBLISHED: "Publicado" };
const statusClass: Record<WebsiteContentStatus, string> = { DRAFT: "bg-slate-100 text-slate-700", REVIEW: "bg-amber-100 text-amber-800", APPROVED: "bg-sky-100 text-sky-800", PUBLISHED: "bg-emerald-100 text-emerald-800" };

export function AdminContent() {
  const [targets, setTargets] = useState<Target[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [search, setSearch] = useState(""), [filter, setFilter] = useState<Filter>("ALL");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [productsResponse, familiesResponse] = await Promise.all([apiFetch("/api/admin/products?page=1&pageSize=100"), apiFetch("/api/admin/product-families?page=1&pageSize=100")]);
      if (!productsResponse.ok || !familiesResponse.ok) throw new Error("No se pudo cargar el catálogo administrativo");
      const products = (await productsResponse.json()).products || [], families = (await familiesResponse.json()).families || [];
      const base: Omit<Target, "content">[] = [
        ...families.map((item: { id: string; name: string }) => ({ id: item.id, name: item.name, type: "family" as const })),
        ...products.map((item: { id: string; name: string; code: string; family?: { name: string } | null }) => ({ id: item.id, name: item.name, code: item.code, family: item.family?.name, type: "product" as const })),
      ];
      const resolved: Target[] = [];
      for (let index = 0; index < base.length; index += 12) {
        resolved.push(...await Promise.all(base.slice(index, index + 12).map(async (item) => ({ ...item, content: await fetchWebsiteContent(item.type, item.id) }))));
      }
      setTargets(resolved);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cargar el contenido"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    // La consulta inicial sincroniza la vista con las entidades editoriales protegidas.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const visible = useMemo(() => targets.filter((target) => {
    const term = search.trim().toLocaleLowerCase("es");
    const latest = target.content?.revisions[0];
    const matchesSearch = !term || [target.name, target.code, target.family].some((value) => value?.toLocaleLowerCase("es").includes(term));
    const matchesFilter = filter === "ALL" || (filter === "NONE" ? !target.content?.revisions.length : filter === "CONFLICT" ? target.content?.sources.some((source) => source.reviewRequired) : latest?.status === filter);
    return matchesSearch && matchesFilter;
  }), [filter, search, targets]);
  return <section className="min-h-screen px-4 py-8 sm:px-5 sm:py-10 lg:px-8"><div className="mx-auto max-w-7xl">
    <AdminPageHeader eyebrow="Editorial" title="Contenido web" actions={<button type="button" onClick={() => void load()} className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-5 font-black shadow-sm"><RefreshCw size={18}/>Actualizar</button>}/>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-black/55">Gestiona por separado la fuente técnica, el contenido derivado y la única capa autorizada para publicación.</p>
    <div className="mt-7 grid gap-3 rounded-[1.5rem] bg-white p-4 shadow-sm md:grid-cols-[1fr_auto]">
      <label className="relative"><span className="sr-only">Buscar contenido</span><Search className="absolute left-4 top-3.5 text-black/35" size={18}/><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Buscar nombre, código o familia..." className="min-h-11 w-full rounded-xl border border-black/10 pl-11 pr-4 outline-none focus:border-[#19A2B6] focus:ring-2 focus:ring-[#19A2B6]/20"/></label>
      <label><span className="sr-only">Filtrar estado</span><select value={filter} onChange={(event)=>setFilter(event.target.value as Filter)} className="min-h-11 w-full rounded-xl border border-black/10 bg-white px-4 font-bold outline-none focus:border-[#19A2B6] md:w-auto"><option value="ALL">Todos los estados</option><option value="DRAFT">Borrador</option><option value="REVIEW">En revisión</option><option value="APPROVED">Aprobado</option><option value="PUBLISHED">Publicado</option><option value="NONE">Sin contenido</option><option value="CONFLICT">Con conflicto</option></select></label>
    </div>
    {loading ? <div className="mt-6"><AdminSkeleton/></div> : error ? <div role="alert" className="mt-6 rounded-[1.5rem] border border-red-200 bg-red-50 p-6"><h2 className="font-black text-red-800">No pudimos cargar el contenido</h2><p className="mt-2 text-sm text-red-700">{error}</p><button onClick={() => void load()} className="mt-5 min-h-11 rounded-full bg-red-700 px-5 font-black text-white">Reintentar</button></div> : visible.length === 0 ? <div className="mt-6 rounded-[1.5rem] bg-white p-10 text-center"><FilePenLine className="mx-auto text-black/25" size={36}/><h2 className="mt-4 text-xl font-black">Sin resultados editoriales</h2><p className="mt-2 text-sm text-black/50">Ajusta la búsqueda o los filtros.</p></div> : <div className="mt-6 grid gap-3">
      {visible.map((target) => { const latest=target.content?.revisions[0], published=target.content?.publishedRevision, conflict=target.content?.sources.some((source)=>source.reviewRequired); return <Link key={`${target.type}-${target.id}`} to={`/admin/content/${target.type === "family" ? "families" : "products"}/${target.id}`} className="grid min-w-0 gap-4 rounded-[1.5rem] bg-white p-5 shadow-sm outline-none transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#19A2B6] md:grid-cols-[minmax(0,1.5fr)_minmax(120px,.6fr)_minmax(120px,.7fr)_auto] md:items-center">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-black uppercase">{target.type === "family" ? "Familia" : "Producto"}</span>{conflict&&<span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800"><AlertTriangle size={13}/>Revisión requerida</span>}</div><h2 className="mt-2 break-words text-lg font-black">{target.name}</h2><p className="mt-1 break-all text-xs font-bold text-black/45">{target.code || target.family || "Contenido común de familia"}</p></div>
        <div><p className="text-xs font-bold text-black/40">Estado actual</p>{latest?<span className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-black ${statusClass[latest.status]}`}>{statusLabel[latest.status]}</span>:<span className="mt-1 inline-block text-sm font-bold text-black/45">Sin contenido</span>}</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-1"><div><p className="text-xs font-bold text-black/40">Publicado</p><p className="mt-1 text-sm font-black">{published?`v${published.version}`:"—"}</p></div><div><p className="text-xs font-bold text-black/40">Borrador</p><p className="mt-1 text-sm font-black">{target.content?.revisions.find((revision)=>revision.status==="DRAFT")?.version ? `v${target.content.revisions.find((revision)=>revision.status==="DRAFT")!.version}`:"—"}</p></div></div>
        <div className="text-sm font-black text-[#19A2B6]">Gestionar →</div>
      </Link>; })}
    </div>}
  </div></section>;
}
