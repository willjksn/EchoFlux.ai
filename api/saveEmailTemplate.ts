import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

/**
 * Create/update an email template (admin only)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const { id, name, subject, text, html } = (req.body || {}) as {
    id?: string;
    name?: string;
    subject?: string;
    text?: string;
    html?: string;
  };

  if (!name || typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "name is required" });
  if (!subject || typeof subject !== "string" || !subject.trim()) return res.status(400).json({ error: "subject is required" });
  if (!text || typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "text is required" });
  if (html && typeof html !== "string") return res.status(400).json({ error: "html must be a string" });

  const nowIso = new Date().toISOString();

  try {
    const docRef = id && typeof id === "string" && id.trim() ? db.collection("email_templates").doc(id.trim()) : db.collection("email_templates").doc();
    const payload = {
      name: name.trim().slice(0, 120),
      subject: subject.trim().slice(0, 200),
      text: text,
      html: html ? html : null,
      updatedAt: nowIso,
      updatedBy: admin.uid,
    } as any;

    const existing = await docRef.get();
    if (!existing.exists) {
      payload.createdAt = nowIso;
      payload.createdBy = admin.uid;
    }

    await docRef.set(payload, { merge: true });

    return res.status(200).json({ success: true, id: docRef.id });
  } catch (e: any) {
    console.error("saveEmailTemplate error:", e);
    return res.status(500).json({ error: "Failed to save email template" });
  }
}


