import { Link } from "react-router-dom";

type CheckoutUnavailableProps = {
  compact?: boolean;
  loading?: boolean;
  returnTo?: "cart" | "catalog";
};

export function CheckoutUnavailable({ compact = false, loading = false, returnTo = "catalog" }: CheckoutUnavailableProps) {
  const destination = returnTo === "cart" ? "/carrito" : "/productos";
  const label = returnTo === "cart" ? "Volver al carrito" : "Explorar productos";

  return (
    <div
      className={compact
        ? "rounded-2xl bg-[#EF8329]/10 p-5"
        : "mx-auto max-w-3xl rounded-[2rem] bg-white p-6 text-center shadow-sm sm:p-10"}
      role="status"
    >
      <p className="text-sm font-black uppercase tracking-[0.2em] text-[#EF8329]">
        {loading ? "Consultando disponibilidad" : "Ventas temporalmente pausadas"}
      </p>
      <h1 className={compact ? "mt-2 text-xl font-black" : "mt-3 text-3xl font-black sm:text-5xl"}>
        {loading ? "Un momento, por favor" : "El catálogo continúa disponible"}
      </h1>
      <p className="mt-3 leading-7 text-black/60">
        {loading
          ? "Estamos verificando si el proceso de compra está disponible."
          : "Puedes consultar nuestros productos y conservar artículos en tu carrito. Te avisaremos aquí cuando sea posible completar una compra."}
      </p>
      {!loading && (
        <Link
          to={destination}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-[#111111] px-6 py-3 text-sm font-black text-white transition hover:bg-[#19A2B6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#19A2B6]"
        >
          {label}
        </Link>
      )}
    </div>
  );
}
