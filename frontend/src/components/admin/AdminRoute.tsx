import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

type AdminRouteProps = {
  children: React.ReactNode;
};

export function AdminRoute({ children }: AdminRouteProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (!initialized) {
    return <section className="px-5 py-20"><h1 className="text-4xl font-black">Validando sesión...</h1></section>;
  }

  if (!isAuthenticated || user?.role !== "ADMIN") {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}
