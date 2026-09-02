import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useAdminFeedback } from "../components/admin/AdminFeedback";

export function AdminLogin() {
  const feedback = useAdminFeedback();
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();

    const success = await login(email, password);

    if (!success) {
      feedback.toast("error", "Credenciales incorrectas");
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

          <button className="min-h-12 rounded-full bg-[#19A2B6] px-8 py-4 text-sm font-black text-white transition hover:bg-[#111111]">
            Entrar
          </button>
        </div>
      </form>
    </section>
  );
}
