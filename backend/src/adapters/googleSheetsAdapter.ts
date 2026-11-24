import { google } from "googleapis";
import { env } from "../env";
import { withRole } from "../db";

/**
 * Adaptador do Google Sheets (a planilha de campo que alimentava a
 * plataforma antiga, no mesmo formato da base importada em
 * 008_seed_base_smg3_pouso_alegre.sql: colunas PLACA / DRIVERS (ou
 * MOTORISTA) / LOCADORA (ou RENTADORA) / STATUS / OBSERVAÇÕES).
 *
 * Propositalmente NÃO FAZ NADA até existir GOOGLE_SHEETS_SPREADSHEET_IDS e
 * GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON configurados — nunca gera dado
 * fictício para preencher a tela. Também NUNCA lê a planilha como link
 * público anônimo (isso era exatamente a falha de segurança C1/C2 da
 * plataforma antiga, já corrigida nesta reconstrução) — sempre via Google
 * Sheets API com uma service account que o dono da planilha autoriza
 * explicitamente como leitora.
 *
 * Cada aba da planilha é lida e interpretada de forma independente: uma
 * aba sem a coluna PLACA é ignorada (não gera erro, só não conta como
 * sincronizada), para suportar planilhas com abas auxiliares.
 */

const STATUS_MAP: Record<string, string> = {
  ATIVA: "Ativa",
  "MANUTENÇÃO": "Manutenção",
  MANUTENCAO: "Manutenção",
  DESMOBILIZADO: "Desmobilizado",
  "SEM COOPERADO": "Sem cooperado",
};

interface LinhaVeiculo {
  placa: string;
  driver: string | null;
  locadora: string | null;
  status: string;
  observacoes: string | null;
}

export async function isGoogleSheetsConfigured(): Promise<boolean> {
  return Boolean(env.googleSheets.spreadsheetIds.length > 0 && env.googleSheets.serviceAccountJson);
}

function celula(row: unknown[], idx: number | undefined): string {
  if (idx === undefined) return "";
  const v = row[idx];
  return v === undefined || v === null ? "" : String(v).trim();
}

/**
 * Interpreta os valores brutos de uma aba (como vêm da Sheets API) no
 * mesmo layout usado pela planilha real já importada: título(s) de seção
 * nas primeiras linhas, depois uma linha de cabeçalho com PLACA/DRIVERS/
 * LOCADORA/STATUS, depois uma linha por veículo. Uma linha cuja placa não
 * bate no formato de 7 caracteres (ex.: "CHECK LIST OK") é ignorada — não
 * tentamos adivinhar o que ela significa.
 */
export function parseAbaPlanilha(values: unknown[][]): LinhaVeiculo[] {
  let headerRowIdx = -1;
  const colIdx: Record<string, number> = {};

  for (let r = 0; r < values.length; r++) {
    const row = values[r] ?? [];
    const upper = row.map((c) => (c === undefined || c === null ? "" : String(c).trim().toUpperCase()));
    if (upper.includes("PLACA")) {
      headerRowIdx = r;
      upper.forEach((h, i) => {
        if (h) colIdx[h] = i;
      });
      break;
    }
  }
  if (headerRowIdx === -1) return []; // aba sem coluna PLACA: não é uma aba de frota, ignora

  const placaCol = colIdx["PLACA"];
  const driverCol = colIdx["DRIVERS"] ?? colIdx["MOTORISTA"] ?? colIdx["MOTORISTAS"];
  const locadoraCol = colIdx["LOCADORA"] ?? colIdx["RENTADORA"];
  const statusCol = colIdx["STATUS"];
  // O texto "OBSERVAÇÕES" vem de um título de seção mesclado numa linha
  // ACIMA da linha de cabeçalho (PLACA/DRIVERS/LOCADORA/STATUS), e na
  // planilha real o próprio título mesclado não alinha com a coluna onde o
  // texto é de fato digitado (visto manualmente na fonte real). Em vez de
  // confiar no rótulo, tratamos toda coluna depois de STATUS como
  // observação de campo em texto livre — é exatamente o que a planilha
  // real usa (uma ou duas colunas de nota logo após o status).
  const colunasConhecidas = [placaCol, driverCol, locadoraCol, statusCol].filter(
    (c): c is number => c !== undefined
  );
  const primeiraColObs = Math.max(...colunasConhecidas) + 1;

  if (placaCol === undefined || statusCol === undefined) return [];

  const rows: LinhaVeiculo[] = [];
  for (let r = headerRowIdx + 1; r < values.length; r++) {
    const row = values[r] ?? [];
    const placaRaw = celula(row, placaCol).toUpperCase();
    if (!/^[A-Z0-9]{7}$/.test(placaRaw)) continue; // linha de rodapé/anotação solta: ignora

    const statusRaw = celula(row, statusCol).toUpperCase();
    const status = STATUS_MAP[statusRaw];
    if (!status) continue; // status fora do vocabulário conhecido: nunca inventa valor, ignora a linha

    const driverRaw = celula(row, driverCol);
    const driver = driverRaw && driverRaw.toUpperCase() !== "SEM DRIVERS" ? driverRaw : null;
    const locadora = celula(row, locadoraCol) || null;

    const obsParts: string[] = [];
    for (let c = primeiraColObs; c < primeiraColObs + 3 && c < row.length; c++) {
      const v = celula(row, c);
      if (v) obsParts.push(v);
    }

    rows.push({
      placa: placaRaw,
      driver,
      locadora,
      status,
      observacoes: obsParts.length ? obsParts.join(" | ") : null,
    });
  }
  return rows;
}

async function upsertLinha(
  client: import("pg").PoolClient,
  spreadsheetId: string,
  aba: string,
  row: LinhaVeiculo
): Promise<void> {
  if (row.driver) {
    await client.query(
      `INSERT INTO drivers (nome) VALUES ($1) ON CONFLICT ((lower(btrim(nome)))) DO NOTHING`,
      [row.driver]
    );
  }

  await client.query(
    `INSERT INTO vehicles (placa, base, rentadora, status, source, source_id, ingested_at)
     VALUES ($1, $2, $3, $4, 'planilha_google', $5, now())
     ON CONFLICT (placa) DO UPDATE SET
       base        = EXCLUDED.base,
       rentadora   = EXCLUDED.rentadora,
       status      = EXCLUDED.status,
       source       = EXCLUDED.source,
       source_id    = EXCLUDED.source_id,
       ingested_at  = EXCLUDED.ingested_at,
       updated_at   = now()`,
    [row.placa, aba, row.locadora, row.status, `${spreadsheetId}:${aba}:${row.placa}`]
  );

  if (row.observacoes) {
    await client.query(`UPDATE vehicles SET observacoes = $1 WHERE placa = $2`, [row.observacoes, row.placa]);
  }

  if (row.driver) {
    await client.query(
      `UPDATE vehicles SET motorista_atual_id =
         (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim($1)))
       WHERE placa = $2`,
      [row.driver, row.placa]
    );
    await client.query(
      `INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
       SELECT v.id, d.id, now()
       FROM vehicles v, drivers d
       WHERE v.placa = $1 AND lower(btrim(d.nome)) = lower(btrim($2))
       AND NOT EXISTS (
         SELECT 1 FROM vehicle_driver_history h
         WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
       )`,
      [row.placa, row.driver]
    );
  }
}

export async function syncGoogleSheets(): Promise<{
  synced: number;
  skipped?: string;
  detalhes?: Record<string, { abas: number; veiculos: number; erro?: string }>;
}> {
  if (!(await isGoogleSheetsConfigured())) {
    return {
      synced: 0,
      skipped:
        "GOOGLE_SHEETS_SPREADSHEET_IDS / GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON não configurados. " +
        "Nenhum dado sintético foi gerado — ver README, seção 'Ativando o Google Sheets de verdade'.",
    };
  }

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(env.googleSheets.serviceAccountJson);
  } catch {
    return {
      synced: 0,
      skipped:
        "GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON não é um JSON válido " +
        "(cole o conteúdo INTEIRO do arquivo da service account, entre aspas simples, numa linha só).",
    };
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  let totalSynced = 0;
  const detalhes: Record<string, { abas: number; veiculos: number; erro?: string }> = {};

  for (const spreadsheetId of env.googleSheets.spreadsheetIds) {
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetTitles = (meta.data.sheets ?? [])
        .map((s) => s.properties?.title)
        .filter((t): t is string => Boolean(t));

      let veiculosNestaPlanilha = 0;
      for (const title of sheetTitles) {
        const resp = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `'${title}'!A1:Z1000`,
        });
        const values = (resp.data.values ?? []) as unknown[][];
        const rows = parseAbaPlanilha(values);
        if (rows.length === 0) continue;

        await withRole("superadmin", "", async (client) => {
          for (const row of rows) {
            await upsertLinha(client, spreadsheetId, title, row);
          }
        });
        veiculosNestaPlanilha += rows.length;
        totalSynced += rows.length;
      }
      detalhes[spreadsheetId] = { abas: sheetTitles.length, veiculos: veiculosNestaPlanilha };
    } catch (err) {
      detalhes[spreadsheetId] = {
        abas: 0,
        veiculos: 0,
        erro: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return { synced: totalSynced, detalhes };
}
