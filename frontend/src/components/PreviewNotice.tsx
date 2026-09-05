export function PreviewNotice() {
  if (import.meta.env.VITE_DEMO_PREVIEW !== "true") return null;
  return (
    <aside aria-label="Entorno de prueba" className="border-b border-[#d2e7e9] bg-[#eaf6f7] px-3 py-2 text-center text-[11px] font-semibold leading-relaxed text-[#21515a] sm:text-xs">
      <strong className="font-extrabold">MAGNO CLEAN · VERSIÓN DE PRUEBA</strong>
      <span className="mx-2" aria-hidden="true">/</span>
      Catálogo de staging. No realizar compras ni modificar datos durante la presentación.
    </aside>
  );
}
