import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

/**
 * Create a scheduled email (admin only)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const { name, sendAt, subject, text, html, templateId, filterBy } = (req.body || {}) as {
    name?: string;
    sendAt?: string;
    subject?: string;
    text?: string;
    html?: string;
    templateId?: string;
    filterBy?: {
      plan?: "Free" | "Pro" | "Elite";
      hasCompletedOnboarding?: boolean;
    };
  };

  if (!name || typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "name is required" });
  if (!sendAt || typeof sendAt !== "string") return res.status(400).json({ error: "sendAt is required (ISO string)" });
  if (!subject || typeof subject !== "string" || !subject.trim()) return res.status(400).json({ error: "subject is required" });
  if (!text || typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "text is required" });

  const sendAtMs = new Date(sendAt).getTime();
  if (!Number.isFinite(sendAtMs)) return res.status(400).json({ error: "sendAt is invalid" });

  const nowIso = new Date().toISOString();

  try {
    const ref = db.collection("scheduled_emails").doc();
    await ref.set({
      name: name.trim().slice(0, 120),
      sendAt: new Date(sendAtMs).toISOString(),
      subject: subject.trim(),
      text,
      html: html || null,
      templateId: templateId || null,
      filterBy: filterBy || null,
      status: "scheduled",
      createdAt: nowIso,
      createdBy: admin.uid,
      updatedAt: nowIso,
      updatedBy: admin.uid,
    });

    return res.status(200).json({ success: true, id: ref.id });
  } catch (e: any) {
    console.error("createScheduledEmail error:", e);
    return res.status(500).json({ error: "Failed to create scheduled email" });
  }
}


