import { useState } from "react";

export function ProductGallery({images,name}:{images:Array<{url:string;alt:string}>;name:string}){
  const [selected,setSelected]=useState(images[0]?.url??null);
  const main=images.find((image)=>image.url===selected)??images[0]??null;
  return <div className="min-w-0">
    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#19A2B6]/10 to-[#EF8329]/10 p-4 sm:p-8">
      {main?<img src={main.url} alt={main.alt} width="720" height="720" decoding="async" fetchPriority="high" className="h-full w-full object-contain"/>:<span className="text-6xl font-black text-[#19A2B6]">MC</span>}
    </div>
    {images.length>1&&<div className="mt-4 flex gap-3 overflow-x-auto pb-2" aria-label={`Galería de ${name}`}>{images.map((image,index)=><button type="button" aria-label={`Ver imagen ${index+1} de ${name}`} aria-pressed={main?.url===image.url} key={image.url} onClick={()=>setSelected(image.url)} className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 border-transparent bg-white p-1.5 shadow-sm transition aria-pressed:border-[#19A2B6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#19A2B6] sm:h-20 sm:w-20"><img src={image.url} alt="" width="80" height="80" loading="lazy" decoding="async" className="h-full w-full object-contain"/></button>)}</div>}
  </div>;
}
