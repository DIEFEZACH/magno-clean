import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { writeSitemapFiles } from "./writeSitemapFiles.mjs";

for (const failure of [null, "second temporary write", "first rename"]) {
  test(`atomic replacement: ${failure || "success"}`, async (context) => {
    const directory = await fs.mkdtemp(join(tmpdir(), "magno-sitemap-atomic-"));
    context.after(() => fs.rm(directory, { recursive: true, force: true }));
    const publicDirectory = pathToFileURL(`${directory}/`);
    const sitemap = new URL("sitemap.xml", publicDirectory);
    const robots = new URL("robots.txt", publicDirectory);
    await fs.writeFile(sitemap, "previous complete XML");
    await fs.writeFile(robots, "previous robots");
    const operations = [];
    const fileSystem = { ...fs,
      writeFile: async (temporary, contents, options) => {
        assert.ok(temporary.pathname.endsWith(".tmp"));
        assert.equal(options.flag, "wx");
        assert.equal(await fs.readFile(sitemap, "utf8"), "previous complete XML");
        assert.equal(await fs.readFile(robots, "utf8"), "previous robots");
        operations.push("write");
        if (failure === "second temporary write" && operations.length === 2) {
          await fs.writeFile(temporary, "partial temporary file", options);
          throw new Error("disk full");
        }
        await fs.writeFile(temporary, contents, options);
      },
      rename: async (temporary, destination) => {
        assert.equal(operations.slice(0, 2).join(","), "write,write");
        assert.equal(new URL(".", temporary).href, publicDirectory.href);
        operations.push("rename");
        if (failure === "first rename") throw new Error("rename failed");
        await fs.rename(temporary, destination);
      },
    };
    const promise = writeSitemapFiles(publicDirectory, { xml: "new complete XML", robots: "new robots" }, fileSystem);
    if (failure) await assert.rejects(promise);
    else await promise;
    assert.equal(await fs.readFile(sitemap, "utf8"), failure ? "previous complete XML" : "new complete XML");
    assert.equal(await fs.readFile(robots, "utf8"), failure ? "previous robots" : "new robots");
    assert.deepEqual((await fs.readdir(directory)).sort(), ["robots.txt", "sitemap.xml"]);
    if (!failure) assert.deepEqual(operations, ["write", "write", "rename", "rename"]);
  });
}
