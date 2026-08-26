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
    <section className="flex min-h-[70vh] items-center justify-center bg-[#F5F5F5] px-5 py-20">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-sm"
      >
        <p className="mb-3 text-sm font-black uppercase tracking-[0.25em] text-[#19A2B6]">
          Admin
        </p>

        <h1 className="text-4xl font-black tracking-[-0.05em]">
          Iniciar sesión
        </h1>

        <div className="mt-8 grid gap-5">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]"
            placeholder="Correo"
          />

          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            className="rounded-2xl border border-black/10 px-5 py-4 font-semibold outline-none focus:border-[#19A2B6]"
            placeholder="Contraseña"
          />

          <button className="rounded-full bg-[#19A2B6] px-8 py-4 text-sm font-black text-white transition hover:bg-[#111111]">
            Entrar
          </button>
        </div>
      </form>
    </section>
  );
}
