import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, mensagemErro } from "../api";
import { useAuth } from "../auth";

export default function AtivarContaPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { login } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [emailRecuperacao, setEmailRecuperacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
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
      const { data } = await api.post("/auth/ativar-conta", {
        token,
        password,
        email_recuperacao: emailRecuperacao || undefined,
      });
      login(data.token, data.user);
      navigate("/");
    } catch (err) {
      setErro(
        mensagemErro(
          err,
          "Não foi possível ativar a conta. O link pode ter expirado ou já ter sido usado — peça um novo convite a quem te cadastrou."
        )
      );
    } finally {
      setCarregando(false);
    }
  }

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1>Link inválido</h1>
          <p className="subtitulo">
            Este link de ativação está incompleto. Copie o link exatamente como foi enviado, ou
            peça um novo a quem te cadastrou.
          </p>
          <Link to="/login" className="btn btn-secundario">
            Voltar ao login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Ative sua conta</h1>
        <p className="subtitulo">
          Defina sua senha de acesso à GESTÃO DE FROTA. Guarde-a bem — ela nunca é vista por
          quem te cadastrou.
        </p>
        {erro && <div className="erro">{erro}</div>}
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
        <div className="campo">
          <label htmlFor="email_recuperacao">
            E-mail alternativo para recuperação (opcional, mas recomendado)
          </label>
          <input
            id="email_recuperacao"
            type="email"
            value={emailRecuperacao}
            onChange={(e) => setEmailRecuperacao(e.target.value)}
            placeholder="caso esqueça a senha, usamos este e-mail"
          />
        </div>
        <button className="btn btn-primario" disabled={carregando}>
          {carregando ? "Ativando..." : "Ativar e entrar"}
        </button>
      </form>
    </div>
  );
}
