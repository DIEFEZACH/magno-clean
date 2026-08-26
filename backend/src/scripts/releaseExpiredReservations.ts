import { prisma } from "../lib/prisma";
import { releaseExpiredReservations } from "../services/inventory";

async function main() {
  const released = await releaseExpiredReservations(prisma);
  console.log(JSON.stringify({ level: "info", message: "Reservas vencidas liberadas", released }));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ level: "error", message: "No se pudieron liberar reservas", error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
