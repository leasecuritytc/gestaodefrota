import crypto from "crypto";

/**
 * Gera um token aleatório (para convite de ativação ou redefinição de
 * senha) e já devolve o hash que vai pro banco — o token "cru" só existe
 * em memória, nunca é salvo em lugar nenhum; só ele (fora desta função)
 * prova posse do e-mail/link, e só quem recebeu o link consegue
 * reconstruí-lo a partir do que está no banco (o hash não é reversível).
 */
export function gerarToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  const hash = hashToken(token);
  return { token, hash };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
