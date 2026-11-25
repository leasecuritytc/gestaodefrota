import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { env } from "../env";
import { withRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { registrarAuditoria } from "../audit";

// Pendências de dados: o que o admin precisa conferir/corrigir, com a ORIGEM
// (VEC, BSC, planilha, plataforma) e a DATA da informação que gerou o alerta.
export const pendenciasRouter = Router();
pendenciasRouter.use(requireAuth, requireRole("superadmin", "admin"));

const h = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);

type Origem = "VEC" | "BSC" | "Planilha" | "Plataforma";
type Sev = "alta" | "media" | "baixa";
interface Pendencia {
  chave: string; tipo: string; severidade: Sev; origem: Origem; origem_data: string | null;
  placa: string | null; base: string | null; titulo: string; detalhe: string; como_corrigir: string;
}

const DIA = 86_400_000;

async function calcular(c: import("pg").PoolClient): Promise<Pendencia[]> {
  const bases = env.vec.bases;
  const out: Pendencia[] = [];
  const add = (p: Omit<Pendencia, "chave">) =>
    out.push({ ...p, chave: `${p.tipo}:${p.placa ?? "-"}:${p.origem_data ? new Date(p.origem_data).toISOString().slice(0, 10) : "sem-data"}` });

  const veic = (await c.query(
    `SELECT v.id, v.placa, v.base, v.tipo, v.chassi, v.status, v.source, coalesce(v.ingested_at, v.created_at) AS planilha_em,
            vv.estado AS vec_estado, vv.km AS vec_km, vv.ultimo_bip, vv.sincronizado_em AS vec_em,
            u.ultimo_km, u.ultimo_em, kr.km AS km_ref
       FROM vehicles v
       LEFT JOIN vec_veiculos vv ON vv.placa = v.placa
       LEFT JOIN veiculo_km_referencia kr ON kr.vehicle_id = v.id
       LEFT JOIN LATERAL (SELECT max(x.km) AS ultimo_km, max(coalesce(x.concluido_em, x.data_hora)) AS ultimo_em
                            FROM checklist_execucoes x WHERE x.vehicle_id = v.id AND x.status = 'Concluido') u ON true
      WHERE v.base = ANY($1) AND v.status <> 'Desmobilizado'
      ORDER BY v.base, v.placa`, [bases]
  )).rows;

  const sync = (await c.query(`SELECT max(finalizado_em) AS em FROM vec_sync_log WHERE ok`)).rows[0]?.em as string | null;
  const bsc = (await c.query(`SELECT max(coletado_em) AS em FROM bsc_snapshots`)).rows[0]?.em as string | null;
  const agora = Date.now();

  for (const v of veic) {
    const origemCad: Origem = v.source === "vec" ? "VEC" : v.source === "bsc" ? "BSC" : v.source === "manual" ? "Plataforma" : "Planilha";
    if (!v.tipo || !String(v.tipo).trim()) {
      add({ tipo: "sem_tipo", severidade: "media", origem: origemCad, origem_data: v.planilha_em, placa: v.placa, base: v.base,
        titulo: "Tipo do veículo não informado", detalhe: `O cadastro veio de ${origemCad.toLowerCase()} sem o tipo (ex.: Van, Fiorino).`,
        como_corrigir: "Abra Veículos, edite o veículo e preencha o tipo." });
    }
    if (!v.chassi || !String(v.chassi).trim()) {
      add({ tipo: "sem_chassi", severidade: "baixa", origem: origemCad, origem_data: v.planilha_em, placa: v.placa, base: v.base,
        titulo: "Chassi não informado", detalhe: `O cadastro veio de ${origemCad.toLowerCase()} sem o chassi.`,
        como_corrigir: "Abra Veículos, edite o veículo e preencha o chassi." });
    }
    if (!v.vec_em) {
      add({ tipo: "fora_da_vec", severidade: "media", origem: "VEC", origem_data: sync, placa: v.placa, base: v.base,
        titulo: "Placa não encontrada na VEC", detalhe: "A placa está na plataforma, mas a última sincronização da VEC não a trouxe.",
        como_corrigir: "Confira se a placa está correta e se o veículo está cadastrado na VEC. Se for só atraso, aguarde a próxima sincronização." });
      continue;
    }
    const em = String(v.vec_estado ?? "").toUpperCase();
    if (v.status === "Ativa" && em.includes("MANUT")) {
      add({ tipo: "status_divergente", severidade: "alta", origem: "VEC", origem_data: v.vec_em, placa: v.placa, base: v.base,
        titulo: "VEC mostra manutenção, plataforma mostra Ativa", detalhe: `Estado na VEC: ${v.vec_estado}. Status aqui: ${v.status}.`,
        como_corrigir: "Confira com a base. Se estiver em manutenção, altere o status em Veículos e registre a manutenção." });
    }
    if (v.status === "Manutenção" && em.includes("ATIVO")) {
      add({ tipo: "status_divergente", severidade: "media", origem: "VEC", origem_data: v.vec_em, placa: v.placa, base: v.base,
        titulo: "VEC mostra ativo, plataforma mostra Manutenção", detalhe: `Estado na VEC: ${v.vec_estado}. Status aqui: ${v.status}.`,
        como_corrigir: "Se a manutenção terminou, conclua a manutenção e volte o veículo para Ativa." });
    }
    if (v.status === "Ativa" && v.ultimo_bip && agora - new Date(v.ultimo_bip).getTime() > 7 * DIA) {
      const d = Math.floor((agora - new Date(v.ultimo_bip).getTime()) / DIA);
      add({ tipo: "sem_bip", severidade: "media", origem: "VEC", origem_data: v.ultimo_bip, placa: v.placa, base: v.base,
        titulo: `Sem bip na VEC há ${d} dias`, detalhe: `Último bip: ${new Date(v.ultimo_bip).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}, com o veículo Ativa aqui.`,
        como_corrigir: "Verifique se o veículo está rodando. Se estiver parado, ajuste o status; se estiver rodando, verifique o rastreador/bip." });
    }
    if (v.vec_km != null && v.ultimo_km != null && !v.km_ref && Number(v.vec_km) - Number(v.ultimo_km) > 5000 && v.ultimo_em && agora - new Date(v.ultimo_em).getTime() < 60 * DIA) {
      add({ tipo: "km_inconsistente", severidade: "alta", origem: "VEC", origem_data: v.vec_em, placa: v.placa, base: v.base,
        titulo: "Km da VEC muito acima do último checklist",
        detalhe: `VEC: ${Number(v.vec_km).toLocaleString("pt-BR")} km. Último checklist: ${Number(v.ultimo_km).toLocaleString("pt-BR")} km. A VEC é usada como piso e pode bloquear a próxima inspeção.`,
        como_corrigir: "Confira o odômetro. Se a VEC estiver errada, em Inspeções use “Ajustar km” para definir o km de referência com observação." });
    }
  }

  if (!sync || agora - new Date(sync).getTime() > 3 * 3600_000) {
    add({ tipo: "vec_desatualizada", severidade: "alta", origem: "VEC", origem_data: sync, placa: null, base: null,
      titulo: "Sincronização da VEC atrasada", detalhe: sync ? `Última sincronização bem-sucedida: ${new Date(sync).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.` : "Nenhuma sincronização bem-sucedida registrada.",
      como_corrigir: "Verifique as credenciais da VEC no servidor e o histórico de sincronização." });
  }
  if (!bsc || agora - new Date(bsc).getTime() > 4 * 3600_000) {
    add({ tipo: "bsc_desatualizado", severidade: "media", origem: "BSC", origem_data: bsc, placa: null, base: null,
      titulo: "Coleta do BSC atrasada", detalhe: bsc ? `Último retrato coletado: ${new Date(bsc).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.` : "Nenhum retrato do BSC coletado.",
      como_corrigir: "No computador do coletor, rode “npm run coletar”. Se pedir login do Google, rode “npm run login” antes." });
  }
  return out;
}

pendenciasRouter.get("/", h(async (req, res) => {
  const todas = req.query.conferidas === "1";
  const r = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const lista = await calcular(c);
    const conf = new Map((await c.query(
      `SELECT p.chave, p.observacao, p.conferido_em, coalesce(u.full_name, u.email) AS por FROM pendencias_conferidas p LEFT JOIN users u ON u.id = p.conferido_por`
    )).rows.map((x) => [x.chave as string, x]));
    return lista.map((p) => ({ ...p, conferida: conf.get(p.chave) ?? null }));
  });
  const peso = { alta: 0, media: 1, baixa: 2 } as const;
  const sorted = r.filter((p) => todas || !p.conferida).sort((a, b) => peso[a.severidade] - peso[b.severidade] || (a.placa ?? "").localeCompare(b.placa ?? ""));
  res.json({ total_abertas: r.filter((p) => !p.conferida).length, itens: sorted });
}));

// Só a contagem (selo do menu) e as placas com alerta (ícone na tela de Veículos).
pendenciasRouter.get("/resumo", h(async (req, res) => {
  const r = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const lista = await calcular(c);
    const conf = new Set((await c.query(`SELECT chave FROM pendencias_conferidas`)).rows.map((x) => x.chave as string));
    return lista.filter((p) => !conf.has(p.chave));
  });
  const porPlaca: Record<string, number> = {};
  for (const p of r) if (p.placa) porPlaca[p.placa] = (porPlaca[p.placa] ?? 0) + 1;
  res.json({ total: r.length, altas: r.filter((p) => p.severidade === "alta").length, por_placa: porPlaca });
}));

const confSchema = z.object({ chave: z.string().min(3).max(200), observacao: z.string().trim().min(5, "Descreva o que foi conferido (mín. 5 caracteres).").max(500) });

pendenciasRouter.post("/conferir", h(async (req, res) => {
  const p = confSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message ?? "Dados inválidos." });
  await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    await c.query(
      `INSERT INTO pendencias_conferidas (chave, observacao, conferido_por) VALUES ($1,$2,$3)
       ON CONFLICT (chave) DO UPDATE SET observacao = EXCLUDED.observacao, conferido_por = EXCLUDED.conferido_por, conferido_em = now()`,
      [p.data.chave, p.data.observacao, req.auth!.sub]
    );
    await registrarAuditoria(c, req.auth!.sub, "pendencia_conferida", "pendencias", p.data.chave, { observacao: p.data.observacao });
  });
  res.json({ ok: true });
}));
