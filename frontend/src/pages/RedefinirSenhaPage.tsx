import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, mensagemErro } from "../api";
import VideoFundo from "../components/VideoFundo";

export default function RedefinirSenhaPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [carregando, setCarregando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (password.length < 12) {
      setErro("A senha precisa ter pelo menos 12 caracteres.");
      return;
    }
    if (password !== confirmacao) {
      setErro("As senhas não conferem.");
      return;
    }
    setCarregando(true);
    try {
      await api.post("/auth/redefinir-senha", { token, password });
      setOk(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      setErro(
        mensagemErro(
          err,
          "Não foi possível redefinir a senha. O link pode ter expirado (validade de 1 hora) — peça um novo em 'Esqueci minha senha'."
        )
      );
    } finally {
      setCarregando(false);
    }
  }

  if (!token) {
    return (
      <div className="auth-shell">
      <VideoFundo />
        <div className="auth-card">
          <h1>Link inválido</h1>
          <p className="subtitulo">Peça um novo link em "Esqueci minha senha".</p>
          <Link to="/esqueci-senha" className="btn btn-secundario">
            Esqueci minha senha
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <VideoFundo />
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Redefinir senha</h1>
        <p className="subtitulo">Este link vale por 1 hora e só pode ser usado uma vez.</p>
        {erro && <div className="erro">{erro}</div>}
        {ok && <div className="sucesso">Senha redefinida! Levando você ao login...</div>}
        {!ok && (
          <>
            <div className="campo">
              <label htmlFor="password">Nova senha (mínimo 12 caracteres)</label>
              <input
                id="password"
                type="password"
                required
                minLength={12}
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="campo">
              <label htmlFor="confirmacao">Confirme a senha</label>
              <input
                id="confirmacao"
                type="password"
                required
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
              />
            </div>
            <button className="btn btn-primario" disabled={carregando}>
              {carregando ? "Salvando..." : "Redefinir senha"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
