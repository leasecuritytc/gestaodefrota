import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  ml: {
    baseUrl: process.env.ML_API_BASE_URL ?? "",
    clientId: process.env.ML_CLIENT_ID ?? "",
    clientSecret: process.env.ML_CLIENT_SECRET ?? "",
    accessToken: process.env.ML_ACCESS_TOKEN ?? "",
    refreshToken: process.env.ML_REFRESH_TOKEN ?? "",
  },
  vec: {
    baseUrl: process.env.VEC_API_BASE_URL ?? "",
    apiToken: process.env.VEC_API_TOKEN ?? "",
  },
  googleSheets: {
    // Uma ou mais planilhas, separadas por vírgula (uma por base, por
    // exemplo). O ID é o trecho entre /d/ e /edit na URL da planilha.
    spreadsheetIds: (process.env.GOOGLE_SHEETS_SPREADSHEET_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
    // Conteúdo COMPLETO do JSON da service account (não o caminho do
    // arquivo) — ver README para como gerar e compartilhar a planilha com
    // o e-mail da service account.
    serviceAccountJson: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON ?? "",
  },
};
