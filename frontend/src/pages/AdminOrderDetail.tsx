/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAdminFeedback } from "../components/admin/AdminFeedback";
type Detail = {
  id: string;
  status: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  total: number;
  currency: string;
  createdAt: string;
  items: Array<{
    id: string;
    productName: string;
    productCode: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  payment?: {
    status: string;
    providerPaymentId?: string;
    providerPreferenceId?: string;
  };
  reservations: Array<{
    id: string;
    quantity: number;
    status: string;
    product: { name: string };
  }>;
  notes: Array<{ id: string; content: string; author: { name: string } }>;
  statusHistory: Array<{
    id: string;
    from: string;
    to: string;
    createdAt: string;
    actor?: { name: string };
  }>;
};
const states = [
  "PENDING",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];
export function AdminOrderDetail() {
  const { id } = useParams();
  const feedback = useAdminFeedback();
  const [o, setO] = useState<Detail | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const load = useCallback(async () => {
    const r = await apiFetch(`/api/admin/orders/${id}`);
    setO((await r.json()).order);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!o)
    return (
      <div className="p-8">
        <div className="h-64 animate-pulse rounded-[2rem] bg-white" />
      </div>
    );
  async function applyStatus(value: string) {
    setPending(true);
    const response = await apiFetch(`/api/admin/orders/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: value }),
    });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return feedback.toast("error", data.message || "No se pudo cambiar el estado");
    await load();
    feedback.toast("success", "Estado del pedido actualizado");
  }
  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const response = await apiFetch(`/api/admin/orders/${id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: note }),
    });
    setPending(false);
    if (!response.ok) return feedback.toast("error", "No se pudo agregar la nota");
    setNote("");
    await load();
    feedback.toast("success", "Nota interna agregada");
  }
  return (
    <section className="p-5 lg:p-8">
      <Link to="/admin/orders" className="text-sm font-black text-[#19A2B6]">
        ← Pedidos
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-black text-black/40">{o.id}</p>
          <h1 className="mt-2 text-4xl font-black">{o.customerName}</h1>
        </div>
        <select
          value={o.status}
          disabled={pending}
          onChange={(e) => { const value=e.target.value; feedback.confirm({ title: "Cambiar estado del pedido", description: `El pedido cambiará de ${o.status} a ${value}. Esta acción quedará en el timeline.`, confirmLabel: "Cambiar estado", action: () => applyStatus(value) }); }}
          className="rounded-2xl border-0 bg-[#111] px-5 py-3 font-black text-white"
        >
          {states.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="mt-7 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <article className="rounded-[2rem] bg-white p-6">
            <h2 className="text-xl font-black">Productos</h2>
            {o.items.map((i) => (
              <div
                key={i.id}
                className="mt-4 flex justify-between border-t border-black/5 pt-4"
              >
                <div>
                  <p className="font-black">{i.productName}</p>
                  <p className="text-xs font-bold text-black/40">
                    {i.productCode} · {i.quantity} × ${i.unitPrice}
                  </p>
                </div>
                <p className="font-black">${i.subtotal}</p>
              </div>
            ))}
            <div className="mt-6 flex justify-between border-t pt-5 text-xl font-black">
              <span>Total</span>
              <span>
                ${o.total} {o.currency}
              </span>
            </div>
          </article>
          <article className="rounded-[2rem] bg-white p-6">
            <h2 className="text-xl font-black">Timeline</h2>
            <div className="mt-5 space-y-4">
              <div className="border-l-2 border-[#19A2B6] pl-4">
                <p className="font-black">Pedido creado</p>
                <p className="text-xs text-black/40">
                  {new Date(o.createdAt).toLocaleString("es-MX")}
                </p>
              </div>
              {o.statusHistory.map((h) => (
                <div key={h.id} className="border-l-2 border-[#19A2B6] pl-4">
                  <p className="font-black">
                    {h.from} → {h.to}
                  </p>
                  <p className="text-xs text-black/40">
                    {h.actor?.name || "Sistema"} ·{" "}
                    {new Date(h.createdAt).toLocaleString("es-MX")}
                  </p>
                </div>
              ))}
            </div>
          </article>
        </div>
        <div className="space-y-5">
          <article className="rounded-[2rem] bg-white p-6">
            <h2 className="font-black">Cliente y envío</h2>
            <p className="mt-4 font-bold">
              {o.customerEmail}
              <br />
              {o.customerPhone}
            </p>
            <p className="mt-4 text-sm font-bold text-black/50">
              {o.shippingAddress}
              <br />
              {o.city}, {o.state} {o.postalCode}
              <br />
              {o.country}
            </p>
          </article>
          <article className="rounded-[2rem] bg-white p-6">
            <h2 className="font-black">Mercado Pago</h2>
            <p className="mt-3 text-sm font-bold">
              {o.payment?.status || "Sin pago"}
            </p>
            <p className="mt-1 break-all text-xs text-black/40">
              Pago: {o.payment?.providerPaymentId || "—"}
              <br />
              Preference: {o.payment?.providerPreferenceId || "—"}
            </p>
          </article>
          <article className="rounded-[2rem] bg-white p-6">
            <h2 className="font-black">Inventario reservado</h2>
            {o.reservations.length ? (
              o.reservations.map((r) => (
                <p key={r.id} className="mt-3 text-sm font-bold">
                  {r.product.name}: {r.quantity} · {r.status}
                </p>
              ))
            ) : (
              <p className="mt-3 text-sm text-black/40">
                Sin reservas registradas
              </p>
            )}
          </article>
          <article className="rounded-[2rem] bg-white p-6">
            <h2 className="font-black">Notas internas</h2>
            <form onSubmit={addNote} className="mt-4">
              <textarea
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-24 w-full rounded-2xl border border-black/10 p-3"
              />
              <button disabled={pending} className="mt-2 rounded-full bg-[#111] px-5 py-2 text-sm font-black text-white disabled:opacity-50">
                {pending ? "Guardando..." : "Agregar nota"}
              </button>
            </form>
            {o.notes.map((n) => (
              <div
                key={n.id}
                className="mt-4 rounded-2xl bg-[#F5F5F5] p-3 text-sm"
              >
                <p>{n.content}</p>
                <p className="mt-2 text-xs font-bold text-black/35">
                  {n.author.name}
                </p>
              </div>
            ))}
          </article>
        </div>
      </div>
    </section>
  );
}
