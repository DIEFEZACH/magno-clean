import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCartStore } from "../store/cartStore";
import { API_URL } from "../lib/api";

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
    <section className="bg-[#F5F5F5] px-5 py-20 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_420px]">
        <div className="rounded-[2rem] bg-white p-8 shadow-sm">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.25em] text-[#19A2B6]">
            Pago seguro
          </p>

          <h1 className="text-5xl font-black tracking-[-0.05em]">
            Checkout
          </h1>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-10 grid gap-5">
            <div>
              <input
                {...register("fullName")}
                className="w-full rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]"
                placeholder="Nombre completo"
              />
              {errors.fullName && (
                <p className="mt-2 text-sm font-bold text-red-500">
                  {errors.fullName.message}
                </p>
              )}
            </div>

            <div>
              <input
                {...register("email")}
                className="w-full rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]"
                placeholder="Correo electrónico"
              />
              {errors.email && (
                <p className="mt-2 text-sm font-bold text-red-500">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <input
                {...register("phone")}
                className="w-full rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]"
                placeholder="Teléfono"
              />
              {errors.phone && (
                <p className="mt-2 text-sm font-bold text-red-500">
                  {errors.phone.message}
                </p>
              )}
            </div>

            <div>
              <input
                {...register("address")}
                className="w-full rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]"
                placeholder="Dirección de envío"
              />
              {errors.address && (
                <p className="mt-2 text-sm font-bold text-red-500">
                  {errors.address.message}
                </p>
              )}
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <input
                  {...register("city")}
                  className="w-full rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]"
                  placeholder="Ciudad"
                />
                {errors.city && (
                  <p className="mt-2 text-sm font-bold text-red-500">
                    {errors.city.message}
                  </p>
                )}
              </div>

              <div>
                <input
                  {...register("zipCode")}
                  className="w-full rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]"
                  placeholder="Código postal"
                />
                {errors.zipCode && (
                  <p className="mt-2 text-sm font-bold text-red-500">
                    {errors.zipCode.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <input {...register("state")} className="w-full rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]" placeholder="Estado" />
                {errors.state && <p className="mt-2 text-sm font-bold text-red-500">{errors.state.message}</p>}
              </div>
              <div>
                <input {...register("country")} className="w-full rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]" placeholder="País" />
                {errors.country && <p className="mt-2 text-sm font-bold text-red-500">{errors.country.message}</p>}
              </div>
            </div>

            {submitError && <p role="alert" className="rounded-2xl bg-red-50 px-5 py-4 text-sm font-bold text-red-600">{submitError}</p>}

            <button disabled={submitting || items.length === 0} className="mt-4 rounded-full bg-[#19A2B6] px-8 py-4 text-sm font-black text-white transition hover:bg-[#111111] disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? "Creando pago seguro..." : "Continuar a Mercado Pago"}
            </button>
          </form>
        </div>

        <aside className="h-fit rounded-[2rem] bg-white p-8 shadow-sm">
          <h2 className="text-3xl font-black">Resumen</h2>

          <div className="mt-8 space-y-5">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-5 border-b border-black/5 pb-5"
              >
                <div>
                  <p className="font-black">{item.name}</p>
                  <p className="text-sm font-bold text-black/45">
                    Cantidad: {item.quantity}
                  </p>
                </div>

                <p className="font-black">
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
            <span className="text-3xl font-black">{formattedSubtotal}</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
