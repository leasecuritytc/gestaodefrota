import { Router } from "express";
import { z } from "zod";
import { withRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { registrarAuditoria } from "../audit";

export const vehiclesRouter = Router();
vehiclesRouter.use(requireAuth);

vehiclesRouter.get("/", async (req, res) => {
  const rows = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(
      `SELECT v.id, v.placa, v.chassi, v.base, v.tipo, v.rentadora, v.transportadora,
              v.subregiao, v.status, v.observacoes, v.motorista_atual_id, v.source, coalesce(v.ingested_at, v.created_at) AS cadastro_em,
              d.nome AS motorista_nome,
              vv.estado AS vec_estado, vv.km AS vec_km, vv.ultimo_bip AS vec_ultimo_bip,
              vv.sincronizado_em AS vec_sincronizado_em
       FROM vehicles v
       LEFT JOIN drivers d ON d.id = v.motorista_atual_id
       LEFT JOIN vec_veiculos vv ON vv.placa = v.placa
       ORDER BY v.base, v.placa`
    )
  );
  res.json(rows.rows);
});

// Frota completa como a VEC enxerga (todas as bases da RodaCoop), com
// indicação de quais placas já estão cadastradas aqui.
vehiclesRouter.get("/vec", requireRole("superadmin", "admin"), async (req, res) => {
  const rows = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(
      `SELECT vv.placa, vv.estado, vv.utilizacao, vv.modelo, vv.tipo, vv.regiao, vv.subregiao, vv.svc,
              vv.transportadora, vv.locadora, vv.km, vv.ultimo_bip, vv.sincronizado_em,
              (v.id IS NOT NULL) AS cadastrado
       FROM vec_veiculos vv
       LEFT JOIN vehicles v ON v.placa = vv.placa
       ORDER BY vv.svc NULLS LAST, vv.placa`
    )
  );
  res.json(rows.rows);
});

const createSchema = z.object({
  placa: z.string().min(5).max(10),
  chassi: z.string().optional(),
  base: z.string().min(1),
  tipo: z.string().optional(),
  rentadora: z.string().optional(),
  transportadora: z.string().optional(),
  subregiao: z.string().optional(),
});

vehiclesRouter.post("/", requireRole("superadmin", "admin", "gestor_base"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const v = parsed.data;
  try {
    const result = await withRole(req.auth!.role, req.auth!.sub, (c) =>
      c.query(
        `INSERT INTO vehicles (placa, chassi, base, tipo, rentadora, transportadora, subregiao)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [v.placa.toUpperCase(), v.chassi, v.base, v.tipo, v.rentadora, v.transportadora, v.subregiao]
      )
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Já existe um veículo com essa placa." });
    }
    throw err;
  }
});

// CRUD de verdade: edição geral do veículo (status, tipo, rentadora,
// transportadora, subregiao, observações, chassi). Decisão do dono do
// projeto (24/11/2026): essa edição é só de superadmin e admin — mais
// restrita que a troca de motorista (que já inclui gestor_base).
const updateVeiculoSchema = z.object({
  chassi: z.string().nullable().optional(),
  tipo: z.string().nullable().optional(),
  rentadora: z.string().nullable().optional(),
  transportadora: z.string().nullable().optional(),
  subregiao: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  status: z.enum(["Ativa", "Manutenção", "Desmobilizado", "Sem cooperado"]).optional(),
  base: z.string().min(1).optional(),
});

vehiclesRouter.patch("/:id", requireRole("superadmin", "admin"), async (req, res) => {
  const parsed = updateVeiculoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const campos = parsed.data;
  if (Object.keys(campos).length === 0) {
    return res.status(400).json({ error: "Nada para atualizar." });
  }

  try {
    const resultado = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
      const atual = await c.query(`SELECT * FROM vehicles WHERE id = $1`, [req.params.id]);
      if (!atual.rows[0]) {
        throw Object.assign(new Error("Veículo não encontrado."), { httpStatus: 404 });
      }

      const sets: string[] = [];
      const valores: unknown[] = [];
      let i = 1;
      for (const [campo, valor] of Object.entries(campos)) {
        sets.push(`${campo} = $${i}`);
        valores.push(valor);
        i++;
      }
      valores.push(req.params.id);

      const row = await c.query(
        `UPDATE vehicles SET ${sets.join(", ")}, updated_at = now() WHERE id = $${i} RETURNING *`,
        valores
      );
      await registrarAuditoria(c, req.auth!.sub, "editar_veiculo", "vehicles", req.params.id, {
        placa: atual.rows[0].placa,
        campos_alterados: campos,
      });
      return row.rows[0];
    });
    res.json(resultado);
  } catch (err: any) {
    if (err.httpStatus) {
      return res.status(err.httpStatus).json({ error: err.message });
    }
    throw err;
  }
});

// Troca o motorista atual de um veículo. Liberado para gestor_base, admin e
// superadmin (decisão do dono do projeto, 24/11/2026) — RLS (vehicles_update
// em 002_rls.sql) já restringe a esses três papéis; esta checagem na rota é
// a primeira camada, mais explícita nos erros.
// driver_id = null retira o motorista atual, sem atribuir outro (ex.: veículo
// fica "Sem cooperado" até alguém novo assumir).
const trocarMotoristaSchema = z.object({
  driver_id: z.string().uuid().nullable(),
});

vehiclesRouter.patch(
  "/:id/motorista",
  requireRole("superadmin", "admin", "gestor_base"),
  async (req, res) => {
    const parsed = trocarMotoristaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { driver_id: novoDriverId } = parsed.data;
    const vehicleId = req.params.id;

    try {
      const resultado = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
        const veiculoRow = await c.query(
          `SELECT id, placa, motorista_atual_id FROM vehicles WHERE id = $1`,
          [vehicleId]
        );
        const veiculo = veiculoRow.rows[0];
        if (!veiculo) {
          throw Object.assign(new Error("Veículo não encontrado."), { httpStatus: 404 });
        }

        if (novoDriverId) {
          const driverRow = await c.query(`SELECT id, nome FROM drivers WHERE id = $1`, [novoDriverId]);
          if (!driverRow.rows[0]) {
            throw Object.assign(new Error("Motorista (driver_id) não encontrado."), { httpStatus: 400 });
          }
        }

        const anteriorId: string | null = veiculo.motorista_atual_id;

        // Nomes só para o log de auditoria ficar legível num relatório —
        // nunca usados para decidir nada.
        const nomes = await c.query(
          `SELECT id, nome FROM drivers WHERE id = ANY($1::uuid[])`,
          [[anteriorId, novoDriverId].filter((v): v is string => Boolean(v))]
        );
        const nomePorId = Object.fromEntries(nomes.rows.map((r) => [r.id, r.nome]));

        if (anteriorId === novoDriverId) {
          // Nada muda de fato, mas registra a tentativa mesmo assim —
          // "tudo deverá ser passível de relatório".
          await registrarAuditoria(c, req.auth!.sub, "trocar_motorista_sem_mudanca", "vehicles", vehicleId, {
            placa: veiculo.placa,
            motorista: anteriorId ? nomePorId[anteriorId] ?? anteriorId : null,
          });
          return { placa: veiculo.placa, motorista_atual_id: anteriorId };
        }

        await c.query(`UPDATE vehicles SET motorista_atual_id = $1, updated_at = now() WHERE id = $2`, [
          novoDriverId,
          vehicleId,
        ]);

        if (anteriorId) {
          await c.query(
            `UPDATE vehicle_driver_history SET fim = now()
             WHERE vehicle_id = $1 AND driver_id = $2 AND fim IS NULL`,
            [vehicleId, anteriorId]
          );
        }
        if (novoDriverId) {
          await c.query(
            `INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio) VALUES ($1, $2, now())`,
            [vehicleId, novoDriverId]
          );
        }

        await registrarAuditoria(c, req.auth!.sub, "trocar_motorista", "vehicles", vehicleId, {
          placa: veiculo.placa,
          motorista_anterior: anteriorId ? nomePorId[anteriorId] ?? anteriorId : null,
          motorista_novo: novoDriverId ? nomePorId[novoDriverId] ?? novoDriverId : null,
        });

        return { placa: veiculo.placa, motorista_atual_id: novoDriverId };
      });
      res.json(resultado);
    } catch (err: any) {
      if (err.httpStatus) {
        return res.status(err.httpStatus).json({ error: err.message });
      }
      throw err;
    }
  }
);
