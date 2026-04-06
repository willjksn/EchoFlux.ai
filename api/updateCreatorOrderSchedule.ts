import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

type Body = {
  orderId?: string;
  scheduleStatus?: "pending" | "scheduled" | "completed" | "cancelled";
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  deliveryStatus?: "pending" | "delivered";
  deliveryType?: "video" | "audio" | "text" | "link" | null;
  deliveryText?: string | null;
  deliveryUrl?: string | null;
};

/**
 * POST: Creator updates scheduling fields on a top-level orders/{orderId} doc they own.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (req.body || {}) as Body;
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (!orderId) {
    return res.status(400).json({ error: "orderId is required" });
  }

  const allowed = new Set(["pending", "scheduled", "completed", "cancelled"]);
  const scheduleStatus =
    typeof body.scheduleStatus === "string" && allowed.has(body.scheduleStatus)
      ? body.scheduleStatus
      : undefined;
  const allowedDeliveryStatuses = new Set(["pending", "delivered"]);
  const deliveryStatus =
    typeof body.deliveryStatus === "string" && allowedDeliveryStatuses.has(body.deliveryStatus)
      ? body.deliveryStatus
      : undefined;
  const allowedDeliveryTypes = new Set(["video", "audio", "text", "link"]);
  const deliveryType =
    typeof body.deliveryType === "string" && allowedDeliveryTypes.has(body.deliveryType)
      ? body.deliveryType
      : body.deliveryType === null
        ? null
        : undefined;

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const ref = db.collection("orders").doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Order not found" });
    }
    const data = snap.data() as { creatorId?: string } | undefined;
    if (data?.creatorId !== decoded.uid) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (scheduleStatus !== undefined) {
      patch.scheduleStatus = scheduleStatus;
    }
    if (body.scheduledDate !== undefined) {
      patch.scheduledDate = body.scheduledDate && String(body.scheduledDate).trim() ? String(body.scheduledDate).trim() : null;
    }
    if (body.scheduledTime !== undefined) {
      patch.scheduledTime = body.scheduledTime && String(body.scheduledTime).trim() ? String(body.scheduledTime).trim() : null;
    }
    if (deliveryStatus !== undefined) {
      patch.deliveryStatus = deliveryStatus;
      if (deliveryStatus === "delivered") {
        patch.deliveredAt = new Date().toISOString();
        patch.deliveredBy = decoded.uid;
      }
    }
    if (deliveryType !== undefined) {
      patch.deliveryType = deliveryType;
    }
    if (body.deliveryText !== undefined) {
      const t = typeof body.deliveryText === "string" ? body.deliveryText.trim() : "";
      patch.deliveryText = t || null;
    }
    if (body.deliveryUrl !== undefined) {
      const u = typeof body.deliveryUrl === "string" ? body.deliveryUrl.trim() : "";
      patch.deliveryUrl = u || null;
    }

    await ref.set(patch, { merge: true });
    return res.status(200).json({ ok: true });
  } catch (e: unknown) {
    console.error("updateCreatorOrderSchedule error:", e);
    return res.status(500).json({ error: "Failed to update order" });
  }
}
