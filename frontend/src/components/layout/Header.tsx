import { Menu, Search, ShoppingCart, X } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useState } from "react";
import { useCartStore } from "../../store/cartStore";

export function Header() {
    const items = useCartStore((state) => state.items);
    const [menuOpen,setMenuOpen]=useState(false);

    const totalItems = items.reduce(
    (acc, item) => acc + item.quantity,
    0
    );
  return (
    <header className="sticky top-0 z-50 border-b border-black/5 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">

        {/* LOGO */}
        <Link to="/" aria-label="Magno Clean, inicio" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#19A2B6] text-lg font-black text-white shadow-sm">
            M
          </div>

          <div>
            <p className="text-lg font-black tracking-tight">
              MAGNO CLEAN
            </p>

            <p className="text-xs font-medium uppercase tracking-[0.25em] text-black/45">
              Technology Cleaning
            </p>
          </div>
        </Link>

        {/* NAVIGATION */}
        <nav className="hidden items-center gap-8 text-sm font-semibold text-black/70 lg:flex">
          <NavLink
            to="/productos"
            className="transition hover:text-[#19A2B6]"
          >
            Productos
          </NavLink>

          <NavLink
            to="/categorias"
            className="transition hover:text-[#19A2B6]"
          >
            Categorías
          </NavLink>

          <NavLink
            to="/nosotros"
            className="transition hover:text-[#19A2B6]"
          >
            Nosotros
          </NavLink>

          <NavLink
            to="/soporte"
            className="transition hover:text-[#19A2B6]"
          >
            Soporte
          </NavLink>
        </nav>

        {/* ACTIONS */}
        <div className="flex items-center gap-3">

          {/* SEARCH */}
          <Link to="/productos?focus=search" aria-label="Buscar productos" className="hidden rounded-full p-2.5 transition hover:bg-black/5 md:inline-flex">
            <Search size={20} />
          </Link>

          {/* CART */}
          <Link
            to="/carrito"
            aria-label={`Carrito, ${totalItems} productos`}
            className="relative rounded-full bg-[#111111] p-2.5 text-white transition hover:bg-[#19A2B6]"
            >
            <ShoppingCart size={20} />

            {totalItems > 0 && (
                <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EF8329] px-1.5 text-xs font-black text-white">
                {totalItems}
                </span>
            )}
            </Link>

          {/* MOBILE MENU */}
          <button type="button" aria-label={menuOpen?"Cerrar menú":"Abrir menú"} aria-expanded={menuOpen} onClick={()=>setMenuOpen(value=>!value)} className="rounded-full p-2.5 transition hover:bg-black/5 lg:hidden">
            {menuOpen?<X size={22}/>:<Menu size={22} />}
          </button>
        </div>
      </div>
      {menuOpen&&<nav aria-label="Navegación móvil" className="border-t border-black/5 bg-white px-5 py-4 lg:hidden"><div className="mx-auto grid max-w-7xl gap-2">{[["/productos","Productos"],["/categorias","Categorías"],["/nosotros","Nosotros"],["/soporte","Soporte"],["/contacto","Contacto"]].map(([to,label])=><Link key={to} to={to} onClick={()=>setMenuOpen(false)} className="rounded-xl px-4 py-3 font-bold hover:bg-black/5">{label}</Link>)}</div></nav>}
    </header>
  );
}
