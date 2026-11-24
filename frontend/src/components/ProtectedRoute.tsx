import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";

export function ProtectedRoute({
  children,
  papeis,
}: {
  children: ReactNode;
  papeis?: string[];
}) {
  const { usuario, token } = useAuth();
  if (!token || !usuario) {
    return <Navigate to="/login" replace />;
  }
  if (papeis && !papeis.includes(usuario.role)) {
    return (
      <div className="painel">
        <h2>Sem permissão</h2>
        <p>Seu papel ({usuario.role}) não tem acesso a esta página.</p>
      </div>
    );
  }
  return <>{children}</>;
}
