import { sendEmail } from "./_mailer.js";
import { logEmailHistory } from "./_emailHistory.js";

/**
 * Transactional “we received your ticket” email + Email Center history (category other).
 */
export async function sendSupportTicketAcknowledgmentEmail(params: {
  to: string | null | undefined;
  reporterName: string;
  ticketId: string;
}): Promise<void> {
  const to = typeof params.to === "string" ? params.to.trim().toLowerCase() : "";
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;

  const name = params.reporterName?.trim() || "there";
  const subject = "We received your support request — EchoFlux";
  const text =
    `Hi ${name},\n\n` +
    `Thanks for contacting EchoFlux support. We've received your report and our team will review it shortly.\n\n` +
    `When you're signed in, you can continue the conversation from your profile under IT support threads.\n\n` +
    `Reference: ${params.ticketId}\n\n` +
    `— EchoFlux Support`;

  const html = `<p>Hi ${escapeHtml(name)},</p>
<p>Thanks for contacting EchoFlux support. We've received your report and our team will review it shortly.</p>
<p>When you're signed in, you can continue the conversation from your profile under <strong>IT support threads</strong>.</p>
<p><strong>Reference:</strong> ${escapeHtml(params.ticketId)}</p>
<p>— EchoFlux Support</p>`;

  try {
    const mail = await sendEmail({ to, subject, text, html });
    const sent = "sent" in mail && mail.sent === true;
    const provider = sent ? (mail as { provider: string }).provider : null;
    const errRaw = sent
      ? undefined
      : (mail as { error?: unknown; reason?: unknown }).error ??
        (mail as { reason?: unknown }).reason ??
        "Email send failed";
    await logEmailHistory({
      sentBy: null,
      to,
      subject,
      body: text,
      html,
      status: sent ? "sent" : "failed",
      provider,
      error: errRaw !== undefined ? String(errRaw) : undefined,
      category: "other",
      metadata: { type: "support_ticket_auto_ack", ticketId: params.ticketId },
    });
  } catch (e) {
    console.error("sendSupportTicketAcknowledgmentEmail:", e);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
