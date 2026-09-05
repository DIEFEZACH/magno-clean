import { useQuery } from "@tanstack/react-query";
import { API_URL } from "../lib/api";
import type { CatalogItem, CatalogResponse } from "../types/catalog";

// Navigation describes the entire commercial catalog, never just its visible page.
export async function fetchNavigationCatalog(): Promise<CatalogItem[]> {
  const items: CatalogItem[] = [];
  for (let page = 1; ; page += 1) {
    const response = await fetch(`${API_URL}/api/catalog?page=${page}&pageSize=48&sort=name-asc`);
    if (!response.ok) throw new Error("No pudimos cargar la navegación del catálogo.");
    const data = await response.json() as CatalogResponse;
    items.push(...data.items);
    if (page >= data.pagination.pages) break;
    if (page >= 100) throw new Error("El catálogo es demasiado grande para esta navegación.");
  }
  return items;
}

export function useCatalogNavigation() {
  const query = useQuery({ queryKey: ["catalog-navigation"], queryFn: fetchNavigationCatalog, staleTime: 60_000 });
  return { items: query.data ?? [], loading: query.isPending, error: query.isError };
}
