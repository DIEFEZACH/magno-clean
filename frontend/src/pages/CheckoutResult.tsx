import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { API_URL } from "../lib/api";
import { useCartStore } from "../store/cartStore";

type ResultKind = "success" | "pending" | "error";

export function CheckoutResult({ kind }: { kind: ResultKind }) {
  const [params] = useSearchParams();
  const orderId = params.get("orderId") || params.get("external_reference");
  const clearCart = useCartStore((state) => state.clearCart);
  const query = useQuery({
    queryKey: ["order-status", orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/orders/${encodeURIComponent(orderId!)}/status`);
      if (!response.ok) throw new Error("No pudimos consultar el estado de la orden.");
      return response.json() as Promise<{ status: string; paymentStatus: string | null }>;
    },
    refetchInterval: (state) => state.state.data?.status === "PENDING" ? 3000 : false,
    staleTime: 0,
  });

  const paid = query.data?.status === "PAID" || ["PROCESSING", "SHIPPED", "DELIVERED"].includes(query.data?.status || "");
  const rejected = ["CANCELLED", "REFUNDED"].includes(query.data?.status || "");

  useEffect(() => {
    if (paid) clearCart();
  }, [paid, clearCart]);

  const displayKind: ResultKind = paid ? "success" : rejected ? "error" : kind;
  const content = {
    success: { Icon: CheckCircle2, color: "text-emerald-500", eyebrow: "Pago confirmado", title: "¡Gracias por tu compra!", detail: "Tu pago fue aprobado y ya estamos preparando tu pedido." },
    pending: { Icon: Clock3, color: "text-amber-500", eyebrow: "Pago pendiente", title: "Estamos confirmando tu pago", detail: "Esta pantalla se actualizará automáticamente cuando Mercado Pago confirme el resultado." },
    error: { Icon: XCircle, color: "text-red-500", eyebrow: "Pago no completado", title: "No pudimos confirmar el pago", detail: "Puedes volver al carrito e intentarlo nuevamente. No duplicaremos una orden por reintentar la misma solicitud." },
  }[displayKind];

  return (
    <section className="bg-[#F5F5F5] px-5 py-24 lg:px-8">
      <div className="mx-auto max-w-2xl rounded-[2rem] bg-white p-8 text-center shadow-sm md:p-12">
        <content.Icon className={`mx-auto h-16 w-16 ${content.color}`} aria-hidden="true" />
        <p className="mt-6 text-sm font-black uppercase tracking-[0.25em] text-[#19A2B6]">{content.eyebrow}</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.04em]">{content.title}</h1>
        <p className="mx-auto mt-4 max-w-lg font-semibold text-black/55">{content.detail}</p>
        {orderId && <p className="mt-6 text-sm font-bold text-black/45">Orden: {orderId}</p>}
        {query.isError && <p role="alert" className="mt-4 text-sm font-bold text-red-500">No pudimos actualizar el estado. Puedes recargar esta página.</p>}
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/productos" className="rounded-full bg-[#19A2B6] px-7 py-3 text-sm font-black text-white">Seguir comprando</Link>
          {!paid && <Link to="/carrito" className="rounded-full bg-[#111111] px-7 py-3 text-sm font-black text-white">Volver al carrito</Link>}
        </div>
      </div>
    </section>
  );
}
