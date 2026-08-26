import { useQuery } from "@tanstack/react-query";
import { API_URL } from "../lib/api";

export type Product = {
  id: string;
  slug: string;
  code: string;
  brand: string;
  name: string;
  category: string;
  description: string;
  imageUrl?: string | null;
  unitPrice: number;
  wholesalePrice: number;
  retailPrice: number;
  digitalPrice: number;
  price: number;
  oldPrice?: number | null;
  badge?: string | null;
  featured: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  availableStock: number;
  images?: Array<{ id: string; url: string; alt?: string | null; position: number }>;
};

async function fetchProducts(): Promise<Product[]> {
  const response = await fetch(`${API_URL}/api/products`);
  if (!response.ok) throw new Error("No fue posible cargar los productos");

  const data = await response.json();
  if (!Array.isArray(data.products)) {
    throw new Error("La API devolvió un catálogo inválido");
  }

  return data.products;
}

export function useProducts() {
  const query = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
  });

  return {
    products: (query.data || []).filter((product) => product.active),
    loading: query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}
