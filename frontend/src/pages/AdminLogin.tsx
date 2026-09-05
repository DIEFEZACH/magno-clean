import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useAdminFeedback } from "../components/admin/AdminFeedback";

export function AdminLogin() {
  const feedback = useAdminFeedback();
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);
  const logoutUnconfirmed = useAuthStore((state) => state.logoutUnconfirmed);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [retryingLogout, setRetryingLogout] = useState(false);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || logoutUnconfirmed) return;
    setSubmitting(true);
    const success = await login(email, password);
    setSubmitting(false);

    if (!success) {
      feedback.toast("error", useAuthStore.getState().lastError || "No fue posible iniciar sesión. Intenta nuevamente.");
      return;
    }

    navigate("/admin");
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-[#F5F5F5] px-4 py-10 sm:px-5 sm:py-20">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md rounded-[1.5rem] bg-white p-5 shadow-sm sm:rounded-[2rem] sm:p-8"
      >
        <p className="mb-3 text-sm font-black uppercase tracking-[0.25em] text-[#19A2B6]">
          Admin
        </p>

        <h1 className="text-3xl font-black tracking-[-0.05em] sm:text-4xl">
          Iniciar sesión
        </h1>

        {logoutUnconfirmed && <div role="alert" className="mt-6 min-w-0 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <h2 className="font-black">Cierre de sesión pendiente de confirmar</h2>
          <p className="mt-2 text-sm leading-6">El acceso se cerró en este navegador, pero el servidor no confirmó la revocación. Reintenta el cierre antes de iniciar otra sesión.</p>
          <button type="button" disabled={retryingLogout} aria-busy={retryingLogout} onClick={async () => {
            if (retryingLogout) return;
            setRetryingLogout(true);
            try { await logout(); } finally { setRetryingLogout(false); }
          }} className="mt-3 min-h-11 w-full rounded-xl border border-amber-600 px-4 py-3 text-sm font-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-wait disabled:opacity-60">
            {retryingLogout ? "Confirmando cierre…" : "Reintentar cierre de sesión"}
          </button>
        </div>}

        <div className="mt-8 grid gap-5">
          <label className="grid gap-2 font-bold">Correo
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email" autoComplete="username" inputMode="email" required
            className="rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]"
          />
          </label>

          <label className="grid gap-2 font-bold">Contraseña
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password" autoComplete="current-password" required
            className="rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]"
          />
          </label>

          <button disabled={submitting || logoutUnconfirmed} aria-busy={submitting} className="min-h-12 rounded-full bg-[#19A2B6] px-8 py-4 text-sm font-black text-white transition hover:bg-[#111111] disabled:cursor-not-allowed disabled:opacity-60">
            {submitting ? "Iniciando sesión…" : "Entrar"}
          </button>
        </div>
      </form>
    </section>
  );
}
