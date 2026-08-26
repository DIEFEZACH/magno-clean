import { Link } from "react-router-dom";
export function Footer() {
  return (
    <footer className="bg-[#111111] px-5 py-12 text-white lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row md:items-center">
        <div>
          <p className="text-2xl font-black">MAGNO CLEAN</p>
          <p className="mt-2 text-sm text-white/55">Soluciones profesionales para cada espacio.</p>
        </div>

        <div className="flex flex-wrap gap-5 text-sm font-bold text-white/60">
          <Link className="hover:text-white" to="/privacidad">Privacidad</Link>
          <Link className="hover:text-white" to="/terminos">Términos</Link>
          <Link className="hover:text-white" to="/devoluciones">Devoluciones</Link>
          <Link className="hover:text-white" to="/contacto">Contacto</Link>
        </div>
      </div>
    </footer>
  );
}
