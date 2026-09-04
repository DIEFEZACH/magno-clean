export const PRODUCT_FIELDS = [
  "slug", "code", "brand", "name", "category", "description", "imageUrl", "badge",
  "price", "oldPrice", "digitalPrice", "retailPrice", "featured", "active",
] as const;

export type CatalogProductField = (typeof PRODUCT_FIELDS)[number];

// This is also the production SELECT allowlist. No IDs, inventory or relations.
export const PRODUCT_SELECT = {
  slug: true, code: true, brand: true, name: true, category: true, description: true,
  imageUrl: true, badge: true, price: true, oldPrice: true, digitalPrice: true,
  retailPrice: true, featured: true, active: true,
} as const;

export type CatalogProduct = {
  slug: string;
  code: string;
  brand: string;
  name: string;
  category: string;
  description: string;
  imageUrl: string | null;
  badge: string | null;
  price: number;
  oldPrice: number | null;
  digitalPrice: number;
  retailPrice: number;
  featured: boolean;
  active: boolean;
};

export type CatalogSnapshot = {
  schemaVersion: 1;
  exportedAt: string;
  source: { environment: "production"; projectRef: "fxbgxjpgfkeuapbmgpmv" };
  products: CatalogProduct[];
};

export type CatalogExpectations = { count?: number; active?: number; inactive?: number };

export const CATALOG_PLAN_STATUSES = [
  "CREATE", "UPDATE", "UNCHANGED", "CONFLICT_CODE", "CONFLICT_SLUG", "INVALID", "EXTRA_IN_STAGING",
] as const;

export type CatalogPlanStatus = (typeof CATALOG_PLAN_STATUSES)[number];
export type CatalogPlanEntry = {
  code: string;
  status: CatalogPlanStatus;
  changedFields?: Exclude<CatalogProductField, "code">[];
  reason?: string;
};

export type CatalogPlan = {
  entries: CatalogPlanEntry[];
  summary: Record<CatalogPlanStatus, number> & {
    snapshotTotal: number;
    stagingTotal: number;
    active: number;
    inactive: number;
    imageUrlsPresent: number;
  };
  canExecute: boolean;
};
