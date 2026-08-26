import "dotenv/config";
import { prisma } from "./lib/prisma";

async function main() {
  await prisma.product.createMany({
    data: [
      {
        id: "prod-001",
        slug: "magno-pro-cyclone-x1",
        code: "MAGNO-PRO-CYCLONE-X1",
        name: "Magno Pro Cyclone X1",
        category: "Aspiradora premium",
        description:
          "Aspiradora de alto rendimiento para limpieza residencial y comercial.",
        price: 4999,
        oldPrice: 6299,
        badge: "Nuevo",
      },
      {
        id: "prod-002",
        slug: "magno-hydroforce-2200",
        code: "MAGNO-HYDROFORCE-2200",
        name: "Magno HydroForce 2200",
        category: "Hidrolavadora",
        description:
          "Potencia exterior para limpieza profunda en patios, autos y negocios.",
        price: 6299,
        oldPrice: 7499,
        badge: "Top ventas",
      },
      {
        id: "prod-003",
        slug: "magno-bot-clean-ai",
        code: "MAGNO-BOT-CLEAN-AI",
        name: "Magno Bot Clean AI",
        category: "Robot aspirador",
        description:
          "Robot inteligente para automatizar la limpieza diaria del hogar.",
        price: 7899,
        oldPrice: 8999,
        badge: "Smart",
      },
    ],
    skipDuplicates: true,
  });

  console.log("Productos creados correctamente");
}

main()
  .catch((error) => {
    console.error(error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
