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
    // API interna do portal VEC Fleet do Mercado Livre (a mesma que o site
    // https://meli-br.vecfleet.io usa por baixo). Não é documentada: pode
    // mudar sem aviso — ver adapters/vecClient.ts.
    baseUrl: process.env.VEC_API_BASE_URL || "https://meli-br.vecfleet.io/ws/Public/index.php/api",
    // Token fixo (se um dia a VecFleet fornecer um). Se vazio, usa login.
    apiToken: process.env.VEC_API_TOKEN ?? "",
    // Login de portal — preenchido SÓ pelo dono do projeto no .env do
    // servidor. Nunca vai para o Git, nunca é logado.
    usuario: process.env.VEC_USUARIO ?? "",
    senha: process.env.VEC_SENHA ?? "",
    // Intervalo da sincronização automática, em minutos (0 = desligada).
    intervaloMin: Number(process.env.VEC_SYNC_INTERVALO_MIN ?? 120),
  },
  bsc: {
    // Segredo que o coletor (computador do dono do acesso ao BSC) usa para
    // enviar os retratos do relatório. Vazio = ingestão desligada.
    ingestToken: process.env.BSC_INGEST_TOKEN ?? "",
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
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    password: process.env.SMTP_PASSWORD ?? "",
    from: process.env.SMTP_FROM ?? "",
  },
  // Usada para montar o link de convite/redefinição de senha
  // (ex.: https://alexander-log.com.br/ativar-conta?token=...). Enquanto o
  // frontend não existir, o link não abre nada sozinho — mas o token nele
  // continua válido para ativar a conta via chamada direta à API (ver
  // README, seção "Cadastro de usuários e recuperação de senha").
  frontendBaseUrl: process.env.FRONTEND_BASE_URL ?? "https://alexander-log.com.br",
};
