type Content={description?:string;benefits?:string[];applications?:string[];usage?:string[];dilution?:string[];precautions?:string[];pictograms?:string[];technicalSheetUrl?:string;faq?:Array<{question:string;answer:string}>};

export function ProductContentSections({content}: {content:Content}){
  const lists:Array<[string,string[]|undefined]>=[["Beneficios",content.benefits],["Aplicaciones",content.applications],["Modo de uso",content.usage],["Dilución",content.dilution],["Precauciones",content.precautions],["Pictogramas",content.pictograms]];
  const hasMore=lists.some(([,items])=>items?.length)||content.technicalSheetUrl||content.faq?.length;
  if(!content.description&&!hasMore)return null;
  return <div className="mt-16 border-t border-black/10 pt-12 sm:mt-20 sm:pt-16">
    {content.description&&<section><h2 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">Descripción</h2><p className="mt-5 max-w-4xl text-base leading-8 text-black/65 sm:text-lg">{content.description}</p></section>}
    <div className="mt-10 grid gap-8 md:grid-cols-2">{lists.map(([title,items])=>items?.length?<section key={title}><h2 className="text-2xl font-black">{title}</h2><ul className="mt-4 space-y-3 text-black/65">{items.map((item)=><li key={item} className="flex gap-3"><span aria-hidden="true">•</span><span>{item}</span></li>)}</ul></section>:null)}</div>
    {content.technicalSheetUrl&&<section className="mt-10"><h2 className="text-2xl font-black">Ficha técnica</h2><a href={content.technicalSheetUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center rounded-full border border-black/15 px-5 font-black">Consultar ficha técnica</a></section>}
    {content.faq?.length?<section className="mt-10"><h2 className="text-2xl font-black">Preguntas frecuentes</h2><div className="mt-4 space-y-3">{content.faq.map((item)=><details key={item.question} className="rounded-2xl bg-[#F5F5F5] p-5"><summary className="cursor-pointer font-black">{item.question}</summary><p className="mt-3 leading-7 text-black/65">{item.answer}</p></details>)}</div></section>:null}
  </div>;
}
