import type { PublicWebsiteContentMedia, PublicWebsiteContentMediaRole } from "../types/catalog";

export const editorialMediaRoleOrder: PublicWebsiteContentMediaRole[] = ["HERO", "BENEFITS", "USAGE", "SAFETY", "INFOGRAPHIC"];

export function mediaForRole(media:PublicWebsiteContentMedia[],role:PublicWebsiteContentMediaRole){
  return media.filter((item)=>item.role===role).sort((left,right)=>left.position-right.position);
}

export function firstEditorialHero(media:PublicWebsiteContentMedia[]){
  return mediaForRole(media,"HERO")[0]??null;
}
