import { createHash } from "node:crypto";
import { AppError } from "../errors/AppError";
import { prisma } from "../lib/prisma";
import { adjustProductInventory } from "./inventory";

export const MAX_INVENTORY_IMPORT_BYTES = 1024 * 1024;
export const INVENTORY_IMPORT_HEADERS = ["code", "newStock", "reason"] as const;

export type InventoryImportRow = {
  line: number;
  code: string;
  newStock: number;
  reason: string;
};

export type InventoryImportError = {
  line?: number;
  code?: string;
  message: string;
};

export type InventoryCatalogProduct = {
  id: string;
  code: string;
  name: string;
  stock: number;
  reservedStock: number;
};

type CsvRecord = { line: number; values: string[] };

function parseCsvRecords(text: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let values: string[] = [];
  let value = "";
  let quoted = false;
  let afterQuote = false;
  let line = 1;
  let recordLine = 1;

  const finishValue = () => {
    values.push(value);
    value = "";
    afterQuote = false;
  };
  const finishRecord = () => {
    finishValue();
    if (values.some((cell) => cell.length > 0)) records.push({ line: recordLine, values });
    values = [];
    recordLine = line + 1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        value += character;
        if (character === "\n") line += 1;
      }
      continue;
    }
    if (afterQuote && character !== "," && character !== "\n" && character !== "\r") {
      throw new AppError(400, `CSV inválido cerca de la línea ${line}`);
    }
    if (character === '"') {
      if (value.length > 0) throw new AppError(400, `CSV inválido cerca de la línea ${line}`);
      quoted = true;
    } else if (character === ",") {
      finishValue();
    } else if (character === "\n") {
      finishRecord();
      line += 1;
    } else if (character === "\r") {
      if (text[index + 1] === "\n") continue;
      finishRecord();
      line += 1;
    } else {
      value += character;
    }
  }
  if (quoted) throw new AppError(400, "CSV inválido: comillas sin cerrar");
  if (value.length > 0 || values.length > 0) finishRecord();
  return records;
}

export function parseInventoryCsv(file: Buffer) {
  if (file.length === 0) throw new AppError(400, "El archivo CSV está vacío");
  if (file.length > MAX_INVENTORY_IMPORT_BYTES) throw new AppError(413, "El CSV supera el tamaño máximo de 1 MB");

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(file);
  } catch {
    throw new AppError(400, "El archivo debe estar codificado en UTF-8");
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records = parseCsvRecords(text);
  const header = records.shift();
  if (!header || header.values.length !== INVENTORY_IMPORT_HEADERS.length ||
      !INVENTORY_IMPORT_HEADERS.every((name, index) => header.values[index] === name)) {
    throw new AppError(400, "Encabezados inválidos; se requiere exactamente: code,newStock,reason");
  }

  const rows: InventoryImportRow[] = [];
  const errors: InventoryImportError[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    if (record.values.length !== 3) {
      errors.push({ line: record.line, message: "La fila debe contener exactamente 3 columnas" });
      continue;
    }
    const code = record.values[0].trim();
    const rawStock = record.values[1].trim();
    const reason = record.values[2].trim();
    if (!code) errors.push({ line: record.line, message: "code es obligatorio" });
    if (code && seen.has(code)) errors.push({ line: record.line, code, message: "Código duplicado" });
    if (code) seen.add(code);
    if (!/^\d+$/.test(rawStock)) {
      errors.push({ line: record.line, code: code || undefined, message: "newStock debe ser un entero mayor o igual a cero" });
    }
    if (reason.length < 3 || reason.length > 500) {
      errors.push({ line: record.line, code: code || undefined, message: "reason debe contener entre 3 y 500 caracteres" });
    }
    if (code && !seenDuplicateAtLine(errors, record.line) && /^\d+$/.test(rawStock) && reason.length >= 3 && reason.length <= 500) {
      rows.push({ line: record.line, code, newStock: Number(rawStock), reason });
    }
  }
  return { rows, errors };
}

function seenDuplicateAtLine(errors: InventoryImportError[], line: number) {
  return errors.some((error) => error.line === line && (error.message === "Código duplicado" || error.message === "code es obligatorio"));
}

export function buildInventoryImportPreview(
  file: Buffer,
  products: InventoryCatalogProduct[],
  strictCatalog: boolean,
) {
  const checksum = createHash("sha256").update(file).digest("hex");
  const parsed = parseInventoryCsv(file);
  const errors = [...parsed.errors];
  const productsByCode = new Map(products.map((product) => [product.code, product]));
  const csvCodes = new Set(parsed.rows.map((row) => row.code));

  for (const row of parsed.rows) {
    if (!productsByCode.has(row.code)) errors.push({ line: row.line, code: row.code, message: "Código inexistente" });
  }
  if (strictCatalog) {
    for (const product of products) {
      if (!csvCodes.has(product.code)) errors.push({ code: product.code, message: "Código faltante en modo estricto" });
    }
  }

  const results = parsed.rows.flatMap((row) => {
    const product = productsByCode.get(row.code);
    if (!product) return [];
    const quantity = row.newStock - product.stock;
    if (row.newStock < product.reservedStock) {
      errors.push({ line: row.line, code: row.code, message: "newStock no puede ser menor que reservedStock" });
    }
    return [{
      line: row.line,
      productId: product.id,
      code: row.code,
      name: product.name,
      reason: row.reason,
      previousStock: product.stock,
      reservedStock: product.reservedStock,
      newStock: row.newStock,
      quantity,
      status: quantity === 0 ? "UNCHANGED" as const : "ADJUSTED" as const,
    }];
  });

  return {
    valid: errors.length === 0,
    strictCatalog,
    checksum,
    summary: {
      rows: parsed.rows.length,
      adjusted: results.filter((result) => result.status === "ADJUSTED").length,
      unchanged: results.filter((result) => result.status === "UNCHANGED").length,
      errors: errors.length,
    },
    results,
    errors,
  };
}

export async function previewInventoryImport(file: Buffer, strictCatalog: boolean) {
  const { rows } = parseInventoryCsv(file);
  const codes = [...new Set(rows.map((row) => row.code))];
  const products = await prisma.product.findMany({
    where: strictCatalog ? undefined : { code: { in: codes } },
    select: { id: true, code: true, name: true, stock: true, reservedStock: true },
  });
  return buildInventoryImportPreview(file, products, strictCatalog);
}

export async function executeInventoryImport(
  file: Buffer,
  strictCatalog: boolean,
  createdById: string,
) {
  const preview = await previewInventoryImport(file, strictCatalog);
  if (!preview.valid) throw new AppError(400, "El CSV contiene errores", preview);

  return executeInventoryPreview(preview, createdById);
}

type InventoryAdjuster = typeof adjustProductInventory;

export async function executeInventoryPreview(
  preview: Awaited<ReturnType<typeof previewInventoryImport>>,
  createdById: string,
  adjuster: InventoryAdjuster = adjustProductInventory,
) {

  const results = [];
  for (const item of preview.results) {
    try {
      const adjusted = await adjuster({
        productId: item.productId,
        newStock: item.newStock,
        reason: item.reason,
        createdById,
      });
      results.push({
        code: item.code,
        status: adjusted.changed ? "ADJUSTED" as const : "UNCHANGED" as const,
        previousStock: adjusted.previousStock,
        newStock: adjusted.product.stock,
        quantity: adjusted.product.stock - adjusted.previousStock,
        movementId: adjusted.movement?.id || null,
      });
    } catch (error) {
      results.push({
        code: item.code,
        status: "FAILED" as const,
        previousStock: item.previousStock,
        newStock: item.newStock,
        quantity: item.quantity,
        movementId: null,
        error: error instanceof AppError ? error.message : "Error inesperado durante el ajuste",
      });
    }
  }

  return {
    checksum: preview.checksum,
    strictCatalog: preview.strictCatalog,
    summary: {
      rows: results.length,
      adjusted: results.filter((result) => result.status === "ADJUSTED").length,
      unchanged: results.filter((result) => result.status === "UNCHANGED").length,
      failed: results.filter((result) => result.status === "FAILED").length,
    },
    results,
  };
}
