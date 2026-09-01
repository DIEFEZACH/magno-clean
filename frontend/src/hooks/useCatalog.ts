import { useQuery } from "@tanstack/react-query";
import { API_URL } from "../lib/api";
import type { CatalogResponse, CatalogSort } from "../types/catalog";

export type CatalogParams = { page?: number; pageSize?: number; search?: string; category?: string; brand?: string; featured?: boolean; sort?: CatalogSort };

async function fetchCatalog(params: CatalogParams): Promise<CatalogResponse> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") searchParams.set(key, String(value)); });
  const response = await fetch(`${API_URL}/api/catalog?${searchParams.toString()}`);
  if (!response.ok) throw new Error("No fue posible cargar el catálogo");
  return response.json() as Promise<CatalogResponse>;
}

export function useCatalog(params: CatalogParams = {}) {
  const normalized = { page: 1, pageSize: 24, sort: "featured" as CatalogSort, ...params };
  const query = useQuery({ queryKey: ["catalog", normalized], queryFn: () => fetchCatalog(normalized) });
  return { items: query.data?.items ?? [], pagination: query.data?.pagination ?? { page: normalized.page, pageSize: normalized.pageSize, total: 0, pages: 0 }, filters: query.data?.filters ?? { categories: [], brands: [] }, loading: query.isPending, error: query.error instanceof Error ? query.error.message : null, refetch: query.refetch };
}
