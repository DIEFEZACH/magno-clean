import { useState } from "react";
import { mediaForRole } from "../../lib/editorialMedia";
import type { PublicWebsiteContentMedia, PublicWebsiteContentMediaRole } from "../../types/catalog";

type ContentGroup={label?:string;items?:string[]};

function mediaKey(item:PublicWebsiteContentMedia){return `${item.role}:${item.position}:${item.url}`;}

export function ProductEditorialMedia({
  role,
  media,
  title,
  groups=[],
  hero=false,
  resetKey,
}:{
  role:PublicWebsiteContentMediaRole;
  media:PublicWebsiteContentMedia[];
  title?:string;
  groups?:ContentGroup[];
  hero?:boolean;
  resetKey:string;
}){
  const [failureState,setFailureState]=useState<{key:string;assets:Set<string>}>({key:resetKey,assets:new Set()});
  const failed=failureState.key===resetKey?failureState.assets:new Set<string>();
  const roleAssets=mediaForRole(media,role);
  const assets=roleAssets.filter((item)=>!failed.has(mediaKey(item)));
  const visibleGroups=groups.filter((group)=>group.items?.length);
  if(roleAssets.length>0&&!assets.length)return null;
  if(!assets.length&&!visibleGroups.length)return null;
  const markFailed=(item:PublicWebsiteContentMedia)=>setFailureState((current)=>{
    const next=current.key===resetKey?new Set(current.assets):new Set<string>();
    next.add(mediaKey(item));
    return {key:resetKey,assets:next};
  });
  const imageGrid=assets.length>1?"sm:grid-cols-2":"grid-cols-1";
  return <section aria-label={!title?"Contenido visual del producto":undefined} className={hero?"mt-12 mb-12 sm:mt-16 sm:mb-16":"mt-10"}>
    {title&&<h2 className="text-2xl font-black sm:text-3xl">{title}</h2>}
    {visibleGroups.map((group,index)=><div key={`${group.label??"items"}-${index}`} className={title||index?"mt-4":""}>{group.label&&<h3 className="text-lg font-black">{group.label}</h3>}<ul className={`${group.label?"mt-3":""} space-y-3 text-black/65`}>{group.items!.map((item)=><li key={item} className="flex min-w-0 gap-3"><span aria-hidden="true">•</span><span className="min-w-0 break-words">{item}</span></li>)}</ul></div>)}
    {assets.length>0&&<div className={`${title||visibleGroups.length?"mt-5":""} grid min-w-0 gap-5 ${imageGrid}`}>{assets.map((item)=><figure key={mediaKey(item)} className="min-w-0 overflow-hidden rounded-[1.5rem] bg-[#F5F5F5]"><img src={item.url} alt={item.alt} width={item.width} height={item.height} loading="lazy" decoding="async" onError={()=>markFailed(item)} className="block h-auto w-full max-w-full object-contain"/></figure>)}</div>}
  </section>;
}
