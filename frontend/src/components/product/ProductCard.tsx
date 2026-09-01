import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { useCartStore } from "../../store/cartStore";
import { useCheckoutAvailability } from "../../hooks/useCheckoutAvailability";

type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  oldPrice?: number;
  badge?: string;
  description: string;
  imageUrl?: string | null;
  availableStock?: number;
};

type ProductCardProps = {
  product: Product;
};

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const { checkoutEnabled } = useCheckoutAvailability();

  const formattedPrice = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(product.price);

  const formattedOldPrice = product.oldPrice
    ? new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
      }).format(product.oldPrice)
    : null;
  const soldOut = (product.availableStock ?? 0) <= 0;

  return (
    <article className="group overflow-hidden rounded-[2.25rem] bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/10">
      <Link to={`/producto/${product.slug}`}>
        <div className="relative mb-6 flex aspect-square items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-[#19A2B6]/10 to-[#EF8329]/10">
          {product.badge && (
            <span className="absolute left-4 top-4 rounded-full bg-[#EF8329] px-3 py-1 text-xs font-black text-white">
              {product.badge}
            </span>
          )}

          <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-[2rem] bg-white shadow-lg transition group-hover:scale-105">
            {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              width="144"
              height="144"
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain p-5"
            />
          ) : (
            <span className="text-4xl font-black text-[#19A2B6]">
              MC
            </span>
          )}
          </div>
        </div>

        <p className="text-sm font-bold text-[#19A2B6]">
          {product.category}
        </p>

        <h3 className="mt-2 text-2xl font-black tracking-[-0.03em]">
          {product.name}
        </h3>

        <p className="mt-3 text-sm leading-6 text-black/55">
          {product.description}
        </p>
      </Link>

      <div className="mt-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-lg font-black">{formattedPrice}</p>

          {formattedOldPrice && (
            <p className="text-sm font-bold text-black/35 line-through">
              {formattedOldPrice}
            </p>
          )}
        </div>

        {checkoutEnabled ? (
          <button
            type="button"
            onClick={() => addItem(product)}
            disabled={soldOut}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-black text-white transition hover:bg-[#19A2B6] disabled:cursor-not-allowed disabled:bg-black/20"
          >
            <ShoppingCart size={17} />
            {soldOut ? "Agotado" : "Agregar"}
          </button>
        ) : (
          <Link
            to={`/producto/${product.slug}`}
            className="inline-flex min-h-11 items-center rounded-full bg-black px-5 py-3 text-sm font-black text-white transition hover:bg-[#19A2B6]"
          >
            Ver producto
          </Link>
        )}
      </div>
      {!checkoutEnabled && <p className="mt-4 text-sm font-bold text-[#EF8329]">Ventas temporalmente pausadas</p>}
    </article>
  );
}
