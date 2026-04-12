import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { applyBrowserApiCors } from "./_browserApiCors.js";

function sanitizeAlertIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const o = body as Record<string, unknown>;
  const fromArr = Array.isArray(o.alertIds) ? o.alertIds : [];
  const single = typeof o.alertId === "string" ? [o.alertId] : [];
  const raw = [...fromArr, ...single].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  const trimmed = raw.map((id) => id.trim());
  return [...new Set(trimmed)].filter((id) => id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id));
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyBrowserApiCors(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const user = await verifyAuth(req);
    if (!user?.uid) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const db = getAdminDb();
    if (!db) {
      res.status(500).json({ error: "Database unavailable" });
      return;
    }

    const userDoc = await db.collection("users").doc(user.uid).get();
    const role = userDoc.exists ? String((userDoc.data() as { role?: string })?.role || "") : "";
    if (role !== "Admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const ids = sanitizeAlertIds(req.body);
    if (!ids.length) {
      res.status(400).json({ error: "alertId or alertIds required" });
      return;
    }

    const now = new Date().toISOString();
    const batch = db.batch();
    for (const id of ids) {
      batch.update(db.collection("admin_alerts").doc(id), { read: true, readAt: now });
    }
    await batch.commit();

    res.status(200).json({ success: true, marked: ids.length });
  } catch (e) {
    console.error("markAdminAlertRead:", e);
    if (!res.headersSent) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "Server error",
      });
    }
  }
}
