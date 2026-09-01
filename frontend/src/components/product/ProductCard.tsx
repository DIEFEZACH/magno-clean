import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { useCartStore } from "../../store/cartStore";
import { useCheckoutAvailability } from "../../hooks/useCheckoutAvailability";
import type { CatalogFamily, CatalogItem, CatalogProduct } from "../../types/catalog";

type LegacyProduct = { id: string; slug: string; name: string; category: string; price: number; oldPrice?: number | null; badge?: string | null; description: string; imageUrl?: string | null; availableStock?: number };
function isFamily(product: CatalogItem | LegacyProduct): product is CatalogFamily { return "type" in product && product.type === "FAMILY"; }

export function ProductCard({ product }: { product: CatalogItem | LegacyProduct }) {
  const addItem = useCartStore((state) => state.addItem);
  const { checkoutEnabled } = useCheckoutAvailability();
  const family = isFamily(product) ? product : null;
  const productLike = family?.displayMode === "PRODUCT_LIKE";
  const realProduct = family ? null : product as CatalogProduct | LegacyProduct;
  const price = family ? family.priceFrom : realProduct!.price;
  const oldPrice = family ? null : realProduct!.oldPrice;
  const description = family ? family.shortDescription : realProduct!.description;
  const availableStock = family ? family.availableStock : (product.availableStock ?? 0);
  const soldOut = availableStock <= 0;
  // Lote 2 conserva ProductDetail intacto: el CTA usa el slug histórico de la primera variante.
  const detailSlug = family ? family.variants[0].slug : product.slug;
  const formattedPrice = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(price);
  const formattedOldPrice = oldPrice ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(oldPrice) : null;

  return <article className="group flex h-full flex-col overflow-hidden rounded-[2.25rem] bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/10">
    <Link to={`/producto/${detailSlug}`} className="flex flex-1 flex-col focus-visible:rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#19A2B6]">
      <div className="relative mb-6 flex aspect-square items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-[#19A2B6]/10 to-[#EF8329]/10">
        {product.badge && <span className="absolute left-4 top-4 rounded-full bg-[#EF8329] px-3 py-1 text-xs font-black text-white">{product.badge}</span>}
        <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-[2rem] bg-white shadow-lg transition group-hover:scale-105">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} width="144" height="144" loading="lazy" decoding="async" className="h-full w-full object-contain p-5"/> : <span className="text-4xl font-black text-[#19A2B6]">MC</span>}</div>
      </div>
      <p className="text-sm font-bold text-[#19A2B6]">{product.category}</p>
      <h3 className="mt-2 text-2xl font-black tracking-[-0.03em]">{product.name}</h3>
      {family && <p className="mt-2 text-sm font-black text-[#EF8329]">{productLike ? family.variants[0].label : `${family.variantCount} presentaciones`}</p>}
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-black/55">{description}</p>
      {family && family.variantCount > 1 && <div className="mt-4 flex flex-wrap gap-2" aria-label={`${family.variantType} disponibles`}>{family.variants.slice(0,4).map((variant)=><span key={variant.id} className="rounded-full border border-black/10 px-3 py-1 text-xs font-bold text-black/60">{variant.label}</span>)}</div>}
    </Link>
    <div className="mt-5 flex items-center justify-between gap-4">
      <div><p className="text-lg font-black">{family && !productLike ? "Desde " : ""}{formattedPrice}</p>{formattedOldPrice && <p className="text-sm font-bold text-black/35 line-through">{formattedOldPrice}</p>}<p className={`mt-1 text-xs font-bold ${soldOut?"text-red-600":"text-emerald-700"}`}>{soldOut?"Sin existencias":"Disponible"}</p></div>
      {family ? <Link to={`/producto/${detailSlug}`} className="inline-flex min-h-11 items-center rounded-full bg-black px-5 py-3 text-center text-sm font-black text-white transition hover:bg-[#19A2B6]">{productLike?"Ver producto":"Ver opciones"}</Link> : checkoutEnabled ? <button type="button" onClick={()=>addItem(realProduct!)} disabled={soldOut} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-black text-white transition hover:bg-[#19A2B6] disabled:cursor-not-allowed disabled:bg-black/20"><ShoppingCart size={17}/>{soldOut?"Agotado":"Agregar"}</button> : <Link to={`/producto/${detailSlug}`} className="inline-flex min-h-11 items-center rounded-full bg-black px-5 py-3 text-sm font-black text-white transition hover:bg-[#19A2B6]">Ver producto</Link>}
    </div>
    {!checkoutEnabled && !family && <p className="mt-4 text-sm font-bold text-[#EF8329]">Ventas temporalmente pausadas</p>}
  </article>;
}
