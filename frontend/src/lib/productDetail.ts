import type { CatalogFamily, CatalogImage, CatalogProduct, CatalogVariant } from "../types/catalog";
import { isWithheldProductImage } from "./productImageReview";

export function selectInitialVariant(family:CatalogFamily,variantCode:string|null,selectedVariantId:string|null){
  return family.variants.find((variant)=>variant.code===variantCode)
    ?? family.variants.find((variant)=>variant.id===selectedVariantId)
    ?? family.variants.find((variant)=>variant.available)
    ?? family.variants[0];
}
export function buildGallery(item:CatalogFamily|CatalogProduct,variant?:CatalogVariant){
  const entries:Array<{url:string;alt:string}>=[];
  const add=(url:string|null|undefined,alt:string|null|undefined)=>{if(url&&!entries.some((entry)=>entry.url===url))entries.push({url,alt:alt||item.name});};
  if(item.type==="FAMILY"){
    if(!isWithheldProductImage(variant?.code,variant?.imageUrl))add(variant?.imageUrl,variant?.name);
    variant?.images.forEach((image:CatalogImage)=>{if(!isWithheldProductImage(variant.code,image.url))add(image.url,image.alt||variant.name);});
    if(!entries.length&&!isWithheldProductImage(variant?.code,variant?.imageUrl))add(item.imageUrl,item.name);
  }else{
    if(!isWithheldProductImage(item.code,item.imageUrl))add(item.imageUrl,item.name);
    item.images.forEach((image)=>{if(!isWithheldProductImage(item.code,image.url))add(image.url,image.alt||item.name);});
  }
  return entries;
}
