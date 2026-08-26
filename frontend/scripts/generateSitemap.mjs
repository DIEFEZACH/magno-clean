import { access, mkdir, writeFile } from "node:fs/promises";

const apiUrl=(process.env.VITE_API_URL||"http://localhost:4000").replace(/\/$/,"");
const siteUrl=(process.env.VITE_SITE_URL||"http://localhost:5173").replace(/\/$/,"");
const allowStale=process.env.SITEMAP_ALLOW_STALE==="true";
const escapeXml=(value)=>String(value).replace(/[<>&'\"]/g,char=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"})[char]);
let data;
try {
  const response=await fetch(`${apiUrl}/api/products`,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`API respondió ${response.status}`);
  data=await response.json();
} catch(error) {
  if(!allowStale)throw new Error(`No se pudo generar sitemap desde ${apiUrl}: ${error instanceof Error?error.message:String(error)}`);
  await Promise.all([access(new URL("../public/sitemap.xml",import.meta.url)),access(new URL("../public/robots.txt",import.meta.url))]);
  console.warn("API no disponible; se conservó el sitemap versionado porque SITEMAP_ALLOW_STALE=true.");
  process.exit(0);
}
const products=Array.isArray(data.products)?data.products.filter(product=>product.active):[];
const categories=[...new Set(products.map(product=>product.category).filter(Boolean))];
const staticPaths=["/","/productos","/categorias","/nosotros","/contacto","/soporte"];
const urls=[...staticPaths.map(path=>({loc:`${siteUrl}${path}`,changefreq:path==="/"?"daily":"weekly",priority:path==="/"?"1.0":"0.8"})),...categories.map(category=>({loc:`${siteUrl}/productos?category=${encodeURIComponent(category)}`,changefreq:"weekly",priority:"0.7"})),...products.map(product=>({loc:`${siteUrl}/producto/${encodeURIComponent(product.slug)}`,lastmod:product.updatedAt?new Date(product.updatedAt).toISOString():undefined,changefreq:"weekly",priority:"0.8"}))];
const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url=>`  <url>\n    <loc>${escapeXml(url.loc)}</loc>${url.lastmod?`\n    <lastmod>${escapeXml(url.lastmod)}</lastmod>`:""}\n    <changefreq>${url.changefreq}</changefreq>\n    <priority>${url.priority}</priority>\n  </url>`).join("\n")}\n</urlset>\n`;
const robots=`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin/\nDisallow: /checkout\nDisallow: /checkout/\nDisallow: /carrito\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
await mkdir(new URL("../public/",import.meta.url),{recursive:true});await Promise.all([writeFile(new URL("../public/sitemap.xml",import.meta.url),xml),writeFile(new URL("../public/robots.txt",import.meta.url),robots)]);console.log(`Sitemap generado: ${products.length} productos, ${categories.length} categorías, ${urls.length} URLs.`);
