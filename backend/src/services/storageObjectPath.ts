import { AppError } from "../errors/AppError";

export function assertSafeStoragePath(storagePath: string) {
  if (storagePath.length > 512 || storagePath.startsWith("/") || storagePath.endsWith("/")) {
    throw new AppError(400, "Ruta de Storage inválida");
  }
  const segments = storagePath.split("/");
  if (segments.length < 2 || segments.some((segment) => !/^[a-z0-9][a-z0-9._-]*$/.test(segment) || segment === "." || segment === "..")) {
    throw new AppError(400, "Ruta de Storage inválida");
  }
  if (!storagePath.endsWith(".webp")) throw new AppError(400, "El medio debe ser un archivo WebP");
}
