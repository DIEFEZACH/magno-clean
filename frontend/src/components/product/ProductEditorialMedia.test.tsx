import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicWebsiteContentMedia, PublicWebsiteContentMediaRole } from "../../types/catalog";
import { ProductEditorialMedia } from "./ProductEditorialMedia";

const asset=(role:PublicWebsiteContentMediaRole,position=0,overrides:Partial<PublicWebsiteContentMedia>={}):PublicWebsiteContentMedia=>({role,url:`https://media.example/${role.toLowerCase()}-${position}.webp`,alt:`Medio ${role} ${position}`,position,width:1200,height:900,...overrides});

describe("ProductEditorialMedia",()=>{
  for(const [role,title] of [["HERO",null],["BENEFITS","Beneficios"],["USAGE","Modo de uso"],["SAFETY","Seguridad"],["INFOGRAPHIC","Información del producto"]] as const){
    it(`renderiza ${role} con atributos accesibles y dimensiones`,()=>{
      render(<ProductEditorialMedia role={role} media={[asset(role)]} title={title??undefined} hero={role==="HERO"} resetKey="demo"/>);
      const image=screen.getByRole("img",{name:`Medio ${role} 0`});
      expect(image).toHaveAttribute("width","1200");expect(image).toHaveAttribute("height","900");expect(image).toHaveAttribute("loading","lazy");expect(image).toHaveAttribute("decoding","async");
      if(title)expect(screen.getByRole("heading",{name:title})).toBeInTheDocument();
      else expect(screen.getByRole("region",{name:"Contenido visual del producto"})).toBeInTheDocument();
    });
  }

  it("ordena por position sin mutar el contrato recibido",()=>{
    const media=[asset("BENEFITS",2),asset("BENEFITS",0),asset("BENEFITS",1)];
    const original=media.map((item)=>item.position);
    const {container}=render(<ProductEditorialMedia role="BENEFITS" media={media} title="Beneficios" resetKey="demo"/>);
    expect(Array.from(container.querySelectorAll("img")).map((image)=>image.getAttribute("alt"))).toEqual(["Medio BENEFITS 0","Medio BENEFITS 1","Medio BENEFITS 2"]);
    expect(media.map((item)=>item.position)).toEqual(original);
  });

  it("oculta sólo la imagen fallida",()=>{
    render(<ProductEditorialMedia role="USAGE" media={[asset("USAGE",0),asset("USAGE",1)]} title="Modo de uso" resetKey="demo"/>);
    fireEvent.error(screen.getByRole("img",{name:"Medio USAGE 0"}));
    expect(screen.queryByRole("img",{name:"Medio USAGE 0"})).not.toBeInTheDocument();
    expect(screen.getByRole("img",{name:"Medio USAGE 1"})).toBeInTheDocument();
  });

  it("retira role y heading cuando fallan todos sus assets",()=>{
    render(<ProductEditorialMedia role="SAFETY" media={[asset("SAFETY",0)]} title="Seguridad" resetKey="demo"/>);
    fireEvent.error(screen.getByRole("img",{name:"Medio SAFETY 0"}));
    expect(screen.queryByRole("heading",{name:"Seguridad"})).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("retira el role completo aunque tenga texto si fallan todos sus assets",()=>{
    render(<ProductEditorialMedia role="BENEFITS" media={[asset("BENEFITS")]} title="Beneficios" groups={[{items:["Beneficio aprobado"]}]} resetKey="demo"/>);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("heading",{name:"Beneficios"})).not.toBeInTheDocument();
    expect(screen.queryByText("Beneficio aprobado")).not.toBeInTheDocument();
  });

  it("permite contenido textual cuando el role nunca tuvo imágenes",()=>{
    render(<ProductEditorialMedia role="BENEFITS" media={[]} title="Beneficios" groups={[{items:["Beneficio aprobado"]}]} resetKey="demo"/>);
    expect(screen.getByRole("heading",{name:"Beneficios"})).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getByText("Beneficio aprobado")).toBeInTheDocument();
  });

  it("no muestra assets de otro role ni introduce controles de teclado",()=>{
    const {container}=render(<ProductEditorialMedia role="HERO" media={[asset("USAGE")]} resetKey="demo"/>);
    expect(container).toBeEmptyDOMElement();
    expect(container.querySelectorAll("button,a,input")).toHaveLength(0);
  });
});
