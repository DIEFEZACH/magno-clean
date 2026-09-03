import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { CatalogQuery } from "../schemas/catalog";
import {
  resolvePublicWebsiteContent,
  type PublicWebsiteContent,
  type PublicWebsiteContentTarget,
} from "./publicWebsiteContent";

const publicProductSelect = {
  id: true, slug: true, code: true, brand: true, name: true, category: true, description: true,
  imageUrl: true, price: true, oldPrice: true, badge: true, featured: true, active: true,
  stock: true, reservedStock: true, createdAt: true,
  images: { select: { id: true, url: true, alt: true, position: true }, orderBy: { position: "asc" as const } },
} satisfies Prisma.ProductSelect;

const familySelect = {
  id: true, slug: true, name: true, brand: true, category: true, description: true, imageUrl: true,
  badge: true, featured: true, active: true, variantType: true, createdAt: true,
  products: { where: { active: true }, orderBy: [{ variantSortOrder: "asc" as const }, { name: "asc" as const }], select: { ...publicProductSelect, variantLabel: true, variantSortOrder: true } },
} satisfies Prisma.ProductFamilySelect;

export type CatalogProductRow = Prisma.ProductGetPayload<{ select: typeof publicProductSelect }>;
export type CatalogFamilyRow = Prisma.ProductFamilyGetPayload<{ select: typeof familySelect }>;

export type CatalogVariant = { id:string; slug:string; code:string; name:string; description:string; label:string; sortOrder:number; price:number; oldPrice:number|null; imageUrl:string|null; images:Array<{id:string;url:string;alt:string|null;position:number}>; badge:string|null; available:boolean; availableStock:number };
export type CatalogFamily = { type:"FAMILY"; id:string; slug:string; name:string; brand:string; category:string; shortDescription:string; imageUrl:string|null; badge:string|null; featured:boolean; variantType:string; variantCount:number; priceFrom:number; available:boolean; availableStock:number; displayMode:"FAMILY"|"PRODUCT_LIKE"; variants:CatalogVariant[] };
export type CatalogProduct = { type:"PRODUCT"; id:string; slug:string; code:string; brand:string; name:string; category:string; description:string; imageUrl:string|null; images:Array<{id:string;url:string;alt:string|null;position:number}>; price:number; oldPrice:number|null; badge:string|null; featured:boolean; available:boolean; availableStock:number };
export type CatalogItem = CatalogFamily | CatalogProduct;
export type CatalogDetail = { item:CatalogItem; selectedVariantId:string|null; canonicalSlug:string; websiteContent:PublicWebsiteContent|null };
export type PublicWebsiteContentResolver = (target:PublicWebsiteContentTarget)=>Promise<PublicWebsiteContent|null>;

export interface CatalogRepository {
  listFamilies(): Promise<CatalogFamilyRow[]>;
  listIndependentProducts(): Promise<CatalogProductRow[]>;
  findFamily(slug:string): Promise<CatalogFamilyRow|null>;
  findProduct(slug:string): Promise<(CatalogProductRow & { family: CatalogFamilyRow | null })|null>;
}

export const catalogRepository: CatalogRepository = {
  listFamilies: () => prisma.productFamily.findMany({ where: { active: true }, select: familySelect }),
  listIndependentProducts: () => prisma.product.findMany({ where: { active: true, familyId: null }, select: publicProductSelect }),
  findFamily: (slug) => prisma.productFamily.findFirst({ where: { slug, active: true }, select: familySelect }),
  findProduct: (slug) => prisma.product.findFirst({ where: { slug, active: true }, select: { ...publicProductSelect, family: { select: familySelect } } }),
};

function availableStock(row: { stock:number; reservedStock:number }) { return Math.max(0, row.stock - row.reservedStock); }
function summarize(value:string) { return value.length <= 240 ? value : `${value.slice(0, 237).trimEnd()}...`; }

export function mapProduct(row:CatalogProductRow):CatalogProduct {
  const stock = availableStock(row);
  return { type:"PRODUCT", id:row.id, slug:row.slug, code:row.code, brand:row.brand, name:row.name, category:row.category, description:row.description, imageUrl:row.imageUrl, images:row.images, price:row.price, oldPrice:row.oldPrice, badge:row.badge, featured:row.featured, available:stock>0, availableStock:stock };
}

export function mapFamily(row:CatalogFamilyRow):CatalogFamily|null {
  if (!row.active || row.products.length === 0) return null;
  const variants = row.products.map((product) => { const stock=availableStock(product); return { id:product.id, slug:product.slug, code:product.code, name:product.name, description:product.description, label:product.variantLabel!, sortOrder:product.variantSortOrder, price:product.price, oldPrice:product.oldPrice, imageUrl:product.imageUrl, images:product.images, badge:product.badge, available:stock>0, availableStock:stock }; });
  const stock = variants.reduce((sum, variant) => sum + variant.availableStock, 0);
  return { type:"FAMILY", id:row.id, slug:row.slug, name:row.name, brand:row.brand, category:row.category, shortDescription:summarize(row.description), imageUrl:row.imageUrl || variants.find((variant)=>variant.imageUrl)?.imageUrl || null, badge:row.badge, featured:row.featured, variantType:row.variantType, variantCount:variants.length, priceFrom:Math.min(...variants.map((variant)=>variant.price)), available:stock>0, availableStock:stock, displayMode:variants.length>=2?"FAMILY":"PRODUCT_LIKE", variants };
}

function normalize(value:string){return value.toLocaleLowerCase("es-MX").normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
type InternalCatalogItem = CatalogItem & {_createdAt:Date;_searchTerms?:string[]};
function matches(item:InternalCatalogItem, query:CatalogQuery){
  if (query.category && item.category !== query.category) return false;
  if (query.brand && item.brand !== query.brand) return false;
  if (query.featured !== undefined && item.featured !== query.featured) return false;
  const term=normalize(query.search||""); if(!term)return true;
  const values=item.type==="FAMILY"?[item.name,item.slug,item.brand,item.category,...(item._searchTerms||[])]:[item.name,item.slug,item.code,item.brand,item.category];
  return values.some((value)=>normalize(value).includes(term));
}
function compare(sort:CatalogQuery["sort"]){return (a:CatalogItem & {_createdAt?:Date},b:CatalogItem & {_createdAt?:Date})=>{if(sort==="name-asc")return a.name.localeCompare(b.name,"es");if(sort==="name-desc")return b.name.localeCompare(a.name,"es");const pa=a.type==="FAMILY"?a.priceFrom:a.price,pb=b.type==="FAMILY"?b.priceFrom:b.price;if(sort==="price-asc")return pa-pb;if(sort==="price-desc")return pb-pa;if(sort==="newest")return Number(b._createdAt)-Number(a._createdAt);if(sort==="oldest")return Number(a._createdAt)-Number(b._createdAt);return Number(b.featured)-Number(a.featured)||a.name.localeCompare(b.name,"es")};}
function toPublicItem(item:InternalCatalogItem):CatalogItem {
  const publicItem = { ...item };
  delete publicItem._createdAt;
  delete publicItem._searchTerms;
  return publicItem;
}

export function createCatalogService(
  repository:CatalogRepository=catalogRepository,
  resolveWebsiteContent:PublicWebsiteContentResolver=(target)=>resolvePublicWebsiteContent(target,prisma),
){return {
  async list(query:CatalogQuery){
    const [familyRows,productRows]=await Promise.all([repository.listFamilies(),repository.listIndependentProducts()]);
    const families=familyRows.map((row)=>{const item=mapFamily(row);return item?Object.assign(item,{_createdAt:row.createdAt,_searchTerms:row.products.flatMap((product)=>[product.name,product.code,product.slug])}):null}).filter(Boolean) as InternalCatalogItem[];
    const products=productRows.map((row)=>Object.assign(mapProduct(row),{_createdAt:row.createdAt}));
    const all=[...families,...products]; const categories=[...new Set(all.map((item)=>item.category))].sort((a,b)=>a.localeCompare(b,"es")); const brands=[...new Set(all.map((item)=>item.brand))].sort((a,b)=>a.localeCompare(b,"es"));
    const filtered=all.filter((item)=>matches(item,query)).sort(compare(query.sort)); const total=filtered.length; const start=(query.page-1)*query.pageSize;
    const items=filtered.slice(start,start+query.pageSize).map(toPublicItem);
    return {items,pagination:{page:query.page,pageSize:query.pageSize,total,pages:Math.ceil(total/query.pageSize)},filters:{categories,brands}};
  },
  async detail(slug:string){
    const family=await repository.findFamily(slug); const mappedFamily=family?mapFamily(family):null; if(mappedFamily)return {item:mappedFamily,selectedVariantId:null,canonicalSlug:mappedFamily.slug,websiteContent:await resolveWebsiteContent({type:"family",id:mappedFamily.id})} satisfies CatalogDetail;
    const product=await repository.findProduct(slug); if(!product)return null;
    if(product.family){const mapped=mapFamily(product.family);if(!mapped)return null;return {item:mapped,selectedVariantId:product.id,canonicalSlug:mapped.slug,websiteContent:await resolveWebsiteContent({type:"family",id:mapped.id})} satisfies CatalogDetail;}
    const mapped=mapProduct(product);return {item:mapped,selectedVariantId:null,canonicalSlug:mapped.slug,websiteContent:await resolveWebsiteContent({type:"product",id:mapped.id})} satisfies CatalogDetail;
  }
};}
