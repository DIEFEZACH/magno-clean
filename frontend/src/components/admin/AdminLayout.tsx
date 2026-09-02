import { BarChart3, Boxes, ChevronRight, ClipboardList, FilePenLine, Layers3, LogOut, Menu, Package, Settings, Users, X } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../../store/authStore";

const links = [
  { to: "/admin", label: "Dashboard", Icon: BarChart3, end: true }, { to: "/admin/orders", label: "Pedidos", Icon: ClipboardList },
  { to: "/admin/customers", label: "Clientes", Icon: Users }, { to: "/admin/products", label: "Productos", Icon: Package },
  { to: "/admin/product-families", label: "Familias", Icon: Layers3 }, { to: "/admin/inventory", label: "Inventario", Icon: Boxes },
  { to: "/admin/content", label: "Contenido", Icon: FilePenLine },
  { to: "/admin/settings", label: "Configuración", Icon: Settings },
];

export function AdminLayout() {
  const location=useLocation(),navigate=useNavigate();
  const user=useAuthStore((state)=>state.user),logout=useAuthStore((state)=>state.logout);
  const [drawerOpen,setDrawerOpen]=useState(false);
  const drawerRef=useRef<HTMLElement>(null),triggerRef=useRef<HTMLButtonElement>(null);
  const current=links.find((link)=>link.end?location.pathname===link.to:location.pathname.startsWith(link.to));
  async function leave(){await logout();navigate("/admin/login");}
  useEffect(()=>{
    if(!drawerOpen)return;
    const previous=document.body.style.overflow;document.body.style.overflow="hidden";
    drawerRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){setDrawerOpen(false);window.setTimeout(()=>triggerRef.current?.focus(),0);return;}
      if(event.key!=="Tab"||!drawerRef.current)return;
      const nodes=[...drawerRef.current.querySelectorAll<HTMLElement>('a,button:not([disabled])')];const first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener("keydown",onKey);return()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",onKey);};
  },[drawerOpen]);
  const navigation=(mobile=false)=><><div className="flex items-center justify-between gap-3 px-2 py-2"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#19A2B6] text-xl font-black">M</span><div className="min-w-0"><p className="truncate font-black">Magno Clean</p><p className="text-xs font-bold text-white/40">ERP administrativo</p></div></div>{mobile&&<button type="button" aria-label="Cerrar navegación" onClick={()=>setDrawerOpen(false)} className="grid min-h-11 min-w-11 place-items-center rounded-xl hover:bg-white/10"><X size={22}/></button>}</div><nav className="mt-5 grid gap-1" aria-label="Administración">{links.map(({to,label,Icon,end})=><NavLink key={to} to={to} end={end} onClick={()=>mobile&&setDrawerOpen(false)} className={({isActive})=>`flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-black transition ${isActive?"bg-[#19A2B6] text-white":"text-white/65 hover:bg-white/10 hover:text-white"}`}><Icon size={19}/>{label}</NavLink>)}</nav><button onClick={leave} className="mt-5 flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-sm font-black text-white/65 hover:bg-white/10 hover:text-white"><LogOut size={19}/>Cerrar sesión</button></>;
  return <div className="min-h-screen bg-[#F4F5F7] text-[#111] lg:grid lg:grid-cols-[250px_1fr]">
    <aside className="hidden bg-[#111] p-5 text-white lg:sticky lg:top-0 lg:block lg:h-screen">{navigation()}</aside>
    {drawerOpen&&<div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onMouseDown={(event)=>{if(event.target===event.currentTarget){setDrawerOpen(false);triggerRef.current?.focus();}}}><aside ref={drawerRef} role="dialog" aria-modal="true" aria-label="Navegación administrativa" className="h-full w-[min(86vw,320px)] overflow-y-auto bg-[#111] p-4 text-white shadow-2xl">{navigation(true)}</aside></div>}
    <div className="min-w-0">
      <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-black/5 bg-white/95 px-3 py-2 backdrop-blur-xl sm:px-5 lg:px-8"><div className="flex min-w-0 items-center gap-2"><button ref={triggerRef} type="button" aria-label="Abrir navegación administrativa" aria-expanded={drawerOpen} onClick={()=>setDrawerOpen(true)} className="grid min-h-11 min-w-11 place-items-center rounded-xl hover:bg-black/5 lg:hidden"><Menu size={22}/></button><div className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-black/45"><span className="hidden sm:inline">Admin</span><ChevronRight className="hidden sm:block" size={15}/><span className="truncate text-black">{current?.label||"Detalle"}</span></div></div><div className="min-w-0 text-right"><p className="max-w-32 truncate text-sm font-black sm:max-w-56">{user?.name}</p><p className="hidden max-w-56 truncate text-xs font-bold text-black/40 sm:block">{user?.email}</p></div></header>
      <main className="min-w-0"><Outlet/></main>
    </div>
  </div>;
}
