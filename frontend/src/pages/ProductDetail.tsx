import { Link, useParams, useSearchParams } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { CheckoutUnavailable } from "../components/commerce/CheckoutUnavailable";
import { ProductContentSections } from "../components/product/ProductContentSections";
import { ProductGallery } from "../components/product/ProductGallery";
import { ProductCard } from "../components/product/ProductCard";
import { VariantSelector } from "../components/product/VariantSelector";
import { Seo, siteUrl } from "../components/Seo";
import { useCatalog, useCatalogDetail } from "../hooks/useCatalog";
import { useCheckoutAvailability } from "../hooks/useCheckoutAvailability";
import { buildGallery, selectInitialVariant } from "../lib/productDetail";
import { firstEditorialHero } from "../lib/editorialMedia";
import { useCartStore } from "../store/cartStore";
import type { CatalogVariant } from "../types/catalog";
import { NotFound } from "./NotFound";

const money=new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"});

export function ProductDetail(){
  const {slug}=useParams();
  const [searchParams,setSearchParams]=useSearchParams();
  const {detail,loading,error,notFound,refetch}=useCatalogDetail(slug);
  const {checkoutEnabled,loading:checkoutLoading}=useCheckoutAvailability();
  const addItem=useCartStore((state)=>state.addItem);
  const category=detail?.item.category??"";
  const relatedQuery=useCatalog({category,pageSize:6,sort:"featured"});

  if(loading)return <section className="px-5 py-12 lg:px-8" aria-busy="true"><div className="mx-auto grid max-w-7xl animate-pulse gap-10 lg:grid-cols-2"><div className="aspect-square rounded-[2rem] bg-black/5"/><div className="space-y-5 py-8"><div className="h-4 w-28 rounded bg-black/10"/><div className="h-16 w-4/5 rounded bg-black/10"/><div className="h-7 w-40 rounded bg-black/10"/><div className="h-32 rounded bg-black/5"/></div></div><span className="sr-only">Cargando producto</span></section>;
  if(notFound)return <NotFound product/>;
  if(error||!detail)return <section className="px-5 py-20 lg:px-8"><div className="mx-auto max-w-4xl rounded-[2rem] bg-red-50 p-8"><h1 className="text-3xl font-black">No pudimos cargar el producto</h1><p className="mt-3 text-black/60">{error||"La respuesta del catálogo no es válida."}</p><button type="button" onClick={()=>refetch()} className="mt-6 min-h-11 rounded-full bg-[#111] px-6 py-3 text-sm font-black text-white">Reintentar</button></div></section>;

  const item=detail.item;
  const family=item.type==="FAMILY"?item:null;
  const product=item.type==="PRODUCT"?item:null;
  const selectedVariant=family?selectInitialVariant(family,searchParams.get("variant"),detail.selectedVariantId):null;
  const name=family?.name??product!.name;
  const description=family?.shortDescription??product!.description;
  const code=selectedVariant?.code??product!.code;
  const price=selectedVariant?.price??product!.price;
  const oldPrice=family?selectedVariant!.oldPrice:product!.oldPrice;
  const availableStock=selectedVariant?.availableStock??product!.availableStock;
  const soldOut=availableStock<=0;
  const badge=selectedVariant?.badge??item.badge;
  const gallery=buildGallery(item,selectedVariant??undefined);
  const editorialMedia=detail.websiteContent?.media??[];
  const editorialHero=firstEditorialHero(editorialMedia);
  const canonicalPath=`/producto/${encodeURIComponent(detail.canonicalSlug)}`;
  const cartProduct=family?{id:selectedVariant!.id,slug:selectedVariant!.slug,name:selectedVariant!.name,category:family.category,price:selectedVariant!.price,oldPrice:selectedVariant!.oldPrice,badge:selectedVariant!.badge,description:selectedVariant!.description,imageUrl:selectedVariant!.imageUrl??family.imageUrl,availableStock:selectedVariant!.availableStock}:product!;
  const related=relatedQuery.items.filter((candidate)=>candidate.id!==item.id).slice(0,3);
  function selectVariant(variant:CatalogVariant){const next=new URLSearchParams(searchParams);next.set("variant",variant.code);setSearchParams(next,{replace:true});}

  const productJsonLd=item.type==="FAMILY"?{
    "@context":"https://schema.org","@type":"ProductGroup","name":family!.name,"description":family!.shortDescription,"url":`${siteUrl}${canonicalPath}`,"productGroupID":family!.id,"variesBy":family!.variantType,"brand":{"@type":"Brand","name":family!.brand},...(editorialHero?{"image":[editorialHero.url]}:{}),"hasVariant":family!.variants.map((variant)=>({"@type":"Product","name":variant.name,"sku":variant.code,"image":[variant.imageUrl,...variant.images.map((image)=>image.url)].filter(Boolean),...(checkoutEnabled?{"offers":{"@type":"Offer","url":`${siteUrl}${canonicalPath}?variant=${encodeURIComponent(variant.code)}`,"priceCurrency":"MXN","price":variant.price,"availability":variant.available?"https://schema.org/InStock":"https://schema.org/OutOfStock","itemCondition":"https://schema.org/NewCondition"}}:{})}))
  }:{"@context":"https://schema.org","@type":"Product","name":product!.name,"description":product!.description,"image":gallery.map((image)=>image.url),"sku":product!.code,"brand":{"@type":"Brand","name":product!.brand},...(checkoutEnabled?{"offers":{"@type":"Offer","url":`${siteUrl}${canonicalPath}`,"priceCurrency":"MXN","price":product!.price,"availability":product!.available?"https://schema.org/InStock":"https://schema.org/OutOfStock","itemCondition":"https://schema.org/NewCondition"}}:{})};
  const breadcrumbJsonLd={"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Inicio","item":siteUrl},{"@type":"ListItem","position":2,"name":"Productos","item":`${siteUrl}/productos`},{"@type":"ListItem","position":3,"name":name,"item":`${siteUrl}${canonicalPath}`}]};

  const seoImage=family?(editorialHero?.url??gallery[0]?.url):gallery[0]?.url;
  return <><Seo title={name} description={description.slice(0,160)} path={canonicalPath} image={seoImage} type="product" jsonLd={[productJsonLd,breadcrumbJsonLd]}/><section className="bg-white px-4 py-8 sm:px-5 sm:py-12 lg:px-8 lg:py-16"><div className="mx-auto max-w-7xl">
    <nav aria-label="Migas de pan" className="mb-7 flex min-w-0 items-center gap-2 overflow-hidden text-xs font-bold text-black/45 sm:mb-10 sm:text-sm"><Link to="/" className="shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#19A2B6]">Inicio</Link><span aria-hidden="true">/</span><Link to="/productos" className="shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#19A2B6]">Productos</Link><span aria-hidden="true">/</span><span aria-current="page" className="truncate text-[#19A2B6]">{name}</span></nav>
    <div className="grid min-w-0 gap-8 md:grid-cols-2 md:items-start lg:gap-14">
      <ProductGallery key={selectedVariant?.id??product?.id} images={gallery} name={selectedVariant?.name??name}/>
      <div className="min-w-0 md:sticky md:top-24">
        {badge&&<span className="mb-5 inline-flex rounded-full bg-[#EF8329] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white">{badge}</span>}
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#19A2B6] sm:text-sm sm:tracking-[0.25em]">{item.category}</p>
        <h1 className="mt-3 break-words text-4xl font-black tracking-[-0.05em] sm:text-5xl lg:text-6xl xl:text-7xl">{name}</h1>
        <p className="mt-4 text-sm font-bold text-black/45">Marca: {item.brand} <span aria-hidden="true">·</span> Código: <span aria-live="polite">{code}</span></p>
        <div className="mt-7"><p className="text-4xl font-black sm:text-5xl" aria-live="polite">{money.format(price)}</p>{oldPrice&&<p className="mt-1 text-lg font-bold text-black/35 line-through">{money.format(oldPrice)}</p>}<p className={`mt-3 text-sm font-black ${soldOut?"text-red-600":"text-emerald-700"}`}>{soldOut?"Agotado":`${availableStock} disponibles`}</p></div>
        {family&&selectedVariant&&<VariantSelector family={family} selected={selectedVariant} onSelect={selectVariant}/>}
        <div className="mt-8">{checkoutEnabled?<button type="button" onClick={()=>addItem(cartProduct)} disabled={soldOut} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#111] px-8 py-4 text-sm font-black text-white transition hover:bg-[#19A2B6] disabled:cursor-not-allowed disabled:bg-black/20 sm:w-auto"><ShoppingCart size={18}/>{soldOut?"Agotado":"Agregar al carrito"}</button>:<CheckoutUnavailable compact loading={checkoutLoading}/>}</div>
      </div>
    </div>
    <ProductContentSections content={{description}} media={editorialMedia} resetKey={detail.canonicalSlug}/>
    {!relatedQuery.loading&&!relatedQuery.error&&related.length>0&&<section className="mt-16 border-t border-black/10 pt-12 sm:mt-20 sm:pt-14"><h2 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">Productos relacionados</h2><div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">{related.map((candidate)=><ProductCard key={`${candidate.type}-${candidate.id}`} product={candidate}/>)}</div></section>}
  </div></section></>;
}
