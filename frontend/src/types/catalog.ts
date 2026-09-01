export type CatalogImage = { id: string; url: string; alt: string | null; position: number };
export type CatalogVariant = { id: string; slug: string; code: string; label: string; sortOrder: number; price: number; oldPrice: number | null; imageUrl: string | null; available: boolean; availableStock: number };
export type CatalogFamily = { type: "FAMILY"; id: string; slug: string; name: string; brand: string; category: string; shortDescription: string; imageUrl: string | null; badge: string | null; featured: boolean; variantType: string; variantCount: number; priceFrom: number; available: boolean; availableStock: number; displayMode: "FAMILY" | "PRODUCT_LIKE"; variants: CatalogVariant[] };
export type CatalogProduct = { type: "PRODUCT"; id: string; slug: string; code: string; brand: string; name: string; category: string; description: string; imageUrl: string | null; images: CatalogImage[]; price: number; oldPrice: number | null; badge: string | null; featured: boolean; available: boolean; availableStock: number };
export type CatalogItem = CatalogFamily | CatalogProduct;
export type CatalogSort = "featured" | "name-asc" | "name-desc" | "price-asc" | "price-desc" | "newest" | "oldest";
export type CatalogResponse = { items: CatalogItem[]; pagination: { page: number; pageSize: number; total: number; pages: number }; filters: { categories: string[]; brands: string[] } };
