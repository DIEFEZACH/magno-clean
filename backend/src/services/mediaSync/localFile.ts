import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { FlattenedManifestEntry, ValidatedLocalMedia } from "./types";

export const MEDIA_SYNC_MAX_BYTES = 10 * 1024 * 1024;

export class LocalMediaValidationError extends Error {
  constructor(
    readonly kind: "INVALID_LOCAL_FILE" | "HASH_MISMATCH" | "DIMENSION_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "LocalMediaValidationError";
  }
}

function normalizedLogicalPath(value: string, field: string) {
  if (!value || value.includes("\0") || value.includes("\\") || path.posix.isAbsolute(value)) {
    throw new LocalMediaValidationError("INVALID_LOCAL_FILE", `${field} no es una ruta lógica segura`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new LocalMediaValidationError("INVALID_LOCAL_FILE", `${field} contiene segmentos peligrosos`);
  }
  return segments.join("/");
}

function isWithin(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

export function resolveContainedLocalPath(sourceRoot: string, optimizationRoot: string, optimizedPath: string) {
  const declaredRoot = normalizedLogicalPath(optimizationRoot, "optimization.outputRoot").replace(/\/$/, "");
  const declaredPath = normalizedLogicalPath(optimizedPath, "optimizedPath");
  const prefix = `${declaredRoot}/`;
  if (!declaredPath.startsWith(prefix)) {
    throw new LocalMediaValidationError("INVALID_LOCAL_FILE", "optimizedPath no pertenece al outputRoot declarado");
  }
  const relativePath = declaredPath.slice(prefix.length);
  normalizedLogicalPath(relativePath, "optimizedPath relativo");

  let canonicalRoot: string;
  try {
    canonicalRoot = realpathSync(sourceRoot);
  } catch {
    throw new LocalMediaValidationError("INVALID_LOCAL_FILE", "El source root no existe");
  }
  const candidate = path.resolve(canonicalRoot, ...relativePath.split("/"));
  if (!isWithin(canonicalRoot, candidate)) {
    throw new LocalMediaValidationError("INVALID_LOCAL_FILE", "La ruta local escapa del source root");
  }

  try {
    if (lstatSync(candidate).isSymbolicLink()) {
      throw new LocalMediaValidationError("INVALID_LOCAL_FILE", "No se permiten archivos simbólicos");
    }
    const canonicalCandidate = realpathSync(candidate);
    if (!isWithin(canonicalRoot, canonicalCandidate)) {
      throw new LocalMediaValidationError("INVALID_LOCAL_FILE", "La ruta real escapa del source root");
    }
    return canonicalCandidate;
  } catch (error) {
    if (error instanceof LocalMediaValidationError) throw error;
    throw new LocalMediaValidationError("INVALID_LOCAL_FILE", "El archivo optimizado no existe");
  }
}

export function readWebpDimensions(buffer: Buffer) {
  if (buffer.length < 20 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    throw new LocalMediaValidationError("INVALID_LOCAL_FILE", "El archivo no contiene un WebP real");
  }
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > buffer.length) break;
    if (chunkType === "VP8X" && chunkSize >= 10) {
      return {
        width: 1 + buffer.readUIntLE(dataOffset + 4, 3),
        height: 1 + buffer.readUIntLE(dataOffset + 7, 3),
      };
    }
    if (
      chunkType === "VP8 " &&
      chunkSize >= 10 &&
      buffer[dataOffset + 3] === 0x9d &&
      buffer[dataOffset + 4] === 0x01 &&
      buffer[dataOffset + 5] === 0x2a
    ) {
      return {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }
    if (chunkType === "VP8L" && chunkSize >= 5 && buffer[dataOffset] === 0x2f) {
      const bits = buffer.readUInt32LE(dataOffset + 1);
      return {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >>> 14) & 0x3fff),
      };
    }
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }
  throw new LocalMediaValidationError("INVALID_LOCAL_FILE", "No fue posible leer las dimensiones del WebP");
}

function securelyReadRegularFile(filePath: string) {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (!before.isFile()) throw new LocalMediaValidationError("INVALID_LOCAL_FILE", "La ruta no es un archivo regular");
    if (before.size <= 0 || before.size > MEDIA_SYNC_MAX_BYTES) {
      throw new LocalMediaValidationError("INVALID_LOCAL_FILE", "El tamaño local está fuera del límite permitido");
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      bytes.length !== after.size
    ) {
      throw new LocalMediaValidationError("INVALID_LOCAL_FILE", "El archivo cambió durante la validación");
    }
    return bytes;
  } catch (error) {
    if (error instanceof LocalMediaValidationError) throw error;
    throw new LocalMediaValidationError("INVALID_LOCAL_FILE", "No fue posible leer el archivo optimizado");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function inspectLocalMedia(
  entry: FlattenedManifestEntry,
  sourceRoot: string,
  optimizationRoot: string,
): ValidatedLocalMedia {
  if (!entry.optimizedPath || !entry.optimizedSha256 || !entry.storagePath) {
    throw new LocalMediaValidationError("INVALID_LOCAL_FILE", "Faltan campos del derivado optimizado");
  }
  const filePath = resolveContainedLocalPath(sourceRoot, optimizationRoot, entry.optimizedPath);
  const bytes = securelyReadRegularFile(filePath);
  if (!bytes.length || bytes.length > MEDIA_SYNC_MAX_BYTES) {
    throw new LocalMediaValidationError("INVALID_LOCAL_FILE", "El tamaño local está fuera del límite permitido");
  }
  if (bytes.length !== entry.bytes) {
    throw new LocalMediaValidationError("INVALID_LOCAL_FILE", "El tamaño local no coincide con el manifest");
  }
  if (entry.mimeType !== "image/webp" || path.posix.extname(entry.storagePath).toLowerCase() !== ".webp") {
    throw new LocalMediaValidationError("INVALID_LOCAL_FILE", "El manifest no declara image/webp de forma consistente");
  }
  const dimensions = readWebpDimensions(bytes);
  if (dimensions.width !== entry.width || dimensions.height !== entry.height) {
    throw new LocalMediaValidationError("DIMENSION_MISMATCH", "Las dimensiones locales no coinciden con el manifest");
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== entry.optimizedSha256) {
    throw new LocalMediaValidationError("HASH_MISMATCH", "El SHA-256 local no coincide con el manifest");
  }
  return { path: filePath, bytes, sha256, ...dimensions, mimeType: "image/webp" };
}
