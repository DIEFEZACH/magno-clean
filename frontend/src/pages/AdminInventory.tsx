import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAdminFeedback } from "../components/admin/AdminFeedback";
import { apiFetch } from "../lib/api";
type I = {
  id: string;
  code: string;
  name: string;
  category: string;
  stock: number;
  reservedStock: number;
  availableStock: number;
};
type ImportResult = {
  code: string;
  name?: string;
  status: "ADJUSTED" | "UNCHANGED" | "FAILED";
  previousStock: number;
  newStock: number;
  quantity: number;
  movementId?: string | null;
  error?: string;
};
type ImportReport = {
  valid?: boolean;
  checksum: string;
  summary: { rows: number; adjusted: number; unchanged: number; errors?: number; failed?: number };
  results: ImportResult[];
  errors?: Array<{ line?: number; code?: string; message: string }>;
};
export function AdminInventory() {
  const feedback = useAdminFeedback();
  const [items, setItems] = useState<I[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [inventoryVersion, setInventoryVersion] = useState(0);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [strictCatalog, setStrictCatalog] = useState(true);
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [importAction, setImportAction] = useState<"preview" | "execute" | null>(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      const p = new URLSearchParams({ page: String(page), search: q, filter });
      const r = await apiFetch(`/api/admin/inventory?${p}`);
      const d = await r.json();
      setItems(d.inventory || []);
      setPages(d.pagination?.pages || 1);
    }, 200);
    return () => clearTimeout(t);
  }, [q, filter, page, inventoryVersion]);

  async function importRequest(path: string, execute = false) {
    if (!csvFile) throw new Error("Selecciona un archivo CSV");
    const body = new FormData();
    body.append("file", csvFile);
    body.append("strictCatalog", String(strictCatalog));
    if (execute) {
      body.append("confirm", "true");
      if (preview?.checksum) body.append("checksum", preview.checksum);
    }
    const response = await apiFetch(path, { method: "POST", body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "No se pudo procesar el inventario");
    return data as ImportReport;
  }

  async function validateCsv() {
    setImportAction("preview");
    try {
      const result = await importRequest("/api/admin/inventory/import/preview");
      setPreview(result);
      setReport(null);
      feedback.toast(result.valid ? "success" : "warning", result.valid ? "Archivo validado correctamente" : "El archivo contiene errores");
    } catch (error) {
      setPreview(null);
      feedback.toast("error", error instanceof Error ? error.message : "No se pudo validar el archivo");
    } finally {
      setImportAction(null);
    }
  }

  async function executeCsv() {
    setImportAction("execute");
    try {
      const result = await importRequest("/api/admin/inventory/import", true);
      setReport(result);
      setPreview(null);
      feedback.toast(result.summary.failed ? "warning" : "success", result.summary.failed ? "Importación terminada con fallos" : "Inventario aplicado correctamente");
      setPage(1);
      setQ("");
      setFilter("all");
      setInventoryVersion((version) => version + 1);
    } catch (error) {
      feedback.toast("error", error instanceof Error ? error.message : "No se pudo aplicar el inventario");
    } finally {
      setImportAction(null);
    }
  }

  function downloadReport() {
    if (!report) return;
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = ["code,status,previousStock,newStock,quantity,movementId,error", ...report.results.map((item) => [item.code, item.status, item.previousStock, item.newStock, item.quantity, item.movementId || "", item.error || ""].map(escape).join(","))];
    const blob = new Blob([`\uFEFF${rows.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventario-reporte-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="p-5 lg:p-8">
      <p className="text-sm font-black uppercase tracking-[.25em] text-[#19A2B6]">
        Existencias
      </p>
      <h1 className="mt-2 text-4xl font-black">Inventario</h1>
      <article className="mt-7 rounded-[1.5rem] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-xl font-black">Carga administrativa CSV</h2><p className="mt-1 text-sm text-black/45">Primero valida el archivo; aplicar inventario requiere una confirmación separada.</p></div>
          <label className="flex items-center gap-2 text-sm font-black"><input type="checkbox" checked={strictCatalog} onChange={(event) => { setStrictCatalog(event.target.checked); setPreview(null); setReport(null); }} />Exigir catálogo completo</label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input type="file" accept=".csv,text/csv" disabled={importAction !== null} onChange={(event) => { setCsvFile(event.target.files?.[0] || null); setPreview(null); setReport(null); }} className="min-w-0 flex-1 rounded-2xl border p-3 text-sm font-bold" />
          <button type="button" disabled={!csvFile || importAction !== null} onClick={validateCsv} className="rounded-full bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-40">{importAction === "preview" ? "Validando..." : "Validar archivo"}</button>
          <button type="button" disabled={!preview?.valid || importAction !== null} onClick={() => feedback.confirm({ title: "Aplicar inventario", description: `Se procesarán ${preview?.summary.rows || 0} productos. Cada ajuste quedará auditado y esta acción no modifica precios ni pedidos.`, confirmLabel: "Aplicar inventario", action: executeCsv })} className="rounded-full bg-[#EF8329] px-5 py-3 text-sm font-black text-white disabled:opacity-40">{importAction === "execute" ? "Aplicando..." : "Aplicar inventario"}</button>
        </div>
        {preview && <div className="mt-5 rounded-2xl bg-[#F5F5F5] p-4 text-sm"><p className="font-black">Preview · {preview.valid ? "válido" : "con errores"}</p><p className="mt-2 text-black/55">Ajustes: {preview.summary.adjusted} · Sin cambios: {preview.summary.unchanged} · Errores: {preview.summary.errors || 0}</p>{preview.errors?.length ? <ul className="mt-3 grid gap-1 text-red-600">{preview.errors.slice(0, 12).map((error, index) => <li key={`${error.line}-${error.code}-${index}`}>{error.line ? `Línea ${error.line}: ` : ""}{error.code ? `${error.code}: ` : ""}{error.message}</li>)}</ul> : null}</div>}
        {report && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F5F5F5] p-4 text-sm"><div><p className="font-black">Reporte final</p><p className="mt-1 text-black/55">Ajustados: {report.summary.adjusted} · Sin cambios: {report.summary.unchanged} · Fallidos: {report.summary.failed || 0}</p></div><button type="button" onClick={downloadReport} className="rounded-full bg-[#19A2B6] px-5 py-3 font-black text-white">Descargar reporte</button></div>}
      </article>
      <div className="mt-7 flex gap-3 rounded-[1.5rem] bg-white p-4">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Producto o código"
          className="min-w-0 flex-1 rounded-2xl border px-4 py-3 font-bold"
        />
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-2xl border bg-white px-4 font-bold"
        >
          <option value="all">Todos</option>
          <option value="out">Agotados</option>
          <option value="low">Bajo mínimo</option>
        </select>
      </div>
      <div className="mt-5 overflow-x-auto rounded-[1.5rem] bg-white">
        <table className="w-full min-w-[700px] text-left">
          <thead>
            <tr className="border-b text-xs uppercase text-black/40">
              {[
                "Producto",
                "Físico",
                "Reservado",
                "Disponible",
                "Estado",
                "",
              ].map((x) => (
                <th key={x} className="p-5">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b last:border-0">
                <td className="p-5">
                  <p className="font-black">{i.name}</p>
                  <p className="text-xs font-bold text-black/40">
                    {i.code} · {i.category}
                  </p>
                </td>
                <td className="p-5 font-black">{i.stock}</td>
                <td className="p-5 font-black">{i.reservedStock}</td>
                <td className="p-5 font-black">{i.availableStock}</td>
                <td className="p-5">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${i.availableStock <= 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}
                  >
                    {i.availableStock <= 0 ? "AGOTADO" : "DISPONIBLE"}
                  </span>
                </td>
                <td className="p-5">
                  <Link
                    to={`/admin/products/${i.id}/edit`}
                    className="font-black text-[#19A2B6]"
                  >
                    Ajustar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 flex justify-end gap-3">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="rounded-full bg-white px-5 py-2 font-black disabled:opacity-30"
        >
          Anterior
        </button>
        <span className="py-2 font-black">
          {page}/{pages}
        </span>
        <button
          disabled={page >= pages}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-full bg-white px-5 py-2 font-black disabled:opacity-30"
        >
          Siguiente
        </button>
      </div>
    </section>
  );
}
