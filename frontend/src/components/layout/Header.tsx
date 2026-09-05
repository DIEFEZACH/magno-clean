import { ArrowUpRight, ChevronDown, Menu, Search, ShoppingCart, X } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useCartStore } from "../../store/cartStore";
import { useCatalogNavigation } from "../../hooks/useCatalogNavigation";

const links = [["/productos", "Ver todo"], ["/categorias", "Categorías"], ["/nosotros", "Nosotros"], ["/soporte", "Soporte"], ["/contacto", "Contacto"]] as const;

export function Header() {
  const items = useCartStore((state) => state.items);
  const catalog = useCatalogNavigation();
  const families = catalog.items.filter((item) => item.type === "FAMILY");
  const categories = [...new Set(catalog.items.map((item) => item.category))];
  const [menuOpen, setMenuOpen] = useState(false);
  const [familiesOpen, setFamiliesOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const familyTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const closeMenu = () => { setMenuOpen(false); triggerRef.current?.focus(); };

  useEffect(() => {
    if (!familiesOpen) return;
    const close = (event: MouseEvent) => { if (!headerRef.current?.contains(event.target as Node)) setFamiliesOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setFamiliesOpen(false); familyTriggerRef.current?.focus(); } };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [familiesOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    menuRef.current?.querySelector<HTMLElement>("button,a")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); triggerRef.current?.focus(); return; }
      if (event.key !== "Tab" || !menuRef.current) return;
      const focusable = [...menuRef.current.querySelectorAll<HTMLElement>('a,button:not([disabled]),summary')].filter((element) => element.getClientRects().length > 0);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", onKeyDown); };
  }, [menuOpen]);

  return <header ref={headerRef} className="sticky top-0 z-50 border-b border-black/10 bg-white">
    <div className="hidden bg-[#102c31] px-5 py-2 text-center text-[11px] font-semibold tracking-[0.13em] text-white md:block">MAGNO CLEAN · CONOCE EL PRODUCTO. ELIGE TU PRESENTACIÓN.</div>
    <div className="mx-auto grid max-w-[1440px] grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-3 md:grid-cols-[240px_minmax(0,1fr)_auto] md:px-8 md:py-5 xl:px-12">
      <div className="flex min-w-0 items-center gap-2"><button ref={triggerRef} type="button" aria-label="Abrir menú" aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(true)} className="grid min-h-11 min-w-11 place-items-center rounded-full hover:bg-black/5 lg:hidden"><Menu size={23}/></button><Link to="/" aria-label="Magno Clean, inicio" className="min-w-0 leading-none"><span className="block text-[22px] font-black tracking-[-0.055em] text-[#122d32] sm:text-[26px]">MAGNO<span className="text-[#168fa1]">CLEAN</span><span className="text-[#EF8329]">.</span></span><span className="mt-1.5 hidden text-[9px] font-bold uppercase tracking-[0.24em] text-black/45 sm:block">Tecnología de limpieza</span></Link></div>
      <form role="search" onSubmit={(event) => { event.preventDefault(); navigate(`/productos${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`); setFamiliesOpen(false); }} className="order-3 col-span-2 flex min-w-0 items-center rounded-full border border-black/10 bg-[#f4f5f5] pl-5 md:order-none md:col-span-1 md:mx-4"><label className="sr-only" htmlFor="header-search">Buscar por nombre, marca o código</label><input id="header-search" value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="¿Qué producto estás buscando?" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none md:h-12"/><button type="submit" aria-label="Buscar en todo el catálogo" className="grid h-11 w-12 shrink-0 place-items-center rounded-full text-[#167e8b] md:h-12"><Search size={21}/></button></form>
      <Link to="/carrito" aria-label={`Carrito, ${totalItems} productos`} className="inline-flex min-h-11 items-center gap-3 rounded-full px-3 text-[#122d32] hover:bg-black/5"><span className="relative"><ShoppingCart size={23}/>{totalItems > 0 && <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-[#EF8329] px-1 text-[10px] font-bold text-white">{totalItems > 99 ? "99+" : totalItems}</span>}</span><span className="hidden text-xs font-bold xl:block">Mi carrito</span></Link>
    </div>
    <div className="relative hidden border-t border-black/5 lg:block"><nav aria-label="Navegación principal" className="mx-auto flex min-h-12 max-w-[1440px] items-center gap-9 px-8 text-xs font-bold xl:px-12"><NavLink to="/productos" className="inline-flex min-h-12 items-center gap-2 text-[#168fa1]">Catálogo completo <ArrowUpRight size={15}/></NavLink><button ref={familyTriggerRef} type="button" aria-expanded={familiesOpen} aria-controls="family-navigation" onClick={() => setFamiliesOpen(!familiesOpen)} className="inline-flex min-h-12 items-center gap-2">Familias de productos <ChevronDown size={14}/></button>{links.slice(1).map(([to, label]) => <NavLink key={to} to={to} onClick={() => setFamiliesOpen(false)} className="inline-flex min-h-12 items-center hover:text-[#168fa1]">{label}</NavLink>)}</nav>
      {familiesOpen && <div id="family-navigation" className="absolute inset-x-0 top-full border-y border-black/10 bg-white px-8 py-8 shadow-xl"><div className="mx-auto grid max-w-7xl grid-cols-[200px_minmax(0,1fr)] gap-8"><div><p className="text-xs font-bold uppercase tracking-widest text-black/40">Nuestro catálogo</p>{categories.map((category) => <Link onClick={() => setFamiliesOpen(false)} key={category} to={`/productos?category=${encodeURIComponent(category)}`} className="mt-3 flex min-h-11 items-center justify-between border-b border-black/10 text-sm font-bold">{category} <ArrowUpRight size={17}/></Link>)}<Link to="/productos" onClick={() => setFamiliesOpen(false)} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#168fa1]">Ver todo <ArrowUpRight size={16}/></Link></div><div className="grid max-h-[55vh] grid-cols-3 gap-x-6 overflow-y-auto">{families.map((family) => <Link key={family.id} to={`/producto/${family.slug}`} onClick={() => setFamiliesOpen(false)} className="flex min-h-11 items-center break-words border-b border-black/5 py-2 text-xs font-semibold hover:text-[#168fa1]">{family.name}</Link>)}{catalog.loading && <p>Cargando familias…</p>}{catalog.error && <p>Consulta las familias en el catálogo completo.</p>}</div></div></div>}
    </div>
    {menuOpen && <div className="fixed inset-0 z-[70] bg-black/45 lg:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) closeMenu(); }}><div ref={menuRef} id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Menú de navegación" className="h-full w-[min(88vw,380px)] overflow-y-auto bg-white p-5 shadow-xl"><div className="mb-5 flex items-center justify-between border-b border-black/10 pb-4"><span className="font-black text-[#122d32]">Explorar Magno Clean</span><button type="button" aria-label="Cerrar menú" onClick={closeMenu} className="grid min-h-11 min-w-11 place-items-center"><X size={22}/></button></div><nav>{links.map(([to, label]) => <NavLink key={to} to={to} onClick={closeMenu} className="flex min-h-12 items-center justify-between border-b border-black/5 text-sm font-bold">{label}<ArrowUpRight size={16}/></NavLink>)}{families.length > 0 && <details className="mt-3"><summary className="min-h-12 cursor-pointer py-4 text-sm font-bold">Familias de productos</summary><div className="border-l-2 border-[#19a2b6]/20 pl-4">{families.map((family) => <Link key={family.id} to={`/producto/${family.slug}`} onClick={closeMenu} className="flex min-h-11 items-center break-words py-2 text-xs font-semibold">{family.name}</Link>)}<Link to="/productos" onClick={closeMenu} className="flex min-h-11 items-center font-bold text-[#168fa1]">Ver todo</Link></div></details>}</nav></div></div>}
  </header>;
}
