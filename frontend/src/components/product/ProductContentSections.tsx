import type { PublicWebsiteContentMedia } from "../../types/catalog";
import { ProductEditorialMedia } from "./ProductEditorialMedia";

type Content={description?:string;benefits?:string[];applications?:string[];usage?:string[];dilution?:string[];precautions?:string[];pictograms?:string[];technicalSheetUrl?:string;faq?:Array<{question:string;answer:string}>};

function TextList({title,items}:{title:string;items?:string[]}){return items?.length?<section className="mt-10"><h2 className="text-2xl font-black sm:text-3xl">{title}</h2><ul className="mt-4 space-y-3 text-black/65">{items.map((item)=><li key={item} className="flex min-w-0 gap-3"><span aria-hidden="true">•</span><span className="min-w-0 break-words">{item}</span></li>)}</ul></section>:null;}

export function ProductContentSections({content,media=[],resetKey}: {content:Content;media?:PublicWebsiteContentMedia[];resetKey:string}){
  const hasMore=[content.benefits,content.applications,content.usage,content.dilution,content.precautions,content.pictograms].some((items)=>items?.length)||content.technicalSheetUrl||content.faq?.length||media.length;
  if(!content.description&&!hasMore)return null;
  return <div className="mt-16 border-t border-black/10 pt-12 empty:hidden sm:mt-20 sm:pt-16">
    <ProductEditorialMedia role="HERO" media={media} hero resetKey={resetKey}/>
    {content.description&&<section><h2 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">Descripción</h2><p className="mt-5 max-w-4xl text-base leading-8 text-black/65 sm:text-lg">{content.description}</p></section>}
    <ProductEditorialMedia role="BENEFITS" media={media} title="Beneficios" groups={[{items:content.benefits}]} resetKey={resetKey}/>
    <TextList title="Aplicaciones" items={content.applications}/>
    <ProductEditorialMedia role="USAGE" media={media} title="Modo de uso" groups={[{items:content.usage}]} resetKey={resetKey}/>
    <TextList title="Dilución" items={content.dilution}/>
    <ProductEditorialMedia role="SAFETY" media={media} title="Seguridad" groups={[{label:"Precauciones",items:content.precautions},{label:"Pictogramas",items:content.pictograms}]} resetKey={resetKey}/>
    <ProductEditorialMedia role="INFOGRAPHIC" media={media} title="Información del producto" resetKey={resetKey}/>
    {content.technicalSheetUrl&&<section className="mt-10"><h2 className="text-2xl font-black">Ficha técnica</h2><a href={content.technicalSheetUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center rounded-full border border-black/15 px-5 font-black">Consultar ficha técnica</a></section>}
    {content.faq?.length?<section className="mt-10"><h2 className="text-2xl font-black">Preguntas frecuentes</h2><div className="mt-4 space-y-3">{content.faq.map((item)=><details key={item.question} className="rounded-2xl bg-[#F5F5F5] p-5"><summary className="cursor-pointer font-black">{item.question}</summary><p className="mt-3 leading-7 text-black/65">{item.answer}</p></details>)}</div></section>:null}
  </div>;
}
