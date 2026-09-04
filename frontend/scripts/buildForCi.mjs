import { spawn } from "node:child_process";
import { createServer } from "node:http";

// CI exercises the real prebuild against a deterministic public catalog, without
// credentials, remote availability, or reuse of versioned localhost artifacts.
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname !== "/api/catalog" || url.searchParams.get("page") !== "1" || url.searchParams.get("pageSize") !== "48") {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({
    items: [
      { type: "FAMILY", id: "ci-family", slug: "familia-ejemplo", category: "Ejemplo", variantCount: 1,
        variants: [{ id: "ci-variant", slug: "variante-ejemplo" }] },
      { type: "PRODUCT", id: "ci-product", slug: "producto-ejemplo", category: "Ejemplo" },
    ],
    pagination: { page: 1, pageSize: 48, total: 2, pages: 1 },
    filters: { categories: ["Ejemplo"], brands: [] },
  }));
});

try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const status = await new Promise((resolve, reject) => {
    const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
      cwd: new URL("../", import.meta.url),
      stdio: "inherit",
      env: { ...process.env, VITE_API_URL: `http://127.0.0.1:${server.address().port}`,
        VITE_SITE_URL: "https://ci.example.invalid", SITEMAP_ALLOW_STALE: "false", SITEMAP_ENVIRONMENT: "production" },
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = status;
} catch {
  console.error("No se pudo ejecutar el build de CI con el catálogo de prueba local.");
  process.exitCode = 1;
} finally {
  await new Promise((resolve) => server.close(resolve));
}
