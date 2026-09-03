import { describe, expect, it } from "vitest";
import { firstEditorialHero, mediaForRole } from "./editorialMedia";
import type { PublicWebsiteContentMedia } from "../types/catalog";

const media:PublicWebsiteContentMedia[]=[
  {role:"HERO",url:"hero-2",alt:"Hero 2",position:2,width:10,height:10},
  {role:"BENEFITS",url:"benefits",alt:"Beneficios",position:0,width:10,height:10},
  {role:"HERO",url:"hero-1",alt:"Hero 1",position:0,width:10,height:10},
];

describe("editorialMedia",()=>{
  it("elige el primer HERO publicado por posición",()=>expect(firstEditorialHero(media)?.url).toBe("hero-1"));
  it("filtra cada role y conserva el array original",()=>{expect(mediaForRole(media,"BENEFITS").map((item)=>item.url)).toEqual(["benefits"]);expect(media.map((item)=>item.url)).toEqual(["hero-2","benefits","hero-1"]);});
  it("devuelve null sin HERO",()=>expect(firstEditorialHero(media.filter((item)=>item.role!=="HERO"))).toBeNull());
});
