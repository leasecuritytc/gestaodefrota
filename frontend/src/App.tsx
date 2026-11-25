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
import MotoristasPage from "./pages/MotoristasPage";
import ChecklistsPage from "./pages/ChecklistsPage";
import InspecoesPage from "./pages/InspecoesPage";
import BscPage from "./pages/BscPage";
import PendenciasPage from "./pages/PendenciasPage";
import PerfilPage from "./pages/PerfilPage";
import RelatoriosPage from "./pages/RelatoriosPage";

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
              <ProtectedRoute papeis={["superadmin"]}>
                <AuditoriaPage />
              </ProtectedRoute>
            }
          />
          <Route path="inspecoes" element={<ProtectedRoute papeis={["superadmin", "admin", "gestor_base", "leitor"]}><InspecoesPage /></ProtectedRoute>} />
          <Route
            path="checklists"
            element={
              <ProtectedRoute papeis={["superadmin", "admin"]}>
                <ChecklistsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="bsc"
            element={
              <ProtectedRoute papeis={["superadmin", "admin"]}>
                <BscPage />
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
          <Route path="relatorios" element={<ProtectedRoute papeis={["superadmin", "admin"]}><RelatoriosPage /></ProtectedRoute>} />
          <Route path="perfil" element={<ProtectedRoute papeis={["superadmin", "admin"]}><PerfilPage /></ProtectedRoute>} />
          <Route path="pendencias" element={<ProtectedRoute papeis={["superadmin", "admin"]}><PendenciasPage /></ProtectedRoute>} />
          <Route
            path="motoristas"
            element={
              <ProtectedRoute papeis={["superadmin", "admin"]}>
                <MotoristasPage />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
