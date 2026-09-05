import { describe, expect, it } from "vitest";
import { isWithheldProductImage } from "./productImageReview";
import { buildGallery } from "./productDetail";
import type { CatalogFamily, CatalogVariant } from "../types/catalog";

const incorrect = "https://res.cloudinary.com/dl2s0vpwb/image/upload/v1784785510/nlobiiil9vdxjyghgkk6_vgtcoy.webp";
const defaults = {slug:"fixture",description:"Fixture",label:"2 KG",sortOrder:1,price:100,oldPrice:null,badge:null,available:false,availableStock:0,images:[]};
describe("confirmed image label review",()=>{
  it("withholds only a confirmed code and exact URL, not future corrected photos",()=>{
    expect(isWithheldProductImage("PLCT2",incorrect)).toBe(true);
    expect(isWithheldProductImage("PLCT2","https://images.example/correct-2kg.webp")).toBe(false);
    expect(isWithheldProductImage("OTHER",incorrect)).toBe(false);
  });
  it("does not substitute the 1 KG family image for the blocked 2 KG presentation",()=>{
    const variant:CatalogVariant={...defaults,id:"v2",code:"PLCT2",name:"CITRICAL 2 KG",imageUrl:incorrect};
    const family={type:"FAMILY",name:"CITRICAL",imageUrl:"https://images.example/1kg.webp"} as CatalogFamily;
    expect(buildGallery(family,variant)).toEqual([]);
  });
  it("keeps a selected variant physical image instead of adding a sibling family photo",()=>{
    const variant:CatalogVariant={...defaults,id:"v5",code:"EMLFO5",name:"MULTIFIBRAS ORANGE 5 LTS",imageUrl:"https://images.example/5l.webp"};
    const family={type:"FAMILY",name:"MULTIFIBRAS ORANGE",imageUrl:"https://images.example/1l.webp"} as CatalogFamily;
    expect(buildGallery(family,variant)).toEqual([{url:variant.imageUrl,alt:variant.name}]);
  });
});
