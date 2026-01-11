import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

type InboxSource = "feedback" | "contact";

function asIso(s: any): string | null {
  if (typeof s === "string" && s.trim()) return s;
  return null;
}

function extractFeedbackText(feedback: any): string {
  const parts: string[] = [];
  try {
    const openEnded = feedback?.openEnded && typeof feedback.openEnded === "object" ? feedback.openEnded : {};
    const answers = feedback?.answers && typeof feedback.answers === "object" ? feedback.answers : {};
    parts.push(...Object.values(openEnded).map((v) => (typeof v === "string" ? v : "")));
    parts.push(...Object.values(answers).map((v) => (typeof v === "string" ? v : "")));
  } catch {}
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const limitParam = typeof req.query?.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 20), 500) : 200;

  try {
    const [feedbackSnap, contactSnap] = await Promise.all([
      db.collection("feedback_submissions").orderBy("createdAt", "desc").limit(limit).get(),
      db.collection("contact_submissions").orderBy("createdAt", "desc").limit(limit).get().catch(() => ({ docs: [] } as any)),
    ]);

    const items: any[] = [];

    for (const doc of feedbackSnap.docs) {
      const data = doc.data() as any;
      items.push({
        id: doc.id,
        source: "feedback" as InboxSource,
        createdAt: asIso(data?.createdAt) || asIso(data?.updatedAt) || new Date().toISOString(),
        updatedAt: asIso(data?.updatedAt) || null,
        uid: typeof data?.uid === "string" ? data.uid : null,
        email: typeof data?.email === "string" ? data.email : null,
        name: typeof data?.name === "string" ? data.name : null,
        category: typeof data?.category === "string" ? data.category : "general",
        text: extractFeedbackText(data),
        adminStatus: typeof data?.adminStatus === "string" ? data.adminStatus : "open",
        respondedAt: asIso(data?.respondedAt),
      });
    }

    for (const doc of contactSnap.docs) {
      const data = doc.data() as any;
      items.push({
        id: doc.id,
        source: "contact" as InboxSource,
        createdAt: asIso(data?.createdAt) || new Date().toISOString(),
        updatedAt: asIso(data?.updatedAt) || null,
        uid: typeof data?.uid === "string" ? data.uid : null,
        email: typeof data?.email === "string" ? data.email : null,
        name: typeof data?.name === "string" ? data.name : null,
        category: "contact",
        text: typeof data?.message === "string" ? data.message : "",
        adminStatus: typeof data?.adminStatus === "string" ? data.adminStatus : "open",
      });
    }

    items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    return res.status(200).json({
      success: true,
      items: items.slice(0, limit),
    });
  } catch (e: any) {
    console.error("adminGetSupportInbox error:", e);
    return res.status(500).json({ error: "Failed to fetch inbox", details: e?.message || String(e) });
  }
}


