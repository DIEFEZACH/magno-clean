import { useState } from "react";

export function ProductGallery({images,name}:{images:Array<{url:string;alt:string}>;name:string}){
  const [selected,setSelected]=useState(images[0]?.url??null);
  const [failed,setFailed]=useState<string[]>([]);
  const visible=images.filter((image)=>!failed.includes(image.url));
  const main=visible.find((image)=>image.url===selected)??visible[0]??null;
  return <div className="min-w-0">
    <div className="flex aspect-square items-center justify-center rounded-xl border border-[#e6eae7] bg-[#f8f9f7] p-5 sm:p-8">
      {main?<img src={main.url} alt={main.alt} width="720" height="720" decoding="async" fetchPriority="high" onError={()=>setFailed((values)=>[...values,main.url])} className="h-full w-full object-contain mix-blend-multiply"/>:<div className="text-center"><span className="text-5xl font-black tracking-tighter text-[#168fa1]">MC.</span><p className="mt-3 text-xs text-black/45">Imagen no disponible</p></div>}
    </div>
    {visible.length>1&&<div className="mt-4 flex flex-wrap gap-3 pb-2" aria-label={`Galería de ${name}`}>{visible.map((image,index)=><button type="button" aria-label={`Ver imagen ${index+1} de ${name}`} aria-pressed={main?.url===image.url} key={image.url} onClick={()=>setSelected(image.url)} className="h-16 w-16 shrink-0 rounded-lg border-2 border-transparent bg-white p-1.5 transition aria-pressed:border-[#19A2B6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#19A2B6] sm:h-20 sm:w-20"><img src={image.url} alt="" width="80" height="80" loading="lazy" decoding="async" className="h-full w-full object-contain"/></button>)}</div>}
  </div>;
}
