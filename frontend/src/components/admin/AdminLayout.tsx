import { BarChart3, Boxes, ChevronRight, ClipboardList, Layers3, LogOut, Package, Settings, Users } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

const links = [
  { to: "/admin", label: "Dashboard", Icon: BarChart3, end: true },
  { to: "/admin/orders", label: "Pedidos", Icon: ClipboardList },
  { to: "/admin/customers", label: "Clientes", Icon: Users },
  { to: "/admin/products", label: "Productos", Icon: Package },
  { to: "/admin/product-families", label: "Familias", Icon: Layers3 },
  { to: "/admin/inventory", label: "Inventario", Icon: Boxes },
  { to: "/admin/settings", label: "Configuración", Icon: Settings },
];

export function AdminLayout() {
  const location = useLocation(); const navigate = useNavigate();
  const user = useAuthStore((state) => state.user); const logout = useAuthStore((state) => state.logout);
  const current = links.find((link) => link.end ? location.pathname === link.to : location.pathname.startsWith(link.to));
  async function leave() { await logout(); navigate("/admin/login"); }
  return <div className="min-h-screen bg-[#F4F5F7] text-[#111] lg:grid lg:grid-cols-[250px_1fr]">
    <aside className="border-b border-black/5 bg-[#111] p-5 text-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0">
      <div className="flex items-center gap-3 px-2 py-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#19A2B6] text-xl font-black">M</span><div><p className="font-black">Magno Clean</p><p className="text-xs font-bold text-white/40">ERP administrativo</p></div></div>
      <nav className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">{links.map(({ to, label, Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black transition ${isActive ? "bg-[#19A2B6] text-white" : "text-white/60 hover:bg-white/10 hover:text-white"}`}><Icon size={18}/>{label}</NavLink>)}</nav>
      <button onClick={leave} className="mt-6 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black text-white/60 hover:bg-white/10 hover:text-white"><LogOut size={18}/>Cerrar sesión</button>
    </aside>
    <div className="min-w-0">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-black/5 bg-white/90 px-5 py-4 backdrop-blur-xl lg:px-8"><div className="flex items-center gap-2 text-sm font-bold text-black/45"><span>Admin</span><ChevronRight size={15}/><span className="text-black">{current?.label || "Detalle"}</span></div><div className="text-right"><p className="text-sm font-black">{user?.name}</p><p className="text-xs font-bold text-black/40">{user?.email}</p></div></header>
      <main><Outlet /></main>
    </div>
  </div>;
}
