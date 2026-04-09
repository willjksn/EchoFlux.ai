import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { sendEmail, isMailerConfigured } from "./_mailer.js";
import { logEmailHistory } from "./_emailHistory.js";

function hasPlatformAdminAccess(userData: Record<string, unknown> | undefined): boolean {
  if (!userData) return false;
  const role = typeof userData.role === "string" ? userData.role.trim().toLowerCase() : "";
  if (role === "admin" || role === "superadmin" || role === "owner") return true;
  if (userData.isAdmin === true || userData.isSuperAdmin === true || userData.isOwner === true) return true;
  return false;
}

function messageTimeMs(data: Record<string, unknown>): number {
  const c = data.createdAt;
  if (c && typeof (c as { toDate?: () => Date }).toDate === "function") {
    return (c as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof c === "string" || typeof c === "number") {
    const d = new Date(c);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }
  return 0;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildTicketContextBlock(
  ticketId: string,
  ticket: Record<string, unknown>,
  sortedMessages: Array<{ senderKind: string; senderName: string; content: string }>
): string {
  const creatorDisplayName =
    typeof ticket.creatorDisplayName === "string" && ticket.creatorDisplayName.trim()
      ? ticket.creatorDisplayName.trim()
      : null;
  const creatorHandle = typeof ticket.creatorHandle === "string" ? ticket.creatorHandle : null;
  const creatorLine =
    creatorDisplayName || (creatorHandle ? `@${String(creatorHandle).replace(/^@/, "")}` : "Platform / unassigned");
  const reporterName = typeof ticket.reporterName === "string" ? ticket.reporterName : "Unknown";
  const reporterKind = ticket.reporterKind === "creator" ? "creator" : "fan";
  const createdAt = typeof ticket.createdAt === "string" ? ticket.createdAt : null;
  const preview = typeof ticket.preview === "string" ? ticket.preview : "";
  const thread =
    sortedMessages.length > 0
      ? sortedMessages
          .map((m) => {
            const who =
              m.senderName?.trim() ||
              (m.senderKind === "fan" ? "Reporter" : m.senderKind || "User");
            return `${who}: ${m.content}`;
          })
          .join("\n\n")
      : preview || "(no thread text)";
  return (
    `EchoFlux support — Ticket ${ticketId}\n` +
    `Creator / storefront: ${creatorLine}\n` +
    `Reporter: ${reporterName} (${reporterKind})\n` +
    `Opened: ${createdAt ? new Date(createdAt).toLocaleString() : "—"}\n\n` +
    `--- Their report / thread ---\n${thread}\n\n` +
    `--- Our reply ---\n`
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authUser = await verifyAuth(req);
  if (!authUser?.uid) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  if (!db) return res.status(500).json({ error: "Database unavailable" });

  const userSnap = await db.collection("users").doc(authUser.uid).get();
  const caller = (userSnap.data() as Record<string, unknown> | undefined) ?? undefined;
  if (!hasPlatformAdminAccess(caller)) return res.status(403).json({ error: "Admin access required" });

  const { ticketId, replyText } = (req.body || {}) as { ticketId?: string; replyText?: string };
  const tid = typeof ticketId === "string" ? ticketId.trim() : "";
  const reply = typeof replyText === "string" ? replyText.trim() : "";
  if (!tid) return res.status(400).json({ error: "ticketId is required" });
  if (!reply) return res.status(400).json({ error: "replyText is required" });

  if (!isMailerConfigured()) {
    return res.status(503).json({
      error: "Email is not configured",
      details: "Set RESEND_API_KEY (or Postmark/SMTP) so EchoFlux can send mail.",
    });
  }

  const ticketRef = db.collection("support_tickets").doc(tid);
  const ticketSnap = await ticketRef.get();
  if (!ticketSnap.exists) return res.status(404).json({ error: "Ticket not found" });

  const ticket = ticketSnap.data() as Record<string, unknown>;
  const toRaw = typeof ticket.reporterEmail === "string" ? ticket.reporterEmail.trim() : "";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!toRaw || !emailRegex.test(toRaw.toLowerCase())) {
    return res.status(400).json({ error: "Ticket has no valid reporter email" });
  }
  const to = toRaw.toLowerCase();

  const msgsSnap = await ticketRef.collection("messages").get();
  const sorted = msgsSnap.docs
    .map((d) => {
      const m = d.data() as Record<string, unknown>;
      return {
        _ms: messageTimeMs(m),
        senderKind: typeof m.senderKind === "string" ? m.senderKind : "",
        senderName: typeof m.senderName === "string" ? m.senderName : "",
        content: typeof m.content === "string" ? m.content : "",
      };
    })
    .sort((a, b) => a._ms - b._ms)
    .map(({ _ms, ...rest }) => rest);

  const contextBlock = buildTicketContextBlock(tid, ticket, sorted);
  const fullText = `${contextBlock}${reply}`;
  const subject = `Re: EchoFlux support (ticket ${tid.slice(0, 8)}…)`;
  const html = `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap;">${escapeHtml(fullText)}</pre>`;

  try {
    const mail = await sendEmail({
      to,
      subject,
      text: fullText,
      html,
    });
    const sent = "sent" in mail && mail.sent === true;
    const provider = sent ? (mail as { provider: string }).provider : null;
    const errRaw = sent
      ? undefined
      : (mail as { error?: unknown; reason?: unknown }).error ??
        (mail as { reason?: unknown }).reason ??
        "Email send failed";

    await logEmailHistory({
      sentBy: authUser.uid,
      to,
      subject,
      body: fullText,
      html,
      status: sent ? "sent" : "failed",
      provider,
      error: errRaw !== undefined ? String(errRaw) : undefined,
      category: "other",
      metadata: { type: "support_ticket_reply", ticketId: tid },
    });

    if (!sent) {
      return res.status(502).json({
        success: false,
        error: "Send failed",
        details: String(errRaw),
        provider,
      });
    }

    return res.status(200).json({
      success: true,
      emailSent: true,
      provider,
      to,
    });
  } catch (e: unknown) {
    console.error("adminSendSupportTicketEmail:", e);
    return res.status(500).json({
      error: "Failed to send email",
      details: e instanceof Error ? e.message : String(e),
    });
  }
}
