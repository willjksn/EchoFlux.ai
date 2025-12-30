import nodemailer from "nodemailer";

export type SendEmailParams = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function isMailerConfigured() {
  return !!(process.env.POSTMARK_SERVER_TOKEN || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS));
}

export async function sendEmail(params: SendEmailParams) {
  // Prefer Postmark if configured
  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
  if (postmarkToken && postmarkToken.trim()) {
    const from = process.env.POSTMARK_FROM || process.env.SMTP_FROM || "contact@echoflux.ai";
    const messageStream = process.env.POSTMARK_MESSAGE_STREAM || "outbound";

    const resp = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": postmarkToken,
      },
      body: JSON.stringify({
        From: from,
        To: params.to,
        Subject: params.subject,
        TextBody: params.text,
        HtmlBody: params.html,
        MessageStream: messageStream,
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("Postmark send failed:", { status: resp.status, data });
      return {
        sent: false as const,
        previewOnly: true as const,
        reason: "Postmark send failed",
        provider: "postmark" as const,
        error: {
          status: resp.status,
          message: (data as any)?.Message || (data as any)?.message || "Postmark request failed",
          errorCode: (data as any)?.ErrorCode ?? (data as any)?.errorCode ?? null,
        },
      };
    }

    return {
      sent: true as const,
      provider: "postmark" as const,
      messageId: data?.MessageID || data?.MessageId || "postmark",
    };
  }

  // Fallback to SMTP (nodemailer)
  if (!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)) {
    return {
      sent: false as const,
      previewOnly: true as const,
      reason: "Mailer not configured",
      provider: null,
    };
  }

  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT || "465");
  const secure = (process.env.SMTP_SECURE || "true").toLowerCase() !== "false";
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;
  const from = process.env.SMTP_FROM || `EchoFlux <${user}>`;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  const info = await transporter.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });

  return { sent: true as const, provider: "smtp" as const, messageId: info.messageId };
}


