import { withRole } from "../db";
import { env } from "../env";
import { campo, isVecConfigurado, linhasDe, texto, vecGet } from "./vecClient";

/**
 * Adaptador da VEC (veículos + checklists).
 *
 * Nunca gera dado fictício: só grava o que a VEC devolveu. Linha sem placa
 * reconhecível é ignorada (contada em "ignorados"), nunca adivinhada.
 */

const POR_PAGINA = 100;
const MAX_PAGINAS_VEICULOS = 30; // até 3.000 veículos
const MAX_PAGINAS_CHECKLIST = 5; // 500 inspeções mais recentes por rodada

const PLACA_RE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

function normalizarPlaca(v: unknown): string | null {
  const s = texto(v);
  if (!s) return null;
  const limpa = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return PLACA_RE.test(limpa) ? limpa : null;
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^\d,.-]/g, "");
  if (!s) return null;
  // "108.311" (milhar com ponto, padrão BR) → 108311
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/\.(?=\d{3}(\D|$))/g, ""));
  return Number.isFinite(n) ? n : null;
}

function dataHora(v: unknown): string | null {
  const s = texto(v);
  if (!s) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (br) {
    const [, d, m, a, h = "00", mi = "00", se = "00"] = br;
    return `${a}-${m}-${d}T${h}:${mi}:${se}-03:00`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

interface ResultadoSync {
  ok: boolean;
  veiculos: number;
  checklists: number;
  ignorados: number;
  erro?: string;
  skipped?: string;
}

async function buscarPaginas(caminho: string, maxPaginas: number, extra: Record<string, string> = {}) {
  const todas: Record<string, unknown>[] = [];
  for (let page = 0; page < maxPaginas; page++) {
    const resp = await vecGet(caminho, { page, perPage: POR_PAGINA, ...extra });
    const linhas = linhasDe(resp);
    todas.push(...linhas);
    if (linhas.length < POR_PAGINA) break;
  }
  return todas;
}

export async function syncVec(origem: "automatico" | "manual" = "manual"): Promise<ResultadoSync> {
  if (!isVecConfigurado()) {
    return {
      ok: false,
      veiculos: 0,
      checklists: 0,
      ignorados: 0,
      skipped: "VEC_USUARIO/VEC_SENHA não configurados no .env do servidor. Nenhum dado foi gerado.",
    };
  }

  const logId = await withRole("superadmin", "", async (c) => {
    const r = await c.query(`INSERT INTO vec_sync_log (origem) VALUES ($1) RETURNING id`, [origem]);
    return r.rows[0].id as string;
  });

  try {
    const veiculosVec = await buscarPaginas("moviles/newGrid", MAX_PAGINAS_VEICULOS, { showInactivos: "" });
    const checklistsVec = await buscarPaginas("formulario/newGrid", MAX_PAGINAS_CHECKLIST, {
      showInactivos: "false",
      idSort: "desc",
    });

    let ignorados = 0;
    let gravadosVeic = 0;
    let gravadosCheck = 0;

    await withRole("superadmin", "", async (c) => {
      for (const l of veiculosVec) {
        const placa = normalizarPlaca(campo(l, ["dominio", "placa", "patente", "movil.dominio"]));
        if (!placa) {
          ignorados++;
          continue;
        }
        await c.query(
          `INSERT INTO vec_veiculos
             (placa, vec_id, estado, utilizacao, marca, modelo, tipo, regiao, subregiao, svc,
              transportadora, locadora, km, ultimo_bip, payload, sincronizado_em)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
           ON CONFLICT (placa) DO UPDATE SET
             vec_id = EXCLUDED.vec_id, estado = EXCLUDED.estado, utilizacao = EXCLUDED.utilizacao,
             marca = EXCLUDED.marca, modelo = EXCLUDED.modelo, tipo = EXCLUDED.tipo,
             regiao = EXCLUDED.regiao, subregiao = EXCLUDED.subregiao, svc = EXCLUDED.svc,
             transportadora = EXCLUDED.transportadora, locadora = EXCLUDED.locadora,
             km = EXCLUDED.km, ultimo_bip = EXCLUDED.ultimo_bip, payload = EXCLUDED.payload,
             sincronizado_em = now()`,
          [
            placa,
            texto(campo(l, ["id"])),
            texto(campo(l, ["estado", "estado.nombre", "estadoMovil"])),
            texto(campo(l, ["utilizacion", "disponibilidad", "disponible"])),
            texto(campo(l, ["marca", "modelo.marca"])),
            texto(campo(l, ["modelo", "modelo.nombre"])),
            texto(campo(l, ["tipo", "modelo.tipo"])),
            texto(campo(l, ["region", "region.nombre"])),
            texto(campo(l, ["subRegion", "subregion", "subRegion.nombre"])),
            texto(campo(l, ["base", "base.nombre", "svc"])),
            texto(campo(l, ["transportadora", "transportadora.nombre"])),
            texto(campo(l, ["rentadora", "rentadora.nombre", "locadora"])),
            numero(campo(l, ["medidor", "kilometraje", "km"])),
            dataHora(campo(l, ["ultimoBipeo", "ultimoBip", "ultimo_bipeo"])),
            JSON.stringify(l),
          ]
        );
        gravadosVeic++;
      }

      for (const l of checklistsVec) {
        const id = texto(campo(l, ["id"]));
        const placa = normalizarPlaca(campo(l, ["dominio", "unidad", "movil.dominio", "placa", "patente"]));
        const quando = dataHora(campo(l, ["fecha", "fechaHora", "created_at"]));
        if (!id || !placa || !quando) {
          ignorados++;
          continue;
        }
        await c.query(
          `INSERT INTO checklist_events
             (vehicle_id, placa, tipo_formulario, data_hora, unidade, chassi, usuario_vec, num_falhas,
              svc, transportadora, rentadora, subregiao, motorista, source, source_id)
           VALUES ((SELECT id FROM vehicles WHERE placa = $1), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'vec', $13)
           ON CONFLICT (source, source_id) DO UPDATE SET
             num_falhas = EXCLUDED.num_falhas, motorista = EXCLUDED.motorista, ingested_at = now()`,
          [
            placa,
            texto(campo(l, ["descripcion", "tipoFormulario", "tipo_formulario.nombre"])) ?? "Checklist",
            quando,
            texto(campo(l, ["unidad"])),
            texto(campo(l, ["vin", "chasis"])),
            texto(campo(l, ["usuario", "usuario.nombre"])),
            Math.round(numero(campo(l, ["fallas", "cantidadFallas"])) ?? 0),
            texto(campo(l, ["base", "base.nombre"])),
            texto(campo(l, ["transportadora"])),
            texto(campo(l, ["rentadora"])),
            texto(campo(l, ["subRegion", "subregion"])),
            texto(campo(l, ["chofer", "chofer.nombre"])),
            id,
          ]
        );
        gravadosCheck++;
      }

      await c.query(
        `UPDATE vec_sync_log SET finalizado_em = now(), ok = true, veiculos = $1, checklists = $2 WHERE id = $3`,
        [gravadosVeic, gravadosCheck, logId]
      );
    });

    return { ok: true, veiculos: gravadosVeic, checklists: gravadosCheck, ignorados };
  } catch (err: any) {
    const msg = String(err?.message ?? err).slice(0, 500);
    await withRole("superadmin", "", (c) =>
      c.query(`UPDATE vec_sync_log SET finalizado_em = now(), ok = false, erro = $1 WHERE id = $2`, [msg, logId])
    ).catch(() => undefined);
    return { ok: false, veiculos: 0, checklists: 0, ignorados: 0, erro: msg };
  }
}

// Compatibilidade com a rota antiga (POST /api/sync/vec).
export async function syncVecChecklist() {
  return syncVec("manual");
}

/** Agenda a sincronização automática (chamado no start da API). */
export function agendarSyncVec(): void {
  if (!isVecConfigurado() || env.vec.intervaloMin <= 0) return;
  // Se o portal recusar a senha, para as tentativas automáticas até a API
  // reiniciar (o que acontece ao atualizar o .env) — evita bloquear a conta
  // com uma tentativa errada a cada 2 horas.
  let pausadoPorLoginRecusado = false;
  const rodar = () => {
    if (pausadoPorLoginRecusado) return;
    return syncVec("automatico").then((r) => {
      if (r.erro?.includes("recusou o login")) pausadoPorLoginRecusado = true;
      // eslint-disable-next-line no-console
      console.log(`[VEC] sync automático: ok=${r.ok} veiculos=${r.veiculos} checklists=${r.checklists}${r.erro ? " erro=" + r.erro : ""}`);
    });
  };
  setTimeout(rodar, 30_000); // 30s após subir, para não atrasar o boot
  setInterval(rodar, env.vec.intervaloMin * 60_000);
}
