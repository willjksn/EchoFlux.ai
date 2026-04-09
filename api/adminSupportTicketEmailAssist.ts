import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { checkApiKeys } from "./_errorHandler.js";
import { getModelForTask } from "./_modelRouter.js";

function hasPlatformAdminAccess(userData: Record<string, unknown> | undefined): boolean {
  if (!userData) return false;
  const role = typeof userData.role === "string" ? userData.role.trim().toLowerCase() : "";
  if (role === "admin" || role === "superadmin" || role === "owner") return true;
  if (userData.isAdmin === true || userData.isSuperAdmin === true || userData.isOwner === true) return true;
  return false;
}

function sanitizeForPrompt(s: string, max: number): string {
  const t = String(s || "")
    .replace(/```/g, "")
    .trim()
    .slice(0, max);
  return t;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authUser = await verifyAuth(req);
  if (!authUser?.uid) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  if (!db) return res.status(500).json({ error: "Database unavailable" });

  const userSnap = await db.collection("users").doc(authUser.uid).get();
  const caller = (userSnap.data() as Record<string, unknown> | undefined) ?? undefined;
  if (!hasPlatformAdminAccess(caller)) return res.status(403).json({ error: "Admin access required" });

  const ticketId =
    req.method === "GET"
      ? typeof req.query?.ticketId === "string"
        ? req.query.ticketId.trim()
        : ""
      : typeof (req.body as { ticketId?: string })?.ticketId === "string"
        ? (req.body as { ticketId: string }).ticketId.trim()
        : "";

  if (!ticketId) return res.status(400).json({ error: "ticketId is required" });

  const ticketRef = db.collection("support_tickets").doc(ticketId);
  const ticketSnap = await ticketRef.get();
  if (!ticketSnap.exists) return res.status(404).json({ error: "Ticket not found" });

  const t = ticketSnap.data() as Record<string, unknown>;

  if (req.method === "GET") {
    const msgsSnap = await ticketRef.collection("messages").get();
    const messages = msgsSnap.docs
      .map((d) => {
        const m = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          senderKind: typeof m.senderKind === "string" ? m.senderKind : "",
          senderName: typeof m.senderName === "string" ? m.senderName : "",
          content: typeof m.content === "string" ? m.content : "",
          createdAt: typeof m.createdAt === "string" ? m.createdAt : null,
          _ms: messageTimeMs(m),
        };
      })
      .sort((a, b) => a._ms - b._ms)
      .map(({ _ms: _ignored, ...rest }) => rest);

    return res.status(200).json({
      success: true,
      ticket: {
        id: ticketId,
        creatorId: typeof t.creatorId === "string" ? t.creatorId : null,
        creatorDisplayName: typeof t.creatorDisplayName === "string" ? t.creatorDisplayName : null,
        creatorHandle: typeof t.creatorHandle === "string" ? t.creatorHandle : null,
        reporterEmail: typeof t.reporterEmail === "string" ? t.reporterEmail : null,
        reporterName: typeof t.reporterName === "string" ? t.reporterName : null,
        reporterKind: t.reporterKind === "creator" ? "creator" : "fan",
        preview: typeof t.preview === "string" ? t.preview : "",
        status: t.status === "done" ? "done" : "open",
        createdAt: typeof t.createdAt === "string" ? t.createdAt : null,
      },
      messages,
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    return res.status(200).json({
      success: false,
      error: "AI not configured",
      note: apiKeyCheck.error,
    });
  }

  const msgsSnap = await ticketRef.collection("messages").get();
  const sorted = msgsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
    .sort((a, b) => messageTimeMs(a) - messageTimeMs(b));

  const threadText = sorted
    .map((m) => {
      const who =
        m.senderKind === "support" || m.senderKind === "admin"
          ? "Support"
          : typeof m.senderName === "string" && m.senderName.trim()
            ? m.senderName.trim()
            : "Reporter";
      const body = typeof m.content === "string" ? m.content : "";
      return `${who}: ${body}`;
    })
    .join("\n\n");

  const preview = sanitizeForPrompt(typeof t.preview === "string" ? t.preview : "", 800);
  const reporterKind = t.reporterKind === "creator" ? "creator" : "fan";
  const creatorLabel =
    typeof t.creatorDisplayName === "string" && t.creatorDisplayName.trim()
      ? t.creatorDisplayName.trim()
      : typeof t.creatorHandle === "string" && t.creatorHandle.trim()
        ? `@${t.creatorHandle.replace(/^@/, "")}`
        : "Platform / unassigned";

  const prompt = `You are EchoFlux platform support (echoflux.ai). Write the BODY of a resolution email only (plain text, no subject line, no "Subject:" line).

Rules:
- 2–6 short paragraphs max; professional, warm, clear.
- Reference their issue specifically based on the ticket below; do not invent details they did not report.
- If the report is vague, acknowledge that and offer concrete next steps (e.g. try again, clear cache, reply with screenshots).
- Do not promise refunds or legal outcomes unless the ticket clearly asks and you can say "we'll review."
- End with a simple sign-off: "EchoFlux Support"
- Do not use markdown code fences.

Ticket meta:
- Reporter type: ${reporterKind}
- Creator / storefront context: ${creatorLabel}
- Preview: ${preview}

Full thread:
${sanitizeForPrompt(threadText, 12000)}

Output ONLY the email body text, nothing else.`;

  try {
    const model = await getModelForTask("caption", authUser.uid);
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.45, maxOutputTokens: 1024 },
    });
    let body = result.response.text().trim();
    body = body.replace(/^```[\w]*\n?/i, "").replace(/\n?```$/i, "").trim();
    return res.status(200).json({ success: true, suggestedBody: body });
  } catch (e: unknown) {
    console.error("adminSupportTicketEmailAssist AI error:", e);
    return res.status(500).json({
      success: false,
      error: "Failed to generate draft",
      details: e instanceof Error ? e.message : String(e),
    });
  }
}
