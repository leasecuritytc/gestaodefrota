import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import AtivarContaPage from "./pages/AtivarContaPage";
import EsqueciSenhaPage from "./pages/EsqueciSenhaPage";
import RedefinirSenhaPage from "./pages/RedefinirSenhaPage";
import DashboardPage from "./pages/DashboardPage";
import VeiculosPage from "./pages/VeiculosPage";
import ManutencoesPage from "./pages/ManutencoesPage";
import OcorrenciasPage from "./pages/OcorrenciasPage";
import UsuariosPage from "./pages/UsuariosPage";
import AuditoriaPage from "./pages/AuditoriaPage";
import BasesPage from "./pages/BasesPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/ativar-conta" element={<AtivarContaPage />} />
        <Route path="/esqueci-senha" element={<EsqueciSenhaPage />} />
        <Route path="/redefinir-senha" element={<RedefinirSenhaPage />} />

        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="veiculos" element={<VeiculosPage />} />
          <Route path="manutencoes" element={<ManutencoesPage />} />
          <Route path="ocorrencias" element={<OcorrenciasPage />} />
          <Route
            path="usuarios"
            element={
              <ProtectedRoute papeis={["superadmin", "admin"]}>
                <UsuariosPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="auditoria"
            element={
              <ProtectedRoute papeis={["superadmin", "admin"]}>
                <AuditoriaPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="bases"
            element={
              <ProtectedRoute papeis={["superadmin", "admin"]}>
                <BasesPage />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
