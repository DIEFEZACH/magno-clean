import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { AdminPageHeader, AdminSkeleton, formatCurrency, formatDate, Pagination } from "../components/admin/AdminUi";
import { apiFetch } from "../lib/api";

type Order={id:string;customerName:string;customerEmail:string;total:number;status:string;createdAt:string;payment?:{status:string};_count:{items:number}};
type OrderResponse={orders:Order[];pagination:{page:number;pages:number;total:number}};
const statuses=['PENDING','PAID','PROCESSING','SHIPPED','DELIVERED','CANCELLED','REFUNDED'];

export function AdminOrders(){
  const [params,setParams]=useSearchParams();
  const filters={search:params.get("search")||"",status:params.get("status")||"",from:params.get("from")||"",to:params.get("to")||"",minAmount:params.get("minAmount")||"",maxAmount:params.get("maxAmount")||"",page:Number(params.get("page")||1)};
  const update=(key:string,value:string)=>{const next=new URLSearchParams(params);if(value)next.set(key,value);else next.delete(key);if(key!=="page")next.delete("page");setParams(next,{replace:true});};
  const query=useQuery({queryKey:["admin-orders",filters],queryFn:async()=>{const q=new URLSearchParams({page:String(filters.page),pageSize:"20"});Object.entries(filters).forEach(([key,value])=>{if(key!=="page"&&value)q.set(key,String(value))});const response=await apiFetch(`/api/admin/orders?${q}`);if(!response.ok)throw new Error("No fue posible cargar los pedidos");return response.json() as Promise<OrderResponse>}});
  const data=query.data;
  return <section className="p-5 lg:p-8"><AdminPageHeader eyebrow="Operaciones" title={`Pedidos${data ? ` (${data.pagination.total})` : ""}`}/>
    <div className="mt-7 grid gap-3 rounded-[1.5rem] bg-white p-4 lg:grid-cols-4">
      <label className="relative lg:col-span-2"><span className="sr-only">Buscar pedido</span><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30" size={18}/><input value={filters.search} onChange={e=>update("search",e.target.value)} placeholder="Buscar cliente, correo, código u orden" className="w-full rounded-2xl border border-black/10 py-3 pl-11 pr-4 font-bold outline-none focus:border-[#19A2B6]"/></label>
      <label className="grid gap-1 text-xs font-black text-black/50">Estado<select value={filters.status} onChange={e=>update("status",e.target.value)} className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold text-black"><option value="">Todos los estados</option>{statuses.map(s=><option key={s}>{s}</option>)}</select></label>
      <button type="button" onClick={()=>setParams({}, {replace:true})} disabled={!params.toString()} className="self-end rounded-full bg-black/5 px-5 py-3 text-sm font-black disabled:opacity-30">Limpiar filtros</button>
      <label className="grid gap-1 text-xs font-black text-black/50">Fecha desde<input type="date" value={filters.from} onChange={e=>update("from",e.target.value)} className="rounded-2xl border border-black/10 px-4 py-3 text-sm font-bold text-black"/></label>
      <label className="grid gap-1 text-xs font-black text-black/50">Fecha hasta<input type="date" value={filters.to} onChange={e=>update("to",e.target.value)} className="rounded-2xl border border-black/10 px-4 py-3 text-sm font-bold text-black"/></label>
      <label className="grid gap-1 text-xs font-black text-black/50">Monto mínimo<input type="number" min="0" step="0.01" value={filters.minAmount} onChange={e=>update("minAmount",e.target.value)} className="rounded-2xl border border-black/10 px-4 py-3 text-sm font-bold text-black"/></label>
      <label className="grid gap-1 text-xs font-black text-black/50">Monto máximo<input type="number" min="0" step="0.01" value={filters.maxAmount} onChange={e=>update("maxAmount",e.target.value)} className="rounded-2xl border border-black/10 px-4 py-3 text-sm font-bold text-black"/></label>
    </div>
    <div className="mt-5 overflow-x-auto rounded-[1.5rem] bg-white"><table className="w-full min-w-[850px] text-left"><thead className="border-b border-black/5 text-xs uppercase tracking-wider text-black/40"><tr>{['Pedido','Cliente','Estado','Pago','Artículos','Total','Fecha',''].map(x=><th key={x} className="px-5 py-4">{x}</th>)}</tr></thead><tbody>{data?.orders.map(o=><tr key={o.id} className="border-b border-black/5 last:border-0"><td className="px-5 py-4 text-xs font-black text-[#19A2B6]">{o.id}</td><td className="px-5 py-4"><p className="font-black">{o.customerName}</p><p className="text-xs font-bold text-black/40">{o.customerEmail}</p></td><td className="px-5 py-4"><span className="rounded-full bg-black/5 px-3 py-1 text-xs font-black">{o.status}</span></td><td className="px-5 py-4 text-xs font-black">{o.payment?.status||'SIN PAGO'}</td><td className="px-5 py-4 font-bold">{o._count.items}</td><td className="px-5 py-4 font-black">{formatCurrency(o.total)}</td><td className="px-5 py-4 text-sm font-bold text-black/45">{formatDate(o.createdAt)}</td><td className="px-5 py-4"><Link to={`/admin/orders/${o.id}`} className="font-black text-[#19A2B6]">Ver</Link></td></tr>)}</tbody></table>{query.isLoading&&<AdminSkeleton/>}{query.isError&&<div className="p-10 text-center"><p className="font-black text-red-500">{query.error.message}</p><button type="button" onClick={()=>query.refetch()} className="mt-3 font-black text-[#19A2B6]">Reintentar</button></div>}{data&&!data.orders.length&&<p className="p-12 text-center font-bold text-black/40">No encontramos pedidos con estos filtros</p>}</div>
    <Pagination page={filters.page} pages={data?.pagination.pages||1} onPage={page=>update("page",String(page))}/>
  </section>;
}
