import { useEffect, useState } from "react";
import { api, mensagemErro } from "../api";

interface Perfil { nome: string; email: string; cargo: string; telefone: string; empresa: string; matricula: string; faltando: string[] }

// Cadastro do admin: estas informações aparecem no cabeçalho/rodapé dos relatórios em PDF.
export default function PerfilPage() {
  const [p, setP] = useState<Perfil | null>(null);
  const [msg, setMsg] = useState<{ tipo: "erro" | "sucesso"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const voltar = new URLSearchParams(window.location.search).get("voltar");

  useEffect(() => { api.get<Perfil>("/perfil").then((r) => setP(r.data)).catch((e) => setMsg({ tipo: "erro", texto: mensagemErro(e, "Não foi possível carregar seu cadastro.") })); }, []);
  const set = (k: keyof Perfil, v: string) => setP((x) => (x ? { ...x, [k]: v } : x));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!p) return;
    setMsg(null); setOcupado(true);
    try {
      await api.put("/perfil", { nome: p.nome, cargo: p.cargo, empresa: p.empresa, telefone: p.telefone, matricula: p.matricula });
      setMsg({ tipo: "sucesso", texto: "Cadastro salvo." });
      const r = await api.get<Perfil>("/perfil"); setP(r.data);
      if (voltar === "relatorios") window.location.href = "/relatorios";
    } catch (err) { setMsg({ tipo: "erro", texto: mensagemErro(err, "Não foi possível salvar.") }); }
    finally { setOcupado(false); }
  }

  return (
    <div>
      <h1>Meu cadastro</h1>
      <p className="descricao-pagina">Estes dados aparecem no cabeçalho e no rodapé dos relatórios em PDF. Preencha tudo antes de gerar o primeiro relatório.</p>
      {msg && <div className={msg.tipo === "erro" ? "erro" : "sucesso"} role="status" aria-live="polite">{msg.texto}</div>}
      {!p ? <p className="carregando">Carregando...</p> : (
        <form className="painel" onSubmit={salvar} style={{ maxWidth: 560 }}>
          {p.faltando.length > 0 && <div className="insp-aviso" role="note"><strong>Cadastro incompleto</strong><span>Falta preencher: {p.faltando.join(", ")}.</span></div>}
          <div className="campo"><label htmlFor="pf-nome">Nome completo *</label><input id="pf-nome" value={p.nome} onChange={(e) => set("nome", e.target.value)} required autoComplete="name" /></div>
          <div className="campo"><label htmlFor="pf-cargo">Cargo ou função *</label><input id="pf-cargo" value={p.cargo} onChange={(e) => set("cargo", e.target.value)} required placeholder="Ex.: Gestor de operações" /></div>
          <div className="campo"><label htmlFor="pf-emp">Empresa *</label><input id="pf-emp" value={p.empresa} onChange={(e) => set("empresa", e.target.value)} required placeholder="Ex.: RodaCoop" /></div>
          <div className="campo"><label htmlFor="pf-tel">Telefone com DDD *</label><input id="pf-tel" type="tel" inputMode="tel" value={p.telefone} onChange={(e) => set("telefone", e.target.value)} required placeholder="(35) 99999-0000" autoComplete="tel" /></div>
          <div className="campo"><label htmlFor="pf-mat">Matrícula ou registro (opcional)</label><input id="pf-mat" value={p.matricula} onChange={(e) => set("matricula", e.target.value)} /></div>
          <div className="campo"><label>E-mail (do login)</label><input value={p.email} disabled /></div>
          <div className="acoes"><button className="btn btn-primario" style={{ width: "auto" }} disabled={ocupado}>{ocupado ? "Salvando..." : "Salvar cadastro"}</button></div>
        </form>
      )}
    </div>
  );
}
