/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ShoppingCart,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";
import { useProducts } from "../hooks/useProducts";
import { useCartStore } from "../store/cartStore";
import { ProductCard } from "../components/product/ProductCard";
import { Seo, siteUrl } from "../components/Seo";
import { NotFound } from "./NotFound";
import { useCheckoutAvailability } from "../hooks/useCheckoutAvailability";
import { CheckoutUnavailable } from "../components/commerce/CheckoutUnavailable";

export function ProductDetail() {
  const { slug } = useParams();
  const { products, loading, error, refetch } = useProducts();
  const addItem = useCartStore((state) => state.addItem);
  const [selectedImage,setSelectedImage]=useState<string|null>(null);
  const { checkoutEnabled, loading: checkoutLoading } = useCheckoutAvailability();

  const product = products.find((item) => item.slug === slug);

  useEffect(()=>setSelectedImage(null),[product?.id]);

  if (loading) {
    return (
      <section className="px-5 py-20 lg:px-8">
        <h1 className="text-5xl font-black">Cargando producto...</h1>
      </section>
    );
  }

  if (error) {
    return (
      <section className="px-5 py-20 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] bg-red-50 p-8">
          <h1 className="text-3xl font-black">No pudimos cargar el producto</h1>
          <p className="mt-3 text-black/60">{error}</p>
          <button type="button" onClick={() => refetch()} className="mt-6 rounded-full bg-[#111111] px-6 py-3 text-sm font-black text-white">Reintentar</button>
        </div>
      </section>
    );
  }

  if (!product) {
    return <NotFound product/>;
  }

  const price = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(product.price);

  const oldPrice = product.oldPrice
    ? new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
      }).format(product.oldPrice)
    : null;
  const relatedProducts = products
    .filter((item) => item.id !== product.id && item.category === product.category)
    .slice(0, 3);
  const soldOut = product.availableStock <= 0;
  const gallery=[...new Set([product.imageUrl,...(product.images||[]).map(image=>image.url)].filter((url):url is string=>Boolean(url)))];
  const mainImage=selectedImage||gallery[0]||null;
  const canonicalPath=`/producto/${encodeURIComponent(product.slug)}`;
  const productJsonLd={"@context":"https://schema.org","@type":"Product","name":product.name,"description":product.description,"image":gallery,"sku":product.code,"brand":{"@type":"Brand","name":product.brand},...(checkoutEnabled?{"offers":{"@type":"Offer","url":`${siteUrl}${canonicalPath}`,"priceCurrency":"MXN","price":product.price,"availability":soldOut?"https://schema.org/OutOfStock":"https://schema.org/InStock","itemCondition":"https://schema.org/NewCondition"}}:{})};
  const breadcrumbJsonLd={"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Inicio","item":siteUrl},{"@type":"ListItem","position":2,"name":"Productos","item":`${siteUrl}/productos`},{"@type":"ListItem","position":3,"name":product.name,"item":`${siteUrl}${canonicalPath}`}]};

  return (
    <><Seo title={product.name} description={product.description.slice(0,160)} path={canonicalPath} image={mainImage} type="product" jsonLd={[productJsonLd,breadcrumbJsonLd]}/><section className="bg-white px-5 py-16 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <nav aria-label="Migas de pan" className="mb-10 flex flex-wrap items-center gap-2 text-sm font-bold text-black/45"><Link to="/">Inicio</Link><span aria-hidden="true">/</span><Link to="/productos">Productos</Link><span aria-hidden="true">/</span><span aria-current="page" className="text-[#19A2B6]">{product.name}</span></nav>

        <div className="grid min-w-0 gap-12 lg:grid-cols-2">
          <div className="min-w-0 rounded-[2.5rem] bg-[#F5F5F5] p-6">
            <div className="flex aspect-square items-center justify-center rounded-[2rem] bg-gradient-to-br from-[#19A2B6]/10 to-[#EF8329]/10">
              <div className="flex h-80 w-80 items-center justify-center overflow-hidden rounded-[2.5rem] bg-white shadow-xl">
                {mainImage ? (
                  <img
                    src={mainImage}
                    alt={product.name}
                    width="320"
                    height="320"
                    decoding="async"
                    className="h-full w-full object-contain p-10"
                  />
                ) : (
                  <span className="text-6xl font-black text-[#19A2B6]">
                    MC
                  </span>
                )}
              </div>
            </div>
            {gallery.length>1&&<div className="mt-4 grid grid-cols-4 gap-3">{gallery.map((url,index)=><button type="button" aria-label={`Ver imagen ${index+1} de ${product.name}`} aria-pressed={mainImage===url} key={url} onClick={()=>setSelectedImage(url)} className="aspect-square overflow-hidden rounded-2xl border border-black/10 bg-white p-2 aria-pressed:border-[#19A2B6] aria-pressed:ring-2 aria-pressed:ring-[#19A2B6]/20"><img src={url} alt={`${product.name}, vista ${index+1}`} width="96" height="96" loading="lazy" decoding="async" className="h-full w-full object-contain"/></button>)}</div>}
          </div>

          <div className="min-w-0 flex flex-col justify-center">
            {product.badge && (
              <span className="mb-5 w-fit rounded-full bg-[#EF8329] px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-white">
                {product.badge}
              </span>
            )}

            <p className="text-sm font-black uppercase tracking-[0.25em] text-[#19A2B6]">
              {product.category}
            </p>
            <p className="mt-3 text-sm font-bold text-black/45">Marca: {product.brand} · Código: {product.code}</p>

            <h1 className="mt-4 text-5xl font-black tracking-[-0.05em] md:text-7xl">
              {product.name}
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-black/60">
              {product.description}
            </p>

            <div className="mt-8">
              <p className="text-4xl font-black">{price}</p>
              <p className={`mt-3 text-sm font-black ${soldOut ? "text-red-500" : "text-emerald-600"}`}>
                {soldOut ? "Agotado" : `${product.availableStock} disponibles`}
              </p>

              {oldPrice && (
                <p className="mt-1 text-lg font-bold text-black/35 line-through">
                  {oldPrice}
                </p>
              )}
            </div>

            {checkoutEnabled ? <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => addItem(product)}
                disabled={soldOut}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#111111] px-8 py-4 text-sm font-black text-white transition hover:bg-[#19A2B6] disabled:cursor-not-allowed disabled:bg-black/20"
              >
                <ShoppingCart size={18} />
                {soldOut ? "Agotado" : "Agregar al carrito"}
              </button>

              <button
                type="button"
                onClick={() => addItem(product)}
                disabled={soldOut}
                className="rounded-full border border-black/10 px-8 py-4 text-sm font-black transition hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Comprar ahora
              </button>
            </div> : <div className="mt-8"><CheckoutUnavailable compact loading={checkoutLoading}/></div>}

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl bg-[#F5F5F5] p-5">
                <Truck className="mb-3 text-[#19A2B6]" />
                <p className="text-sm font-black">Envío nacional</p>
              </div>

              <div className="rounded-3xl bg-[#F5F5F5] p-5">
                <ShieldCheck className="mb-3 text-[#19A2B6]" />
                <p className="text-sm font-black">Garantía oficial</p>
              </div>

              <div className="rounded-3xl bg-[#F5F5F5] p-5">
                <Wrench className="mb-3 text-[#19A2B6]" />
                <p className="text-sm font-black">Refacciones</p>
              </div>
            </div>
          </div>
        </div>

        {relatedProducts.length > 0 && (
          <div className="mt-20 border-t border-black/5 pt-14">
            <h2 className="text-4xl font-black tracking-[-0.04em]">Productos relacionados</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {relatedProducts.map((item) => (
                <ProductCard key={item.id} product={{ ...item, oldPrice: item.oldPrice ?? undefined, badge: item.badge ?? undefined }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section></>
  );
}
