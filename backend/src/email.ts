import nodemailer from "nodemailer";
import { env } from "./env";

/**
 * Envio de e-mail (convite de ativação, redefinição de senha), mesmo
 * padrão dos adaptadores VEC/BSC/Google Sheets: sem SMTP_* configurado,
 * nunca finge que enviou — registra no log do servidor e devolve
 * `enviado: false`, para quem chamou decidir o que fazer (ex.: o endpoint
 * de convite ainda devolve o link na resposta, autenticada, pra quem
 * convidou poder repassar na mão).
 */

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

export function isEmailConfigurado(): boolean {
  return Boolean(env.smtp.host && env.smtp.user && env.smtp.password);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.password },
    });
  }
  return transporter;
}

export async function enviarEmail(
  destinatario: string,
  assunto: string,
  textoSimples: string,
  html: string
): Promise<{ enviado: boolean; motivo?: string }> {
  if (!isEmailConfigurado()) {
    // eslint-disable-next-line no-console
    console.log(
      `[email] SMTP não configurado — link que seria enviado para ${destinatario}:\n${textoSimples}`
    );
    return {
      enviado: false,
      motivo: "SMTP_HOST/SMTP_USER/SMTP_PASSWORD não configurados — ver README, seção 'Ativando o envio de e-mail'.",
    };
  }
  try {
    await getTransporter().sendMail({
      from: env.smtp.from || env.smtp.user,
      to: destinatario,
      subject: assunto,
      text: textoSimples,
      html,
    });
    return { enviado: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[email] Falha ao enviar:", err);
    return { enviado: false, motivo: "Falha ao enviar — ver log do servidor para detalhes." };
  }
}

export function linkConvite(token: string): string {
  return `${env.frontendBaseUrl}/ativar-conta?token=${token}`;
}

export function linkRedefinirSenha(token: string): string {
  return `${env.frontendBaseUrl}/redefinir-senha?token=${token}`;
}
