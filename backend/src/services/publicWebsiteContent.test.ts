import assert from "node:assert/strict";
import test from "node:test";
import { WebsiteContentStatus } from "@prisma/client";
import { env } from "../config/env";
import { publicStorageObjectUrl } from "./publicStorageUrl";
import { resolvePublicWebsiteContent, serializePublicWebsiteContent } from "./publicWebsiteContent";

const row = (overrides:Record<string,unknown>={}) => ({
  role: "HERO",
  bucket: "product-media",
  storagePath: "demo/hero/hero-01.webp",
  alt: "Imagen principal aprobada",
  position: 0,
  width: 1200,
  height: 900,
  mimeType: "image/webp",
  ...overrides,
});

function fakeClient(options:{pointer?:boolean;contentMatches?:boolean;status?:WebsiteContentStatus;media?:any[]}={}) {
  const calls:any={};
  const pointer=options.pointer??true;
  const contentMatches=options.contentMatches??true;
  const status=options.status??WebsiteContentStatus.PUBLISHED;
  return {calls,client:{
    websiteContentRevision:{findFirst:async(args:any)=>{calls.revision=args;return pointer&&contentMatches&&status===args.where.status?{media:options.media??[row()]}:null;}},
  }};
}

test("sin WebsiteContent o sin publishedRevisionId devuelve null",async()=>{
  const {client}=fakeClient({pointer:false});
  assert.equal(await resolvePublicWebsiteContent({type:"family",id:"family-1"},client),null);
});

for(const status of [WebsiteContentStatus.DRAFT,WebsiteContentStatus.REVIEW,WebsiteContentStatus.APPROVED]){
  test(`${status} nunca es público`,async()=>{const {client}=fakeClient({status});assert.equal(await resolvePublicWebsiteContent({type:"family",id:"family-1"},client),null);});
}

test("puntero a revisión no publicada o de otro WebsiteContent devuelve null",async()=>{
  const notPublished=fakeClient({status:WebsiteContentStatus.REVIEW});
  assert.equal(await resolvePublicWebsiteContent({type:"family",id:"family-1"},notPublished.client),null);
  const wrongContent=fakeClient({contentMatches:false});
  assert.equal(await resolvePublicWebsiteContent({type:"family",id:"family-1"},wrongContent.client),null);
});

test("revisión publicada correcta devuelve sólo el contrato público",async()=>{
  const {client,calls}=fakeClient();
  const result=await resolvePublicWebsiteContent({type:"family",id:"family-1"},client);
  assert.deepEqual(result,{media:[{role:"HERO",url:`${env.SUPABASE_URL.replace(/\/$/,"")}/storage/v1/object/public/product-media/demo/hero/hero-01.webp`,alt:"Imagen principal aprobada",position:0,width:1200,height:900}]});
  const serialized=JSON.stringify(result);
  for(const forbidden of ["sourceTechnicalData","derivedCommercialContent","sha256","bucket","storagePath","byteSize","reviewRequired","editorialWarning","createdById","publishedAt","revision-1","PUBLISHED"])assert.equal(serialized.includes(forbidden),false);
  assert.deepEqual(Object.keys(calls.revision.select),["media"]);
  assert.deepEqual(Object.keys(calls.revision.select.media.select).sort(),["alt","bucket","height","mimeType","position","role","storagePath","width"].sort());
  assert.equal("id" in calls.revision.select,false);
  assert.equal("status" in calls.revision.select,false);
});

test("revisión publicada sin medios conserva media vacío",async()=>{const {client}=fakeClient({media:[]});assert.deepEqual(await resolvePublicWebsiteContent({type:"product",id:"product-1"},client),{media:[]});});

test("ordena por role aprobado y después position",()=>{
  const result=serializePublicWebsiteContent([
    row({role:"INFOGRAPHIC",position:1,storagePath:"demo/info/info-02.webp"}),
    row({role:"USAGE",position:0,storagePath:"demo/usage/usage-01.webp"}),
    row({role:"HERO",position:2,storagePath:"demo/hero/hero-03.webp"}),
    row({role:"SAFETY",position:0,storagePath:"demo/safety/safety-01.webp"}),
    row({role:"BENEFITS",position:0,storagePath:"demo/benefits/benefits-01.webp"}),
    row({role:"HERO",position:0,storagePath:"demo/hero/hero-01.webp"}),
  ]);
  assert.deepEqual(result.media.map((item)=>`${item.role}:${item.position}`),["HERO:0","HERO:2","BENEFITS:0","USAGE:0","SAFETY:0","INFOGRAPHIC:1"]);
});

test("filtra bucket, MIME, dimensiones, alt, posición y ruta inválidos",()=>{
  const result=serializePublicWebsiteContent([
    row(),
    row({role:"OTHER"}),
    row({bucket:"otro"}),
    row({mimeType:"image/png"}),
    row({mimeType:"IMAGE/WEBP"}),
    row({width:0}),
    row({height:null}),
    row({alt:"   "}),
    row({position:-1}),
    row({storagePath:"demo/../hero.webp"}),
  ]);
  assert.equal(result.media.length,1);
});

test("la URL usa SUPABASE_URL y codifica cada segmento",()=>{
  assert.equal(publicStorageObjectUrl(env.SUPABASE_URL,"product-media","familia demo/hero #1.webp"),`${env.SUPABASE_URL.replace(/\/$/,"")}/storage/v1/object/public/product-media/familia%20demo/hero%20%231.webp`);
});

test("consulta el target familiar o individual sin cargar fuentes",async()=>{
  const family=fakeClient();await resolvePublicWebsiteContent({type:"family",id:"family-1"},family.client);assert.deepEqual(family.calls.revision.where.content,{is:{familyId:"family-1",productId:null}});assert.deepEqual(family.calls.revision.where.publishedFor,{is:{familyId:"family-1",productId:null}});
  const product=fakeClient();await resolvePublicWebsiteContent({type:"product",id:"product-1"},product.client);assert.deepEqual(product.calls.revision.where.content,{is:{productId:"product-1",familyId:null}});assert.deepEqual(product.calls.revision.where.publishedFor,{is:{productId:"product-1",familyId:null}});
  assert.equal("sources" in family.calls.revision.select,false);
});
