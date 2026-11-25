import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, mensagemErro } from "../api";
import { useAuth } from "../auth";
import VideoFundo from "../components/VideoFundo";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      login(data.token, data.user);
      navigate("/");
    } catch (err) {
      setErro(mensagemErro(err, "Não foi possível entrar. Confira e-mail e senha."));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="auth-shell">
      <VideoFundo />
      <form className="auth-card" onSubmit={onSubmit}>
        <img className="auth-logo" src="/logo.jpg" alt="Gestão de Frotas — Liderança em Logística" />
        <h1 className="sr-only">GESTÃO DE FROTA</h1>
        <p className="subtitulo">Entre com seu e-mail e senha para acessar a plataforma.</p>
        {erro && <div className="erro">{erro}</div>}
        <div className="campo">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="campo">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn btn-primario" disabled={carregando}>
          {carregando ? "Entrando..." : "Entrar"}
        </button>
        <div className="links-auth">
          <Link to="/esqueci-senha">Esqueci minha senha</Link>
        </div>
      </form>
    </div>
  );
}
