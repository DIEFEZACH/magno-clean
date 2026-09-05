/* eslint-disable react-refresh/only-export-components */
import { useEffect } from "react";
import { SITE_URL } from "../lib/config";

const DEFAULT_IMAGE=`${SITE_URL}/favicon.svg`;
type JsonLd=Record<string,unknown>|Array<Record<string,unknown>>;
type Props={title:string;description:string;path:string;image?:string|null;type?:"website"|"product";noIndex?:boolean;jsonLd?:JsonLd};

function setMeta(selector:string,attributes:Record<string,string>){let element=document.head.querySelector<HTMLMetaElement>(selector);if(!element){element=document.createElement("meta");document.head.appendChild(element)}Object.entries(attributes).forEach(([key,value])=>element!.setAttribute(key,value));}

export function Seo({title,description,path,image,type="website",noIndex=false,jsonLd}:Props){
  noIndex = noIndex || import.meta.env.VITE_DEMO_PREVIEW === "true";
  useEffect(()=>{const fullTitle=title.includes("Magno Clean")?title:`${title} | Magno Clean`;const canonical=`${SITE_URL}${path.startsWith("/")?path:`/${path}`}`;document.title=fullTitle;document.documentElement.lang="es-MX";
    setMeta('meta[name="description"]',{name:"description",content:description});setMeta('meta[name="robots"]',{name:"robots",content:noIndex?"noindex,nofollow":"index,follow"});setMeta('meta[property="og:type"]',{property:"og:type",content:type});setMeta('meta[property="og:site_name"]',{property:"og:site_name",content:"Magno Clean"});setMeta('meta[property="og:title"]',{property:"og:title",content:fullTitle});setMeta('meta[property="og:description"]',{property:"og:description",content:description});setMeta('meta[property="og:url"]',{property:"og:url",content:canonical});setMeta('meta[property="og:image"]',{property:"og:image",content:image||DEFAULT_IMAGE});setMeta('meta[name="twitter:card"]',{name:"twitter:card",content:"summary_large_image"});setMeta('meta[name="twitter:title"]',{name:"twitter:title",content:fullTitle});setMeta('meta[name="twitter:description"]',{name:"twitter:description",content:description});setMeta('meta[name="twitter:image"]',{name:"twitter:image",content:image||DEFAULT_IMAGE});
    let link=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');if(!link){link=document.createElement("link");link.rel="canonical";document.head.appendChild(link)}link.href=canonical;
    document.querySelectorAll('script[data-magno-jsonld="true"]').forEach(node=>node.remove());if(jsonLd){const entries=Array.isArray(jsonLd)?jsonLd:[jsonLd];entries.forEach(entry=>{const script=document.createElement("script");script.type="application/ld+json";script.dataset.magnoJsonld="true";script.text=JSON.stringify(entry).replace(/</g,"\\u003c");document.head.appendChild(script)})}
    return()=>document.querySelectorAll('script[data-magno-jsonld="true"]').forEach(node=>node.remove());
  },[description,image,jsonLd,noIndex,path,title,type]);return null;
}

export const siteUrl=SITE_URL;
