import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";

function safeString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const eventName = safeString(req.body?.eventName, 50);
  if (!eventName) {
    res.status(400).json({ error: "eventName is required" });
    return;
  }

  const path = safeString(req.body?.path, 200) || "/";
  const referrer = safeString(req.body?.referrer, 600);
  const visitorId = safeString(req.body?.visitorId, 120);
  const userAgent = safeString(req.headers["user-agent"], 220);
  const now = Date.now();

  let meta: Record<string, unknown> = {};
  if (req.body?.meta && typeof req.body.meta === "object" && !Array.isArray(req.body.meta)) {
    meta = req.body.meta as Record<string, unknown>;
  }

  try {
    const db = getAdminDb();
    await db.collection("witmeEvents").add({
      eventName,
      path,
      referrer: referrer || null,
      visitorId: visitorId || null,
      userAgent: userAgent || null,
      meta,
      createdAtMs: now,
      createdAt: new Date(now).toISOString(),
    });
  } catch (error) {
    console.error("witmeTrackEvent", error);
  }

  res.status(200).json({ success: true });
}
