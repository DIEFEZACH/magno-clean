import { Minus, Plus, Trash2 } from "lucide-react";
import { useCartStore } from "../store/cartStore";
import { Link } from "react-router-dom";
import { useCheckoutAvailability } from "../hooks/useCheckoutAvailability";
import { CheckoutUnavailable } from "../components/commerce/CheckoutUnavailable";

export function Cart() {
  const { checkoutEnabled, loading: checkoutLoading } = useCheckoutAvailability();
  const {
    items,
    removeItem,
    increaseItem,
    decreaseItem,
    clearCart,
  } = useCartStore();

  const total = items.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  );

  const formattedTotal = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(total);

  if (items.length === 0) {
    return (
      <section className="px-4 py-16 sm:px-5 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-black sm:text-5xl">
            Tu carrito está vacío
          </h1>

          <p className="mt-6 text-lg text-black/60">
            Agrega productos Magno Clean para comenzar tu compra.
          </p>
          <Link to="/productos" className="mt-8 inline-flex min-h-11 items-center rounded-full bg-[#111111] px-7 py-3 text-sm font-black text-white transition hover:bg-[#19A2B6]">
            Explorar productos
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-[#F5F5F5] px-4 py-10 sm:px-5 sm:py-16 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col items-start justify-between gap-5 sm:mb-12 sm:flex-row sm:items-center">
          <div>
            <p className="mb-3 text-sm font-black uppercase tracking-[0.25em] text-[#19A2B6]">
              Checkout
            </p>

            <h1 className="text-4xl font-black tracking-[-0.05em] sm:text-5xl">
              Carrito
            </h1>
          </div>

          <button
            onClick={clearCart}
            className="min-h-11 rounded-full bg-black px-5 py-3 text-sm font-black text-white transition hover:bg-red-500"
          >
            Vaciar carrito
          </button>
        </div>

        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 space-y-5">
            {items.map((item) => {
              const formattedPrice = new Intl.NumberFormat("es-MX", {
                style: "currency",
                currency: "MXN",
              }).format(item.price);

              return (
                <article
                  key={item.id}
                  className="flex min-w-0 flex-col gap-5 rounded-[1.5rem] bg-white p-4 shadow-sm sm:p-6 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3 sm:gap-5">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-[#19A2B6]/10 to-[#EF8329]/10 sm:h-28 sm:w-28 sm:rounded-[1.5rem]">
                      <span className="text-3xl font-black text-[#19A2B6]">
                        MC
                      </span>
                    </div>

                    <div className="min-w-0">
                      <p className="break-words text-xs font-black uppercase tracking-[0.15em] text-[#19A2B6] sm:text-sm sm:tracking-[0.2em]">
                        {item.category}
                      </p>

                      <h2 className="mt-2 break-words text-xl font-black sm:text-2xl">
                        {item.name}
                      </h2>

                      <p className="mt-3 text-lg font-black">
                        {formattedPrice}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <button
                      onClick={() => decreaseItem(item.id)}
                      aria-label={`Reducir cantidad de ${item.name}`}
                      className="grid min-h-11 min-w-11 place-items-center rounded-full bg-[#F5F5F5] transition hover:bg-black hover:text-white"
                    >
                      <Minus size={18} />
                    </button>

                    <div className="min-w-[40px] text-center text-lg font-black">
                      {item.quantity}
                    </div>

                    <button
                      onClick={() => increaseItem(item.id)}
                      aria-label={`Aumentar cantidad de ${item.name}`}
                      className="grid min-h-11 min-w-11 place-items-center rounded-full bg-[#F5F5F5] transition hover:bg-black hover:text-white"
                    >
                      <Plus size={18} />
                    </button>

                    <button
                      onClick={() => removeItem(item.id)}
                      aria-label={`Eliminar ${item.name} del carrito`}
                      className="ml-auto grid min-h-11 min-w-11 place-items-center rounded-full bg-red-100 text-red-500 transition hover:bg-red-500 hover:text-white sm:ml-4"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="h-fit min-w-0 rounded-[1.5rem] bg-white p-5 shadow-sm sm:rounded-[2rem] sm:p-8 lg:sticky lg:top-24">
            <h2 className="text-3xl font-black">
              Resumen
            </h2>

            <div className="mt-8 flex items-center justify-between">
              <span className="text-lg font-bold text-black/60">
                Total
              </span>

              <span className="break-all text-right text-3xl font-black sm:text-4xl">
                {formattedTotal}
              </span>
            </div>

            {checkoutEnabled ? (
              <Link
                to="/checkout"
                className="mt-10 flex min-h-11 w-full items-center justify-center rounded-full bg-[#19A2B6] px-6 py-4 text-center text-sm font-black text-white transition hover:bg-[#111111]"
              >
                Proceder al pago
              </Link>
            ) : (
              <div className="mt-8"><CheckoutUnavailable compact loading={checkoutLoading}/></div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
