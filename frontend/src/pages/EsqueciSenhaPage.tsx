import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, mensagemErro } from "../api";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const { data } = await api.post("/auth/esqueci-senha", { email });
      // A API sempre devolve a mesma mensagem genérica, exista ou não a
      // conta — isso é proposital (evita que alguém descubra quem tem
      // conta na plataforma só tentando e-mails). O frontend só repete.
      setMensagem(data.mensagem);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Esqueci minha senha</h1>
        <p className="subtitulo">
          Informe o e-mail da sua conta (ou o e-mail de recuperação cadastrado). Se existir uma
          conta ativa, enviamos um link para redefinir a senha.
        </p>
        {erro && <div className="erro">{erro}</div>}
        {mensagem && <div className="sucesso">{mensagem}</div>}
        {!mensagem && (
          <>
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
            <button className="btn btn-primario" disabled={carregando}>
              {carregando ? "Enviando..." : "Enviar link de redefinição"}
            </button>
          </>
        )}
        <div className="links-auth">
          <Link to="/login">Voltar ao login</Link>
        </div>
      </form>
    </div>
  );
}
