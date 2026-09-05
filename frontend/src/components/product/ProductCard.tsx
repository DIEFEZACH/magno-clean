import { Link } from "react-router-dom";
import { ArrowUpRight, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { useCartStore } from "../../store/cartStore";
import { useCheckoutAvailability } from "../../hooks/useCheckoutAvailability";
import type { CatalogFamily, CatalogItem, CatalogProduct } from "../../types/catalog";
import { isWithheldProductImage } from "../../lib/productImageReview";

type LegacyProduct = { id: string; slug: string; name: string; category: string; price: number; oldPrice?: number | null; badge?: string | null; description: string; imageUrl?: string | null; availableStock?: number };
function isFamily(product: CatalogItem | LegacyProduct): product is CatalogFamily { return "type" in product && product.type === "FAMILY"; }
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function ProductCard({ product }: { product: CatalogItem | LegacyProduct }) {
  const addItem = useCartStore((state) => state.addItem);
  const { checkoutEnabled } = useCheckoutAvailability();
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const family = isFamily(product) ? product : null;
  const productLike = family?.displayMode === "PRODUCT_LIKE";
  const realProduct = family ? null : product as CatalogProduct | LegacyProduct;
  const price = family ? family.priceFrom : realProduct!.price;
  const oldPrice = family ? null : realProduct!.oldPrice;
  const soldOut = (family ? family.availableStock : product.availableStock ?? 0) <= 0;
  const href = `/producto/${product.slug}`;
  return <article className="group flex h-full min-w-0 flex-col rounded-xl border border-[#e5e9e7] bg-white p-4 transition hover:border-[#a3c5c3] hover:shadow-lg hover:shadow-[#153a35]/5">
    <Link to={href} className="flex min-w-0 flex-1 flex-col rounded-lg">
      <div className="relative flex aspect-square items-center justify-center rounded-lg bg-[#f7f8f6] p-5">
        {product.badge && <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] rounded-md bg-[#EF8329] px-2 py-1 text-[9px] font-bold text-white">{product.badge}</span>}
        {product.imageUrl && failedImage !== product.imageUrl && !isWithheldProductImage("code" in product ? product.code : undefined, product.imageUrl) ? <img src={product.imageUrl} alt={product.name} width="360" height="360" loading="lazy" decoding="async" onError={() => setFailedImage(product.imageUrl ?? null)} className="h-full w-full object-contain mix-blend-multiply transition duration-300 group-hover:scale-[1.04]"/> : <span className="text-4xl font-black tracking-tighter text-[#168fa1]">MC.</span>}
      </div>
      <p className="mt-4 text-[9px] font-bold uppercase tracking-[0.17em] text-[#16818f]">{product.category}</p><h3 className="mt-2 break-words text-[15px] font-extrabold leading-5 tracking-[-0.02em] text-[#142f33]">{product.name}</h3>
      {family ? <><p className="mt-2 text-[11px] font-semibold text-black/50">{productLike ? family.variants[0].label : `${family.variantCount} presentaciones`}</p>{family.variantCount > 1 && <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`${family.variantType} disponibles`}>{family.variants.slice(0, 4).map((variant) => <span key={variant.id} className="rounded border border-black/10 px-2 py-1 text-[10px] font-semibold text-black/55">{variant.label}</span>)}{family.variantCount > 4 && <span className="px-1 py-1 text-[10px] text-black/50">+{family.variantCount - 4}</span>}</div>}</> : <p className="mt-2 text-[11px] text-black/50">Producto individual</p>}
    </Link>
    <div className="mt-5 border-t border-black/5 pt-4"><p className="text-[20px] font-black tracking-[-0.035em] text-[#142f33]">{family && !productLike && <span className="mr-1.5 text-[11px] font-medium tracking-normal text-black/50">Desde</span>}{money.format(price)}</p>{oldPrice ? <p className="text-xs text-black/40 line-through">{money.format(oldPrice)}</p> : null}<p className={`mt-1 text-[10px] font-semibold ${soldOut ? "text-[#8b5650]" : "text-emerald-700"}`}>{soldOut ? "Sin existencias · consulta disponible" : "Disponible"}</p>
      {family || !checkoutEnabled ? <Link to={href} className="mt-4 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-[#15383c] px-4 text-xs font-bold text-white hover:bg-[#168fa1]">{family && !productLike ? "Ver opciones" : "Ver producto"}<ArrowUpRight size={17}/></Link> : <button type="button" disabled={soldOut} onClick={() => addItem(realProduct!)} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#15383c] px-4 text-xs font-bold text-white hover:bg-[#168fa1] disabled:cursor-not-allowed disabled:bg-[#edf0ee] disabled:text-[#778581]"><ShoppingCart size={16}/>{soldOut ? "Agotado" : "Agregar"}</button>}
      {!checkoutEnabled && !family && <p className="mt-3 text-[10px] text-[#8b5650]">Ventas temporalmente pausadas</p>}
    </div>
  </article>;
}
