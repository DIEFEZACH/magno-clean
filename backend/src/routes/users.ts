import { Router } from "express";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateBody } from "../middleware/validate";
import { createUserSchema } from "../schemas/auth";
import { publicUser } from "../services/auth";

export const usersRouter = Router();
usersRouter.use(authenticate, authorize(Role.ADMIN));

usersRouter.get("/", asyncHandler(async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ users: users.map(publicUser) });
}));

usersRouter.post("/", validateBody(createUserSchema), asyncHandler(async (req, res) => {
  const { password, ...data } = req.body;
  const user = await prisma.user.create({ data: { ...data, passwordHash: await bcrypt.hash(password, 12) } });
  res.status(201).json({ message: "Usuario creado correctamente", user: publicUser(user) });
}));
