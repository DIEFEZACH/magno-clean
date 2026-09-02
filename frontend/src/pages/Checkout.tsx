import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCartStore } from "../store/cartStore";
import { API_URL } from "../lib/api";
import { Link } from "react-router-dom";
import { useCheckoutAvailability } from "../hooks/useCheckoutAvailability";
import { CheckoutUnavailable } from "../components/commerce/CheckoutUnavailable";

const checkoutSchema = z.object({
  fullName: z.string().min(3, "Nombre requerido"),
  email: z.string().email("Correo inválido"),
  phone: z.string().min(10, "Teléfono inválido"),
  address: z.string().min(5, "Dirección requerida"),
  city: z.string().min(2, "Ciudad requerida"),
  zipCode: z.string().min(5, "Código postal inválido"),
  state: z.string().min(2, "Estado requerido"),
  country: z.string().min(2, "País requerido"),
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

export function Checkout() {
  const items = useCartStore((state) => state.items);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const { checkoutEnabled, loading: checkoutLoading } = useCheckoutAvailability();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { country: "México" },
  });

  const subtotal = items.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  );

  const formattedSubtotal = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(subtotal);

  if (checkoutLoading) {
    return <section className="bg-[#F5F5F5] px-5 py-20 lg:px-8"><CheckoutUnavailable loading/></section>;
  }

  if (!checkoutEnabled) {
    return <section className="bg-[#F5F5F5] px-5 py-20 lg:px-8"><CheckoutUnavailable returnTo={items.length ? "cart" : "catalog"}/></section>;
  }

  if (items.length === 0) {
    return (
      <section className="bg-[#F5F5F5] px-5 py-20 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-6 text-center shadow-sm sm:p-10">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-[#19A2B6]">Tu carrito</p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">Aún no hay productos para comprar</h1>
          <p className="mt-4 leading-7 text-black/60">Explora el catálogo y agrega los productos que necesites antes de continuar.</p>
          <Link to="/productos" className="mt-7 inline-flex min-h-11 items-center rounded-full bg-[#111111] px-7 py-3 text-sm font-black text-white transition hover:bg-[#19A2B6]">Explorar productos</Link>
        </div>
      </section>
    );
  }

  async function onSubmit(data: CheckoutFormData) {
    if (items.length === 0) return setSubmitError("Tu carrito está vacío.");
    setSubmitError("");
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/checkout/create-preference`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ customer: data, items: items.map(({ id, quantity }) => ({ id, quantity })) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "No fue posible iniciar el pago.");
      if (!result.initPoint) throw new Error("Mercado Pago no devolvió una URL de pago.");
      window.location.assign(result.initPoint);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "No fue posible iniciar el pago.");
      setSubmitting(false);
    }
  }

  return (
    <section className="bg-[#F5F5F5] px-4 py-10 sm:px-5 sm:py-16 lg:px-8 lg:py-20">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_420px]">
        <div className="min-w-0 rounded-[1.5rem] bg-white p-5 shadow-sm sm:rounded-[2rem] sm:p-8">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.25em] text-[#19A2B6]">
            Pago seguro
          </p>

          <h1 className="text-4xl font-black tracking-[-0.05em] sm:text-5xl">
            Checkout
          </h1>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-10 grid gap-5">
            <label className="grid gap-2 font-bold">Nombre completo
              <input
                {...register("fullName")}
                autoComplete="name"
                className="w-full rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]"
                aria-invalid={!!errors.fullName}
              />
              {errors.fullName && (
                <p className="mt-2 text-sm font-bold text-red-500">
                  {errors.fullName.message}
                </p>
              )}
            </label>

            <label className="grid gap-2 font-bold">Correo electrónico
              <input
                {...register("email")}
                type="email" autoComplete="email" inputMode="email"
                className="w-full rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]"
                aria-invalid={!!errors.email}
              />
              {errors.email && (
                <p className="mt-2 text-sm font-bold text-red-500">
                  {errors.email.message}
                </p>
              )}
            </label>

            <label className="grid gap-2 font-bold">Teléfono
              <input
                {...register("phone")}
                type="tel" autoComplete="tel" inputMode="tel"
                className="w-full rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]"
                aria-invalid={!!errors.phone}
              />
              {errors.phone && (
                <p className="mt-2 text-sm font-bold text-red-500">
                  {errors.phone.message}
                </p>
              )}
            </label>

            <label className="grid gap-2 font-bold">Dirección de envío
              <input
                {...register("address")}
                autoComplete="street-address"
                className="w-full rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]"
                aria-invalid={!!errors.address}
              />
              {errors.address && (
                <p className="mt-2 text-sm font-bold text-red-500">
                  {errors.address.message}
                </p>
              )}
            </label>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2 font-bold">Ciudad
                <input
                  {...register("city")}
                  autoComplete="address-level2"
                  className="w-full rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]"
                  aria-invalid={!!errors.city}
                />
                {errors.city && (
                  <p className="mt-2 text-sm font-bold text-red-500">
                    {errors.city.message}
                  </p>
                )}
              </label>

              <label className="grid gap-2 font-bold">Código postal
                <input
                  {...register("zipCode")}
                  autoComplete="postal-code" inputMode="numeric"
                  className="w-full rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]"
                  aria-invalid={!!errors.zipCode}
                />
                {errors.zipCode && (
                  <p className="mt-2 text-sm font-bold text-red-500">
                    {errors.zipCode.message}
                  </p>
                )}
              </label>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2 font-bold">Estado
                <input {...register("state")} autoComplete="address-level1" aria-invalid={!!errors.state} className="w-full rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]" />
                {errors.state && <p className="mt-2 text-sm font-bold text-red-500">{errors.state.message}</p>}
              </label>
              <label className="grid gap-2 font-bold">País
                <input {...register("country")} autoComplete="country-name" aria-invalid={!!errors.country} className="w-full rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]" />
                {errors.country && <p className="mt-2 text-sm font-bold text-red-500">{errors.country.message}</p>}
              </label>
            </div>

            {submitError && <p role="alert" className="rounded-2xl bg-red-50 px-5 py-4 text-sm font-bold text-red-600">{submitError}</p>}

            <button disabled={submitting || items.length === 0} aria-busy={submitting} className="mt-4 min-h-12 rounded-full bg-[#19A2B6] px-8 py-4 text-sm font-black text-white transition hover:bg-[#111111] disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? "Creando pago seguro..." : "Continuar a Mercado Pago"}
            </button>
          </form>
        </div>

        <aside className="min-w-0 h-fit rounded-[1.5rem] bg-white p-5 shadow-sm sm:rounded-[2rem] sm:p-8">
          <h2 className="text-3xl font-black">Resumen</h2>

          <div className="mt-8 space-y-5">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-5 border-b border-black/5 pb-5"
              >
                <div className="min-w-0">
                  <p className="break-words font-black">{item.name}</p>
                  <p className="text-sm font-bold text-black/45">
                    Cantidad: {item.quantity}
                  </p>
                </div>

                <p className="shrink-0 text-right font-black">
                  {new Intl.NumberFormat("es-MX", {
                    style: "currency",
                    currency: "MXN",
                  }).format(item.price * item.quantity)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center justify-between">
            <span className="text-lg font-bold text-black/60">Subtotal</span>
            <span className="break-all text-right text-2xl font-black sm:text-3xl">{formattedSubtotal}</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
