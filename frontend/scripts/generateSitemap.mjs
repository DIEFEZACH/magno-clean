import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CatalogUnavailableError,
  createSitemap,
  fetchCatalog,
  readSitemapConfig,
  validateStaleSitemap,
} from "./sitemap.mjs";
import { writeSitemapFiles } from "./writeSitemapFiles.mjs";

export async function generateSitemap({ env = process.env, publicDirectory = new URL("../public/", import.meta.url), fetchImplementation = fetch, logger = console, requestRuntime } = {}) {
  const sitemapFile = new URL("sitemap.xml", publicDirectory);
  const robotsFile = new URL("robots.txt", publicDirectory);
  const config = readSitemapConfig(env);
  let catalog;
  try {
    catalog = await fetchCatalog(config.apiUrl, fetchImplementation, { runtime: requestRuntime, logger });
  } catch (error) {
    // Invalid catalog data must fail the build, even when stale is permitted.
    if (!(error instanceof CatalogUnavailableError) || !config.allowStale) throw error;
    const [xml, robots] = await Promise.all([
      readFile(sitemapFile, "utf8"),
      readFile(robotsFile, "utf8"),
    ]);
    await validateStaleSitemap(xml, robots, config.siteUrl);
    logger.warn("API no disponible; se conservó el sitemap validado porque SITEMAP_ALLOW_STALE=true.");
    return;
  }

  const { xml, robots, counts } = createSitemap(catalog, config.siteUrl);
  await writeSitemapFiles(publicDirectory, { xml, robots });
  logger.log(`Sitemap generado: ${counts.families} familias, ${counts.products} productos individuales, ${counts.categories} categorías, ${counts.urls} URLs.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  generateSitemap().catch((error) => {
    console.error(error instanceof Error ? error.message : "No se pudo generar el sitemap.");
    process.exitCode = 1;
  });
}
