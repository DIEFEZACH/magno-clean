import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { CatalogQuery } from "../schemas/catalog";
import { CATALOG_CACHE_CONTROL, createCatalogRouter } from "../routes/catalog";
import { createCatalogService, type CatalogFamilyRow, type CatalogProductRow, type CatalogRepository } from "./catalog";
import type { PublicWebsiteContentResolver } from "./catalog";

const date=(day:number)=>new Date(`2026-08-${String(day).padStart(2,"0")}T00:00:00Z`);
function product(overrides:Partial<CatalogProductRow>={}):CatalogProductRow{return {id:"p1",slug:"limpiador-1l",code:"LIM-1",brand:"Magno Clean",name:"Limpiador 1 L",category:"Limpieza",description:"Descripción",imageUrl:null,price:100,oldPrice:null,badge:null,featured:false,active:true,stock:10,reservedStock:2,createdAt:date(1),images:[],...overrides};}
type FamilyProductRow = CatalogFamilyRow["products"][number];
function variant(overrides:Partial<FamilyProductRow>={}):FamilyProductRow{return {...product(),variantLabel:"1 L",variantSortOrder:1,...overrides};}
function family(overrides:Partial<CatalogFamilyRow>={}):CatalogFamilyRow{return {id:"f1",slug:"chazam",name:"CHAZAM",brand:"Magno Clean",category:"Desengrasantes",description:"Descripción familiar",imageUrl:null,badge:null,featured:true,active:true,variantType:"Presentación",createdAt:date(2),products:[variant({id:"v1",slug:"chazam-1l",code:"CHA-1",name:"CHAZAM 1 L",price:120,stock:5,reservedStock:1,variantLabel:"1 L",variantSortOrder:1}),variant({id:"v5",slug:"chazam-5l",code:"CHA-5",name:"CHAZAM 5 L",price:400,stock:2,reservedStock:0,variantLabel:"5 L",variantSortOrder:2}),variant({id:"v20",slug:"chazam-20l",code:"CHA-20",name:"CHAZAM 20 L",price:900,stock:0,reservedStock:0,variantLabel:"20 L",variantSortOrder:3})],...overrides};}
function query(overrides:Partial<CatalogQuery>={}):CatalogQuery{return {page:1,pageSize:24,sort:"featured",...overrides};}
function repository(families:CatalogFamilyRow[]=[],products:CatalogProductRow[]=[]):CatalogRepository{return {listFamilies:async()=>families,listIndependentProducts:async()=>products,findFamily:async(slug)=>families.find((item)=>item.slug===slug)||null,findProduct:async(slug)=>{const independent=products.find((item)=>item.slug===slug);if(independent)return {...independent,family:null};for(const item of families){const variant=item.products.find((entry)=>entry.slug===slug);if(variant)return {...variant,family:item};}return null;}};}
const noWebsiteContent:PublicWebsiteContentResolver=async()=>null;
const service=(repo:CatalogRepository=repository(),resolver:PublicWebsiteContentResolver=noWebsiteContent)=>createCatalogService(repo,resolver);

test("familia de tres variantes cuenta como un item y calcula agregados",async()=>{const result=await service(repository([family()])).list(query());assert.equal(result.pagination.total,1);const item=result.items[0];assert.equal(item.type,"FAMILY");if(item.type==="FAMILY"){assert.equal(item.variantCount,3);assert.equal(item.priceFrom,120);assert.equal(item.availableStock,6);assert.equal(item.displayMode,"FAMILY");assert.equal(item.variants[0].name,"CHAZAM 1 L");assert.equal(item.variants[0].description,"Descripción");assert.deepEqual(item.variants[0].images,[]);}});
test("producto independiente cuenta como un item",async()=>{const result=await service(repository([], [product()])).list(query());assert.equal(result.items[0].type,"PRODUCT");assert.equal(result.pagination.total,1);});
test("variante agrupada nunca aparece duplicada",async()=>{const result=await service(repository([family()],[])).list(query());assert.deepEqual(result.items.map((item)=>item.id),["f1"]);});
test("familia inactiva y familia sin variantes activas quedan excluidas",async()=>{const result=await service(repository([family({active:false}),family({id:"f2",slug:"vacia",products:[]})])).list(query());assert.equal(result.pagination.total,0);});
test("variantes inactivas no forman parte del contrato",async()=>{const row=family();row.products=row.products.slice(0,2);const result=await service(repository([row])).list(query());const item=result.items[0];assert.equal(item.type,"FAMILY");if(item.type==="FAMILY")assert.equal(item.variantCount,2);});
test("familia de una variante usa PRODUCT_LIKE",async()=>{const row=family();row.products=row.products.slice(0,1);const item=(await service(repository([row])).list(query())).items[0];assert.equal(item.type,"FAMILY");if(item.type==="FAMILY")assert.equal(item.displayMode,"PRODUCT_LIKE");});
test("búsqueda por código o nombre de variante devuelve sólo la familia",async()=>{const catalog=service(repository([family()]));for(const search of ["CHA-5","CHAZAM 20 L"]){const result=await catalog.list(query({search}));assert.deepEqual(result.items.map((item)=>item.id),["f1"]);}});
test("filtros de marca y categoría",async()=>{const catalog=service(repository([family()],[product({id:"p2",brand:"Otra",category:"Otra"})]));assert.equal((await catalog.list(query({brand:"Magno Clean"}))).pagination.total,1);assert.equal((await catalog.list(query({category:"Otra"}))).pagination.total,1);});
test("paginación cuenta elementos comerciales",async()=>{const result=await service(repository([family()],[product({id:"p2"}),product({id:"p3",slug:"otro"})])).list(query({page:2,pageSize:2}));assert.equal(result.pagination.total,3);assert.equal(result.items.length,1);});
test("todos los órdenes son deterministas",async()=>{const catalog=service(repository([family()],[product({id:"p2",name:"Zeta",price:50,featured:false,createdAt:date(3)})]));for(const sort of ["featured","name-asc","name-desc","price-asc","price-desc","newest","oldest"] as const){const result=await catalog.list(query({sort}));assert.equal(result.items.length,2);}});
test("resuelve slug familiar con contenido familiar",async()=>{let target;const result=await service(repository([family()]),async(value)=>{target=value;return {media:[]};}).detail("chazam");assert.equal(result?.item.type,"FAMILY");assert.equal(result?.selectedVariantId,null);assert.deepEqual(target,{type:"family",id:"f1"});assert.deepEqual(result?.websiteContent,{media:[]});});
test("resuelve producto independiente con contenido de Product",async()=>{let target;const result=await service(repository([],[product()]),async(value)=>{target=value;return null;}).detail("limpiador-1l");assert.equal(result?.item.type,"PRODUCT");assert.deepEqual(target,{type:"product",id:"p1"});assert.equal(result?.websiteContent,null);});
test("slug histórico usa contenido familiar y selecciona Product real",async()=>{let target;const result=await service(repository([family()]),async(value)=>{target=value;return {media:[]};}).detail("chazam-5l");assert.equal(result?.item.type,"FAMILY");assert.equal(result?.selectedVariantId,"v5");assert.equal(result?.canonicalSlug,"chazam");assert.deepEqual(target,{type:"family",id:"f1"});});
test("slug inexistente retorna null sin resolver contenido",async()=>{let called=false;assert.equal(await service(repository(),async()=>{called=true;return null;}).detail("no-existe"),null);assert.equal(called,false);});
test("GET de catálogo no consulta ni expone medios editoriales",async()=>{let called=false;const result=await service(repository([family()]),async()=>{called=true;return {media:[]};}).list(query());assert.equal(called,false);assert.equal("websiteContent" in result.items[0],false);});
test("campos privados no aparecen",async()=>{const catalog=service(repository([family()],[product()]));const item=(await catalog.list(query())).items.find((entry)=>entry.type==="PRODUCT") as unknown as Record<string,unknown>;for(const key of ["costPrice","wholesalePrice","retailPrice","digitalPrice","reservedStock","createdAt","updatedAt"])assert.equal(key in item,false);const familyItem=(await catalog.detail("chazam"))!.item;if(familyItem.type==="FAMILY"){const variant=familyItem.variants[0] as unknown as Record<string,unknown>;for(const key of ["costPrice","wholesalePrice","retailPrice","digitalPrice","reservedStock","createdAt","updatedAt"])assert.equal(key in variant,false);}});
test("detalle HTTP conserva Cache-Control y ETag",async()=>{
  const app=express();
  const catalog=service(repository([family()]));
  app.use(createCatalogRouter(catalog));
  const server=app.listen(0);
  try{
    if(!server.listening)await new Promise<void>((resolve)=>server.once("listening",resolve));
    const address=server.address();assert.ok(address&&typeof address!=="string");
    const response=await fetch(`http://127.0.0.1:${address.port}/chazam`);
    assert.equal(response.status,200);
    assert.equal(response.headers.get("cache-control"),CATALOG_CACHE_CONTROL);
    assert.ok(response.headers.get("etag"));
  }finally{await new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve()));}
});
