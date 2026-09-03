import { expect, test, type Page } from "@playwright/test";

const media=(role:string,position=0)=>({role,url:`https://media.example/${role.toLowerCase()}-${position}.webp`,alt:`Medio editorial ${role} ${position}`,position,width:1254,height:1254});
const variants=[
  {id:"variant-1",slug:"familia-demo-1l",code:"V1",name:"Familia Demo 1 L",description:"Descripción 1 L",label:"1 L",sortOrder:1,price:100,oldPrice:null,imageUrl:"https://media.example/product-1.webp",images:[],badge:null,available:true,availableStock:5},
  {id:"variant-2",slug:"familia-demo-5l",code:"V5",name:"Familia Demo 5 L",description:"Descripción 5 L",label:"5 L",sortOrder:2,price:400,oldPrice:null,imageUrl:"https://media.example/product-5.webp",images:[],badge:null,available:true,availableStock:2},
];
const family={type:"FAMILY",id:"family-1",slug:"familia-demo",name:"Familia Demo con un nombre deliberadamente largo para validar el ajuste responsive",brand:"Magno Clean",category:"Limpieza",shortDescription:"Descripción familiar",imageUrl:null,badge:null,featured:false,variantType:"Presentación",variantCount:2,priceFrom:100,available:true,availableStock:7,displayMode:"FAMILY",variants};
const product={type:"PRODUCT",id:"product-1",slug:"producto-individual",code:"P1",brand:"Magno Clean",name:"Producto Individual",category:"Limpieza",description:"Descripción individual",imageUrl:"https://media.example/product.webp",images:[],price:90,oldPrice:null,badge:null,featured:false,available:true,availableStock:3};
const websiteContent={media:[media("INFOGRAPHIC"),media("SAFETY"),media("USAGE"),media("BENEFITS"),media("HERO")]};
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254"><rect width="1254" height="1254" fill="#e5f7fa"/><circle cx="627" cy="627" r="280" fill="#19a2b6"/></svg>';

async function mockPublicApi(page:Page){
  await page.route("https://media.example/**",(route)=>route.fulfill({status:200,contentType:"image/svg+xml",body:svg}));
  await page.route("http://api.media-b.test/**",(route)=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/api/checkout/status")return route.fulfill({json:{checkoutEnabled:false}});
    if(url.pathname==="/api/catalog")return route.fulfill({json:{items:[],pagination:{page:1,pageSize:6,total:0,pages:0},filters:{categories:[],brands:[]}}});
    if(url.pathname==="/api/catalog/producto-individual")return route.fulfill({json:{item:product,selectedVariantId:null,canonicalSlug:product.slug,websiteContent}});
    const historical=url.pathname.endsWith("familia-demo-5l");
    if(url.pathname.startsWith("/api/catalog/"))return route.fulfill({json:{item:family,selectedVariantId:historical?"variant-2":null,canonicalSlug:family.slug,websiteContent}});
    return route.fulfill({status:404,json:{message:"Not found"}});
  });
}

for(const width of [320,375,430,768,1024,1440]){
  test(`ProductFamily sin overflow a ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:1000});await mockPublicApi(page);await page.goto("/producto/familia-demo?variant=V1");
    await expect(page.getByRole("heading",{level:1,name:/Familia Demo con un nombre/})).toBeVisible();await expect(page.getByRole("img",{name:"Medio editorial HERO 0"})).toBeVisible();
    const metrics=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    for(const image of await page.locator('img[alt^="Medio editorial"]').all()){const box=await image.boundingBox();expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(-1);expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);expect(await image.getAttribute("width")).toBe("1254");expect(await image.getAttribute("height")).toBe("1254");}
  });
}

test("selector por teclado, query y slug histórico conservan media familiar",async({page})=>{
  await mockPublicApi(page);await page.goto("/producto/familia-demo?variant=V1");
  const option=page.getByRole("button",{name:/5 L/});await option.focus();await page.keyboard.press("Enter");await expect(page.getByText("V5",{exact:true})).toBeVisible();await expect(page).toHaveURL(/variant=V5/);await expect(page.getByRole("img",{name:"Medio editorial HERO 0"})).toBeVisible();
  await page.goto("/producto/familia-demo-5l");await expect(page.getByText("V5",{exact:true})).toBeVisible();await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href","http://127.0.0.1:4174/producto/familia-demo");
});

test("PRODUCT conserva su imagen física en OpenGraph",async({page})=>{
  await mockPublicApi(page);await page.goto("/producto/producto-individual");await expect(page.getByRole("heading",{level:1,name:"Producto Individual"})).toBeVisible();await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content","https://media.example/product.webp");await expect(page.getByRole("img",{name:"Medio editorial HERO 0"})).toBeVisible();
});
