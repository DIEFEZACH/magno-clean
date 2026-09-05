import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogDetailResponse, CatalogFamily, CatalogProduct, PublicWebsiteContentMedia } from "../types/catalog";
import { ProductDetail } from "./ProductDetail";

const mocks=vi.hoisted(()=>({
  detail:null as CatalogDetailResponse|null,
  addItem:vi.fn(),
}));

vi.mock("../hooks/useCatalog",()=>({
  useCatalogDetail:()=>({detail:mocks.detail,loading:false,error:null,notFound:false,refetch:vi.fn()}),
  useCatalog:()=>({items:[],pagination:{page:1,pageSize:6,total:0,pages:0},filters:{categories:[],brands:[]},loading:false,error:null,refetch:vi.fn()}),
}));
vi.mock("../hooks/useCheckoutAvailability",()=>({useCheckoutAvailability:()=>({checkoutEnabled:false,loading:false})}));
vi.mock("../store/cartStore",()=>({useCartStore:(selector:(state:{addItem:typeof mocks.addItem})=>unknown)=>selector({addItem:mocks.addItem})}));

const editorial=(role:PublicWebsiteContentMedia["role"],position=0):PublicWebsiteContentMedia=>({role,url:`https://media.example/${role.toLowerCase()}-${position}.webp`,alt:`Medio ${role} ${position}`,position,width:1200,height:900});

const family:CatalogFamily={
  type:"FAMILY",id:"family-1",slug:"familia-demo",name:"Familia Demo",brand:"Magno Clean",category:"Limpieza",shortDescription:"Descripción familiar",imageUrl:"https://media.example/family.webp",badge:null,featured:false,variantType:"Presentación",variantCount:2,priceFrom:100,available:true,availableStock:7,displayMode:"FAMILY",
  variants:[
    {id:"variant-1",slug:"familia-demo-1l",code:"V1",name:"Familia Demo 1 L",description:"Descripción 1 L",label:"1 L",sortOrder:1,price:100,oldPrice:null,imageUrl:"https://media.example/product-1.webp",images:[],badge:null,available:true,availableStock:5},
    {id:"variant-2",slug:"familia-demo-5l",code:"V5",name:"Familia Demo 5 L",description:"Descripción 5 L",label:"5 L",sortOrder:2,price:400,oldPrice:null,imageUrl:"https://media.example/product-5.webp",images:[],badge:null,available:true,availableStock:2},
  ],
};
const product:CatalogProduct={type:"PRODUCT",id:"product-1",slug:"producto-individual",code:"P1",brand:"Magno Clean",name:"Producto Individual",category:"Limpieza",description:"Descripción individual",imageUrl:"https://media.example/physical.webp",images:[],price:90,oldPrice:null,badge:null,featured:false,available:true,availableStock:3};

function familyDetail(websiteContent:CatalogDetailResponse["websiteContent"],selectedVariantId:string|null=null):CatalogDetailResponse{return {item:family,selectedVariantId,canonicalSlug:family.slug,websiteContent};}
function productDetail(websiteContent:CatalogDetailResponse["websiteContent"]):CatalogDetailResponse{return {item:product,selectedVariantId:null,canonicalSlug:product.slug,websiteContent};}
function renderDetail(entry="/producto/familia-demo"){return render(<MemoryRouter initialEntries={[entry]}><Routes><Route path="/producto/:slug" element={<ProductDetail/>}/></Routes></MemoryRouter>);}
function jsonLd(type:string){return Array.from(document.querySelectorAll<HTMLScriptElement>('script[data-magno-jsonld="true"]')).map((node)=>JSON.parse(node.text)).find((entry)=>entry["@type"]===type);}

describe("ProductDetail Media B",()=>{
  beforeEach(()=>{mocks.detail=familyDetail(null);mocks.addItem.mockReset();});

  it("mantiene el detalle actual con websiteContent null o media vacío",()=>{
    const first=renderDetail();expect(screen.getByRole("heading",{level:1,name:"Familia Demo"})).toBeInTheDocument();expect(screen.queryByText("Información del producto")).not.toBeInTheDocument();first.unmount();
    mocks.detail=familyDetail({media:[]});renderDetail();expect(screen.getByText("Descripción familiar")).toBeInTheDocument();expect(screen.queryByText("Información del producto")).not.toBeInTheDocument();
  });

  it("renderiza múltiples roles en el orden editorial",()=>{
    mocks.detail=familyDetail({media:[editorial("INFOGRAPHIC"),editorial("SAFETY"),editorial("USAGE"),editorial("BENEFITS"),editorial("HERO")]});
    const {container}=renderDetail();
    const urls=Array.from(container.querySelectorAll<HTMLImageElement>('img[alt^="Medio "]')).map((image)=>image.src);
    expect(urls).toEqual(["https://media.example/hero-0.webp","https://media.example/benefits-0.webp","https://media.example/usage-0.webp","https://media.example/safety-0.webp","https://media.example/infographic-0.webp"]);
  });

  it("usa HERO familiar en OpenGraph y ProductGroup, sin contaminar imágenes de variantes",async()=>{
    mocks.detail=familyDetail({media:[editorial("BENEFITS"),editorial("HERO")]});renderDetail();
    await waitFor(()=>expect(document.head.querySelector('meta[property="og:image"]')).toHaveAttribute("content","https://media.example/hero-0.webp"));
    const group=jsonLd("ProductGroup");expect(group.image).toEqual(["https://media.example/hero-0.webp"]);expect(group.hasVariant[0].image).toEqual(["https://media.example/product-1.webp"]);expect(JSON.stringify(group.hasVariant)).not.toContain("hero-0.webp");
  });

  it("PRODUCT individual conserva prioridad SEO de imagen física",async()=>{
    mocks.detail=productDetail({media:[editorial("HERO")]});renderDetail("/producto/producto-individual");
    await waitFor(()=>expect(document.head.querySelector('meta[property="og:image"]')).toHaveAttribute("content","https://media.example/physical.webp"));
    const schema=jsonLd("Product");expect(schema.image[0]).toBe("https://media.example/physical.webp");expect(JSON.stringify(schema)).not.toContain("hero-0.webp");
    expect(screen.getByRole("img",{name:"Medio HERO 0"})).toBeInTheDocument();
  });

  it("slug histórico selecciona la variante indicada y conserva media familiar",()=>{
    mocks.detail=familyDetail({media:[editorial("SAFETY")]},"variant-2");renderDetail("/producto/familia-demo-5l");
    expect(screen.getByText("V5")).toBeInTheDocument();expect(screen.getByRole("img",{name:"Medio SAFETY 0"})).toBeInTheDocument();
  });

  it("?variant válido selecciona por código y un valor inválido usa el fallback",()=>{
    const first=renderDetail("/producto/familia-demo?variant=V5");expect(screen.getByText("V5")).toBeInTheDocument();first.unmount();
    renderDetail("/producto/familia-demo?variant=NO-EXISTE");expect(screen.getByText("V1")).toBeInTheDocument();
  });

  it("cambiar variante por teclado mantiene los medios familiares",async()=>{
    mocks.detail=familyDetail({media:[editorial("HERO")]});const user=userEvent.setup();renderDetail();
    const option=screen.getByRole("button",{name:/5 L/});option.focus();await user.keyboard("{Enter}");
    expect(screen.getByText("V5")).toBeInTheDocument();expect(screen.getByRole("img",{name:"Medio HERO 0"})).toBeInTheDocument();expect(option).toHaveFocus();
  });

  it("permite consultar una variante agotada sin permitir compra",async()=>{
    mocks.detail={...familyDetail(null),item:{...family,variants:family.variants.map((variant)=>({...variant,available:false,availableStock:0})),available:false,availableStock:0}};
    const user=userEvent.setup();renderDetail();
    const option=screen.getByRole("button",{name:/5 L/});
    expect(option).toBeEnabled();option.focus();await user.keyboard("{Enter}");
    expect(option).toHaveAttribute("aria-pressed","true");
    expect(screen.getByText("V5")).toBeInTheDocument();
    expect(screen.getByRole("img",{name:"Familia Demo 5 L"})).toHaveAttribute("src","https://media.example/product-5.webp");
    expect(screen.queryByRole("button",{name:"Agregar al carrito"})).not.toBeInTheDocument();
    expect(mocks.addItem).not.toHaveBeenCalled();
  });

  it("no anuncia roles no HERO en OpenGraph o JSON-LD",async()=>{
    mocks.detail=familyDetail({media:[editorial("BENEFITS"),editorial("USAGE"),editorial("SAFETY"),editorial("INFOGRAPHIC")]});renderDetail();
    await waitFor(()=>expect(document.head.querySelector('meta[property="og:image"]')).toHaveAttribute("content","https://media.example/product-1.webp"));
    const serialized=JSON.stringify(jsonLd("ProductGroup"));for(const role of ["benefits","usage","safety","infographic"])expect(serialized).not.toContain(role);
  });

  it("oculta un role editorial completo cuando fallan todos sus medios",()=>{
    mocks.detail=familyDetail({media:[editorial("SAFETY")]});renderDetail();
    fireEvent.error(screen.getByRole("img",{name:"Medio SAFETY 0"}));
    expect(screen.queryByRole("heading",{name:"Seguridad"})).not.toBeInTheDocument();
    expect(screen.queryByRole("img",{name:"Medio SAFETY 0"})).not.toBeInTheDocument();
    expect(screen.getByRole("heading",{name:"Descripción"})).toBeInTheDocument();
  });
});
