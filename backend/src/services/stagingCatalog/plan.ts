import { validateCatalogProduct } from "./snapshot";
import { CATALOG_PLAN_STATUSES, PRODUCT_FIELDS, type CatalogPlan, type CatalogPlanEntry, type CatalogProduct } from "./types";

type ParsedRow = { product?: CatalogProduct; index: number; rawCode?: string };

function parseRows(rows: CatalogProduct[]): ParsedRow[] {
  return rows.map((row, index) => {
    const rawCode = row && typeof row.code === "string" ? row.code : undefined;
    try {
      return { product: validateCatalogProduct(row), index, rawCode };
    } catch {
      return { index, rawCode };
    }
  });
}

function countCodes(rows: ParsedRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) if (row.rawCode !== undefined) counts.set(row.rawCode, (counts.get(row.rawCode) ?? 0) + 1);
  return counts;
}

export function buildCatalogPlan(snapshotProducts: CatalogProduct[], stagingProducts: CatalogProduct[]): CatalogPlan {
  if (!Array.isArray(snapshotProducts) || !Array.isArray(stagingProducts)) throw new Error("El plan requiere dos listas Product.");
  const snapshot = parseRows(snapshotProducts);
  const staging = parseRows(stagingProducts);
  const sourceCounts = countCodes(snapshot);
  const stagingCounts = countCodes(staging);
  const entries: CatalogPlanEntry[] = [];

  for (const row of snapshot) {
    const product = row.product;
    if (!product) {
      entries.push({ code: `[snapshot row ${row.index + 1}]`, status: "INVALID", reason: "Fila del snapshot inválida; valores omitidos." });
      continue;
    }
    if ((sourceCounts.get(product.code) ?? 0) > 1 || (stagingCounts.get(product.code) ?? 0) > 1) {
      entries.push({ code: product.code, status: "CONFLICT_CODE", reason: "El código no es único en snapshot o staging." });
      continue;
    }
    const existing = staging.find((other) => other.rawCode === product.code);
    const current = existing?.product;
    if (existing && !current) {
      entries.push({ code: product.code, status: "INVALID", reason: "El registro correspondiente en staging no satisface el contrato permitido." });
      continue;
    }
    const sourceSlugConflict = snapshot.some((other) => other.index !== row.index && other.product?.slug === product.slug);
    const stagingSlugConflict = staging.some((other) => other.product?.slug === product.slug && other.product.code !== product.code);
    if (sourceSlugConflict || stagingSlugConflict) {
      entries.push({ code: product.code, status: "CONFLICT_SLUG", reason: "El slug pertenece a otro registro; no se reasigna automáticamente." });
      continue;
    }
    if (!current) {
      entries.push({ code: product.code, status: "CREATE" });
      continue;
    }
    const changedFields = PRODUCT_FIELDS.filter((field): field is Exclude<typeof field, "code"> => field !== "code")
      .filter((field) => product[field] !== current[field]);
    entries.push(changedFields.length
      ? { code: product.code, status: "UPDATE", changedFields }
      : { code: product.code, status: "UNCHANGED" });
  }

  for (const row of staging) {
    if (row.rawCode !== undefined && sourceCounts.has(row.rawCode)) continue;
    if (!row.product) {
      entries.push({ code: `[staging row ${row.index + 1}]`, status: "INVALID", reason: "Fila de staging inválida; valores omitidos." });
    } else if ((stagingCounts.get(row.product.code) ?? 0) > 1) {
      entries.push({ code: row.product.code, status: "CONFLICT_CODE", reason: "Código duplicado en staging fuera del snapshot." });
    } else {
      entries.push({ code: row.product.code, status: "EXTRA_IN_STAGING", reason: "Producto ajeno al snapshot; requiere decisión humana y no se elimina." });
    }
  }

  const summary: CatalogPlan["summary"] = {
    snapshotTotal: snapshot.length, stagingTotal: staging.length,
    ...Object.fromEntries(CATALOG_PLAN_STATUSES.map((status) => [status, 0])) as Record<typeof CATALOG_PLAN_STATUSES[number], number>,
    active: snapshot.filter((row) => row.product?.active === true).length,
    inactive: snapshot.filter((row) => row.product?.active === false).length,
    imageUrlsPresent: snapshot.filter((row) => row.product?.imageUrl !== null && row.product?.imageUrl !== undefined).length,
  };
  for (const entry of entries) summary[entry.status] += 1;
  return {
    entries, summary,
    canExecute: summary.CONFLICT_CODE === 0 && summary.CONFLICT_SLUG === 0 && summary.INVALID === 0 && summary.EXTRA_IN_STAGING === 0,
  };
}
