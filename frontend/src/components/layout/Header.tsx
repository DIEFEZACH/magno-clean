import { Menu, Search, ShoppingCart, X } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useCartStore } from "../../store/cartStore";

const mobileLinks = [["/productos","Productos"],["/categorias","Categorías"],["/nosotros","Nosotros"],["/soporte","Soporte"],["/contacto","Contacto"]] as const;

export function Header() {
  const items = useCartStore((state) => state.items);
  const [menuOpen,setMenuOpen]=useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);

  useEffect(()=>{
    if(!menuOpen) return;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    menuRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){setMenuOpen(false);window.setTimeout(()=>triggerRef.current?.focus(),0);return;}
      if(event.key!=="Tab"||!menuRef.current)return;
      const focusable=[...menuRef.current.querySelectorAll<HTMLElement>('a,button:not([disabled])')];
      if(!focusable.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener("keydown",onKeyDown);
    return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener("keydown",onKeyDown);};
  },[menuOpen]);

  return <header className="sticky top-0 z-50 border-b border-black/5 bg-white/90 backdrop-blur-xl">
    <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:min-h-20 sm:px-5 sm:py-4 lg:px-8">
      <Link to="/" aria-label="Magno Clean, inicio" className="flex min-w-0 items-center gap-2 sm:gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#19A2B6] text-base font-black text-white shadow-sm sm:h-11 sm:w-11 sm:rounded-2xl sm:text-lg">M</span>
        <span className="min-w-0"><span className="block whitespace-nowrap text-base font-black tracking-tight sm:text-lg">MAGNO CLEAN</span><span className="hidden text-xs font-medium uppercase tracking-[0.2em] text-black/45 sm:block xl:tracking-[0.25em]">Technology Cleaning</span></span>
      </Link>
      <nav className="hidden items-center gap-6 text-sm font-semibold text-black/70 lg:flex xl:gap-8" aria-label="Navegación principal">
        {mobileLinks.slice(0,4).map(([to,label])=><NavLink key={to} to={to} className="rounded-md py-2 transition hover:text-[#19A2B6]">{label}</NavLink>)}
      </nav>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <Link to="/productos?focus=search" aria-label="Buscar productos" className="hidden min-h-11 min-w-11 items-center justify-center rounded-full transition hover:bg-black/5 sm:inline-flex"><Search size={20}/></Link>
        <Link to="/carrito" aria-label={`Carrito, ${totalItems} productos`} className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#111] text-white transition hover:bg-[#19A2B6]"><ShoppingCart size={20}/>{totalItems>0&&<span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#EF8329] px-1 text-[11px] font-black text-white">{totalItems>99?"99+":totalItems}</span>}</Link>
        <button ref={triggerRef} type="button" aria-label={menuOpen?"Cerrar menú":"Abrir menú"} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={()=>setMenuOpen(value=>!value)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full transition hover:bg-black/5 lg:hidden">{menuOpen?<X size={22}/>:<Menu size={22}/>}</button>
      </div>
    </div>
    {menuOpen&&<div className="fixed inset-x-0 top-16 h-[calc(100dvh-4rem)] bg-black/30 sm:top-20 sm:h-[calc(100dvh-5rem)] lg:hidden" onMouseDown={(event)=>{if(event.target===event.currentTarget){setMenuOpen(false);triggerRef.current?.focus();}}}><div ref={menuRef} id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Menú de navegación" className="max-h-full overflow-y-auto border-t border-black/5 bg-white px-4 py-4 shadow-xl"><nav className="mx-auto grid max-w-7xl gap-1">{mobileLinks.map(([to,label])=><NavLink key={to} to={to} onClick={()=>setMenuOpen(false)} className={({isActive})=>`flex min-h-12 items-center rounded-xl px-4 font-bold ${isActive?"bg-[#19A2B6]/10 text-[#147f8e]":"hover:bg-black/5"}`}>{label}</NavLink>)}<Link to="/productos?focus=search" onClick={()=>setMenuOpen(false)} className="mt-2 flex min-h-12 items-center gap-3 rounded-xl border border-black/10 px-4 font-bold"><Search size={19}/>Buscar productos</Link></nav></div></div>}
  </header>;
}
