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
      <section className="px-5 py-24 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-5xl font-black">
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
    <section className="bg-[#F5F5F5] px-5 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 flex items-center justify-between">
          <div>
            <p className="mb-3 text-sm font-black uppercase tracking-[0.25em] text-[#19A2B6]">
              Checkout
            </p>

            <h1 className="text-5xl font-black tracking-[-0.05em]">
              Carrito
            </h1>
          </div>

          <button
            onClick={clearCart}
            className="rounded-full bg-black px-5 py-3 text-sm font-black text-white transition hover:bg-red-500"
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
                  className="min-w-0 flex flex-col gap-5 rounded-[2rem] bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-center gap-5">
                    <div className="flex h-28 w-28 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-[#19A2B6]/10 to-[#EF8329]/10">
                      <span className="text-3xl font-black text-[#19A2B6]">
                        MC
                      </span>
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-black uppercase tracking-[0.2em] text-[#19A2B6]">
                        {item.category}
                      </p>

                      <h2 className="mt-2 break-words text-2xl font-black">
                        {item.name}
                      </h2>

                      <p className="mt-3 text-lg font-black">
                        {formattedPrice}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => decreaseItem(item.id)}
                      className="rounded-full bg-[#F5F5F5] p-3 transition hover:bg-black hover:text-white"
                    >
                      <Minus size={18} />
                    </button>

                    <div className="min-w-[40px] text-center text-lg font-black">
                      {item.quantity}
                    </div>

                    <button
                      onClick={() => increaseItem(item.id)}
                      className="rounded-full bg-[#F5F5F5] p-3 transition hover:bg-black hover:text-white"
                    >
                      <Plus size={18} />
                    </button>

                    <button
                      onClick={() => removeItem(item.id)}
                      className="ml-4 rounded-full bg-red-100 p-3 text-red-500 transition hover:bg-red-500 hover:text-white"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="min-w-0 h-fit rounded-[2rem] bg-white p-8 shadow-sm">
            <h2 className="text-3xl font-black">
              Resumen
            </h2>

            <div className="mt-8 flex items-center justify-between">
              <span className="text-lg font-bold text-black/60">
                Total
              </span>

              <span className="text-4xl font-black">
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
