import nodemailer from "nodemailer";

export type SendEmailParams = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function isMailerConfigured() {
  return !!(
    process.env.RESEND_API_KEY ||
    process.env.POSTMARK_SERVER_TOKEN ||
    (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  );
}

export async function sendEmail(params: SendEmailParams) {
  // Priority 1: Try Google SMTP first (most reliable for this setup)
  let smtpFailure: any = null;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const host = process.env.SMTP_HOST!;
    const port = Number(process.env.SMTP_PORT || "465");
    const secure = (process.env.SMTP_SECURE || "true").toLowerCase() !== "false";
    const user = process.env.SMTP_USER!;
    const pass = process.env.SMTP_PASS!;
    const from = process.env.SMTP_FROM || `EchoFlux <${user}>`;

    try {
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
        html: params.html || params.text.replace(/\n/g, "<br>"),
      });

      return { sent: true as const, provider: "smtp" as const, messageId: info.messageId };
    } catch (e: any) {
      console.error("SMTP send failed:", e);
      smtpFailure = e;
      // Fall through to next provider (Resend/Postmark) if configured.
    }
  }

  // Priority 2: Try Resend if configured
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey && resendApiKey.trim()) {
    const from = process.env.RESEND_FROM || process.env.SMTP_FROM || "contact@echoflux.ai";

    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Authorization": `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: from,
          to: params.to,
          subject: params.subject,
          text: params.text,
          html: params.html || params.text.replace(/\n/g, "<br>"),
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error("Resend send failed:", { status: resp.status, data });
        // Fall through to next provider
      } else {
        return {
          sent: true as const,
          provider: "resend" as const,
          messageId: data?.id || "resend",
        };
      }
    } catch (e: any) {
      console.error("Resend request error:", e);
      // Fall through to next provider
    }
  }

  // Priority 3: Try Postmark if configured
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

  // No mailer configured
  return {
    sent: false as const,
    previewOnly: true as const,
    reason: smtpFailure ? "SMTP send failed" : "Mailer not configured",
    provider: null,
    error: smtpFailure
      ? {
          message: smtpFailure?.message || "SMTP send failed",
          code: smtpFailure?.code || null,
          responseCode: smtpFailure?.responseCode || null,
          response: smtpFailure?.response || null,
        }
      : "No email provider configured (SMTP, Resend, or Postmark)",
  };
}


