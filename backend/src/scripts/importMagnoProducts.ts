import "dotenv/config";
import fs from "fs";
import path from "path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

type MagnoSourceProduct = {
  brand?: unknown;
  code?: unknown;
  product?: unknown;
  category?: unknown;
  description?: unknown;
  image?: unknown;
  price?: unknown;
  unitPrice?: unknown;
  mayoreo?: unknown;
  mostrador?: unknown;
  digital?: unknown;
};

type ImportSummary = {
  imported: number;
  updated: number;
  errors: number;
};

export function generateProductSlug(product: string, description: string) {
  return `${product} ${description}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function loadSourceProducts(filePath: string) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const source = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as unknown;

  if (!Array.isArray(source)) {
    throw new Error("El catálogo maestro debe ser un arreglo JSON");
  }

  return source as MagnoSourceProduct[];
}

function validateUniqueCodes(records: MagnoSourceProduct[]) {
  const codes = records.map((record, index) =>
    requiredText(record.code, `code de la fila ${index + 1}`),
  );
  const duplicates = [...new Set(codes.filter((code, index) => codes.indexOf(code) !== index))];

  if (duplicates.length > 0) {
    throw new Error(`El catálogo contiene códigos duplicados: ${duplicates.join(", ")}`);
  }

  console.log(`Registros validados: ${records.length}`);
  console.log(`Códigos únicos: ${codes.length}`);
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} es obligatorio`);
  }

  return value.trim();
}

function optionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, field: string, required = false) {
  if ((value === undefined || value === null || value === "") && !required) {
    return 0;
  }

  const parsed = typeof value === "number"
    ? value
    : Number(String(value).replace(/[$,\s]/g, ""));

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${field} debe ser un número válido`);
  }

  return parsed;
}

function imageUrl(value: unknown) {
  const image = requiredText(value, "image");

  try {
    const url = new URL(image);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw new Error("image debe ser una URL HTTP o HTTPS válida");
  }
}

function mapProduct(record: MagnoSourceProduct): Prisma.ProductCreateInput {
  const code = requiredText(record.code, "code");
  const name = requiredText(record.product, "product");
  const description = optionalText(record.description);
  const digitalPrice = numberValue(record.digital, "digital", true);

  return {
    code,
    slug: generateProductSlug(name, description),
    brand: optionalText(record.brand) || "Magno Clean",
    name,
    category: optionalText(record.category) || "Sin categoría",
    description,
    imageUrl: imageUrl(record.image),
    costPrice: numberValue(record.price, "price"),
    unitPrice: numberValue(record.unitPrice, "unitPrice"),
    wholesalePrice: numberValue(record.mayoreo, "mayoreo"),
    retailPrice: numberValue(record.mostrador, "mostrador"),
    digitalPrice,
    price: digitalPrice,
    oldPrice: numberValue(record.mostrador, "mostrador"),
    featured: false,
    active: true,
  };
}

async function importProducts(records: MagnoSourceProduct[]) {
  const summary: ImportSummary = { imported: 0, updated: 0, errors: 0 };

  for (const [index, record] of records.entries()) {
    try {
      const data = mapProduct(record);
      const existing = await prisma.product.findUnique({
        where: { code: data.code },
        select: { id: true },
      });

      await prisma.product.upsert({
        where: { code: data.code },
        create: data,
        update: data,
      });

      if (existing) summary.updated += 1;
      else summary.imported += 1;
    } catch (error) {
      summary.errors += 1;
      const code = optionalText(record.code) || `fila ${index + 1}`;
      const message = error instanceof Error ? error.message : "Error desconocido";
      console.error(`[${code}] ${message}`);
    }
  }

  return summary;
}

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) throw new Error("Falta la ruta del catálogo maestro");

  const sourceProducts = loadSourceProducts(sourcePath);
  validateUniqueCodes(sourceProducts);
  const summary = await importProducts(sourceProducts);

  console.log(`Importados: ${summary.imported}`);
  console.log(`Actualizados: ${summary.updated}`);
  console.log(`Errores: ${summary.errors}`);
}

main()
  .catch((error) => {
    console.error("No fue posible ejecutar el importador:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
