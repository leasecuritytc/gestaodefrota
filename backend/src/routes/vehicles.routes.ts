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
      `SELECT id, placa, chassi, base, tipo, rentadora, transportadora, subregiao, status
       FROM vehicles ORDER BY base, placa`
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
