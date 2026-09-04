import fs from "node:fs";
import path from "node:path";

export const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;

export function timestampName(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, "").replace(/\./g, "");
}

export function ensurePrivateDirectory(directory: string, cwd = process.cwd()) {
  const allowedRoot = path.resolve(cwd, "../.local/staging-baseline");
  const target = path.resolve(directory);
  if (target !== allowedRoot && !target.startsWith(allowedRoot + path.sep)) {
    throw new Error("REPORT_DIRECTORY_MUST_BE_LOCAL_IGNORED");
  }
  let cursor = path.parse(target).root;
  for (const part of target.slice(cursor.length).split(path.sep)) {
    cursor = path.join(cursor, part);
    if (fs.existsSync(cursor)) {
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("UNSAFE_REPORT_DIRECTORY");
    } else {
      fs.mkdirSync(cursor, { mode: 0o700 });
    }
  }
  fs.chmodSync(target, 0o700);
  return target;
}

export function writePrivateFile(file: string, content: string) {
  const descriptor = fs.openSync(file, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, content, { encoding: "utf8" });
    fs.fchmodSync(descriptor, 0o600);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function readPrivateSnapshot(file: string) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size <= 0 || stat.size > MAX_SNAPSHOT_BYTES) {
    throw new Error("INVALID_SNAPSHOT_FILE");
  }
  if ((stat.mode & 0o077) !== 0) throw new Error("SNAPSHOT_REQUIRES_PRIVATE_PERMISSIONS");
  return fs.readFileSync(file);
}

export function readChecksumFile(file: string, snapshotFile: string) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024) throw new Error("INVALID_CHECKSUM_FILE");
  const match = fs.readFileSync(file, "utf8").trim().match(/^([a-f0-9]{64})(?:  ([^\r\n]+))?$/);
  if (!match || (match[2] && match[2] !== path.basename(snapshotFile))) throw new Error("INVALID_CHECKSUM_FILE");
  return match[1];
}
