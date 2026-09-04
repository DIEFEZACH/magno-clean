import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";

// Prepare both complete files before publishing either one. Rename in the same
// directory makes each replacement atomic; this is not a two-file transaction.
export async function writeSitemapFiles(publicDirectory, { xml, robots }, fileSystem = { mkdir, rename, unlink, writeFile }) {
  await fileSystem.mkdir(publicDirectory, { recursive: true });
  const token = randomUUID();
  const files = [["sitemap.xml", xml], ["robots.txt", robots]].map(([name, contents]) => ({
    temporary: new URL(`.${name}.${token}.tmp`, publicDirectory),
    destination: new URL(name, publicDirectory),
    contents,
  }));
  try {
    for (const file of files) {
      await fileSystem.writeFile(file.temporary, file.contents, { encoding: "utf8", flag: "wx" });
    }
    for (const file of files) await fileSystem.rename(file.temporary, file.destination);
  } finally {
    // Only remove our exact temporary paths; never delete a published sitemap.
    await Promise.all(files.map(async (file) => {
      try { await fileSystem.unlink(file.temporary); } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }));
  }
}
