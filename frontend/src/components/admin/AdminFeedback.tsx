/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

type ToastKind = "success" | "error" | "warning" | "info";
type Toast = { id: number; kind: ToastKind; message: string };
type ConfirmOptions = { title: string; description: string; confirmLabel?: string; destructive?: boolean; action: () => void | Promise<void> };

const FeedbackContext = createContext<{
  toast: (kind: ToastKind, message: string) => void;
  confirm: (options: ConfirmOptions) => void;
} | null>(null);

export function AdminFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmOptions | null>(null);
  const [confirming, setConfirming] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const toast = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4500);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    returnFocus.current = document.activeElement as HTMLElement;
    setConfirmation(options);
  }, []);

  const closeConfirm = useCallback(() => {
    if (confirming) return;
    setConfirmation(null);
    window.setTimeout(() => returnFocus.current?.focus(), 0);
  }, [confirming]);

  useEffect(() => {
    if (!confirmation) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeConfirm(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmation, closeConfirm]);

  const icons = { success: CheckCircle2, error: AlertCircle, warning: TriangleAlert, info: Info };
  const colors = { success: "border-emerald-200 text-emerald-700", error: "border-red-200 text-red-700", warning: "border-amber-200 text-amber-700", info: "border-sky-200 text-sky-700" };

  return <FeedbackContext.Provider value={{ toast, confirm }}>
    {children}
    <div className="fixed right-4 top-4 z-[100] grid w-[min(92vw,380px)] gap-3" aria-live="polite" aria-atomic="false">
      {toasts.map((item) => { const Icon = icons[item.kind]; return <div key={item.id} role={item.kind === "error" ? "alert" : "status"} className={`flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-xl ${colors[item.kind]}`}><Icon size={20} className="mt-0.5 shrink-0"/><p className="flex-1 text-sm font-bold text-[#111]">{item.message}</p><button type="button" aria-label="Cerrar notificación" onClick={() => setToasts((current) => current.filter((toastItem) => toastItem.id !== item.id))}><X size={18}/></button></div>; })}
    </div>
    {confirmation && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={(event) => { if (event.target === event.currentTarget) closeConfirm(); }}>
      <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
        <h2 id="confirm-title" className="text-2xl font-black">{confirmation.title}</h2>
        <p className="mt-3 leading-7 text-black/55">{confirmation.description}</p>
        <div className="mt-7 flex justify-end gap-3"><button ref={cancelRef} type="button" disabled={confirming} onClick={closeConfirm} className="rounded-full bg-black/5 px-5 py-3 font-black disabled:opacity-50">Cancelar</button><button type="button" disabled={confirming} onClick={async () => { setConfirming(true); try { await confirmation.action(); setConfirmation(null); window.setTimeout(() => returnFocus.current?.focus(), 0); } finally { setConfirming(false); } }} className={`rounded-full px-5 py-3 font-black text-white disabled:opacity-50 ${confirmation.destructive ? "bg-red-500" : "bg-[#19A2B6]"}`}>{confirming ? "Procesando..." : confirmation.confirmLabel || "Confirmar"}</button></div>
      </div>
    </div>}
  </FeedbackContext.Provider>;
}

export function useAdminFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error("useAdminFeedback requiere AdminFeedbackProvider");
  return context;
}
