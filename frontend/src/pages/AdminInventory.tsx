import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
type I = {
  id: string;
  code: string;
  name: string;
  category: string;
  stock: number;
  reservedStock: number;
  availableStock: number;
};
export function AdminInventory() {
  const [items, setItems] = useState<I[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  useEffect(() => {
    const t = setTimeout(async () => {
      const p = new URLSearchParams({ page: String(page), search: q, filter });
      const r = await apiFetch(`/api/admin/inventory?${p}`);
      const d = await r.json();
      setItems(d.inventory || []);
      setPages(d.pagination?.pages || 1);
    }, 200);
    return () => clearTimeout(t);
  }, [q, filter, page]);
  return (
    <section className="p-5 lg:p-8">
      <p className="text-sm font-black uppercase tracking-[.25em] text-[#19A2B6]">
        Existencias
      </p>
      <h1 className="mt-2 text-4xl font-black">Inventario</h1>
      <div className="mt-7 flex gap-3 rounded-[1.5rem] bg-white p-4">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Producto o código"
          className="min-w-0 flex-1 rounded-2xl border px-4 py-3 font-bold"
        />
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-2xl border bg-white px-4 font-bold"
        >
          <option value="all">Todos</option>
          <option value="out">Agotados</option>
          <option value="low">Bajo mínimo</option>
        </select>
      </div>
      <div className="mt-5 overflow-x-auto rounded-[1.5rem] bg-white">
        <table className="w-full min-w-[700px] text-left">
          <thead>
            <tr className="border-b text-xs uppercase text-black/40">
              {[
                "Producto",
                "Físico",
                "Reservado",
                "Disponible",
                "Estado",
                "",
              ].map((x) => (
                <th key={x} className="p-5">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b last:border-0">
                <td className="p-5">
                  <p className="font-black">{i.name}</p>
                  <p className="text-xs font-bold text-black/40">
                    {i.code} · {i.category}
                  </p>
                </td>
                <td className="p-5 font-black">{i.stock}</td>
                <td className="p-5 font-black">{i.reservedStock}</td>
                <td className="p-5 font-black">{i.availableStock}</td>
                <td className="p-5">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${i.availableStock <= 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}
                  >
                    {i.availableStock <= 0 ? "AGOTADO" : "DISPONIBLE"}
                  </span>
                </td>
                <td className="p-5">
                  <Link
                    to={`/admin/products/${i.id}/edit`}
                    className="font-black text-[#19A2B6]"
                  >
                    Ajustar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 flex justify-end gap-3">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="rounded-full bg-white px-5 py-2 font-black disabled:opacity-30"
        >
          Anterior
        </button>
        <span className="py-2 font-black">
          {page}/{pages}
        </span>
        <button
          disabled={page >= pages}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-full bg-white px-5 py-2 font-black disabled:opacity-30"
        >
          Siguiente
        </button>
      </div>
    </section>
  );
}
