import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { RouteAnalytics } from "../RouteAnalytics";

export function PublicLayout() {
  return <><RouteAnalytics/><a href="#main-content" className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-full bg-[#111] px-5 py-3 font-black text-white transition focus:translate-y-0">Saltar al contenido</a><Header /><main id="main-content" tabIndex={-1}><Outlet /></main><Footer /></>;
}
