import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";

async function main() {
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email: env.ADMIN_EMAIL.toLowerCase() },
    create: {
      name: env.ADMIN_NAME,
      email: env.ADMIN_EMAIL.toLowerCase(),
      passwordHash,
      role: Role.ADMIN,
      active: true,
    },
    update: {
      name: env.ADMIN_NAME,
      passwordHash,
      role: Role.ADMIN,
      active: true,
    },
  });
  console.log(JSON.stringify({ message: "Administrador configurado", id: user.id, email: user.email }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
