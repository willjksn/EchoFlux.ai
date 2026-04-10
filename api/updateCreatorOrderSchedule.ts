import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { creatorIdFirestoreQueryVariants, normalizeCreatorId } from "../src/lib/creatorIdNormalize.js";
import {
  sendCreatorHubNotification,
  sendFanNotification,
  upsertOrderSessionFiveMinuteReminder,
} from "./_fanNotifications.js";
import {
  isJointLiveSessionProductId,
  jointSessionKindFromProductId,
} from "../src/lib/treatSessionClassification.js";

type Body = {
  orderId?: string;
  scheduleStatus?: "pending" | "scheduled" | "completed" | "cancelled";
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  deliveryStatus?: "pending" | "delivered";
  deliveryType?: "video" | "image" | "audio" | "text" | "link" | null;
  deliveryText?: string | null;
  deliveryUrl?: string | null;
  /** ISO timestamp for the scheduled session start (creator's local picker from Fan Hub Purchases). Used for 5‑minute fan reminders. */
  scheduledStartIso?: string | null;
};

function localScheduleParts(now: Date): { date: string; time: string } {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}` };
}

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
  const allowedDeliveryTypes = new Set(["video", "image", "audio", "text", "link"]);
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
    const data = snap.data() as {
      creatorId?: string;
      fanId?: string;
      productTitle?: string;
      productId?: string;
      type?: string;
      scheduleStatus?: "pending" | "scheduled" | "completed" | "cancelled";
      scheduledDate?: string | null;
      scheduledTime?: string | null;
    } | undefined;
    const storedCreatorRaw = typeof data?.creatorId === "string" ? data.creatorId.trim() : "";
    const storedCreatorId = normalizeCreatorId(storedCreatorRaw);
    const callerCreatorId = normalizeCreatorId(decoded.uid);

    const storedCandidateIds = new Set<string>();
    for (const v of creatorIdFirestoreQueryVariants(storedCreatorRaw)) storedCandidateIds.add(normalizeCreatorId(v));
    // Legacy pollution seen in some docs: "<uid>-<email>".
    if (storedCreatorRaw.includes("@")) {
      const dash = storedCreatorRaw.lastIndexOf("-");
      if (dash > 0) {
        const maybeUid = normalizeCreatorId(storedCreatorRaw.slice(0, dash));
        if (maybeUid) storedCandidateIds.add(maybeUid);
      }
    }
    if (storedCreatorId) storedCandidateIds.add(storedCreatorId);

    const callerCandidateIds = new Set<string>();
    for (const v of creatorIdFirestoreQueryVariants(decoded.uid)) callerCandidateIds.add(normalizeCreatorId(v));
    if (callerCreatorId) callerCandidateIds.add(callerCreatorId);

    const ownsOrder = Array.from(callerCandidateIds).some((id) => id && storedCandidateIds.has(id));
    if (!ownsOrder) {
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
        const deliveredAt = new Date();
        patch.deliveredAt = deliveredAt.toISOString();
        patch.deliveredBy = decoded.uid;
        // Delivery should no longer appear as "needs scheduling".
        // If not explicitly provided, auto-schedule to the delivery timestamp.
        if (scheduleStatus === undefined && data?.scheduleStatus !== "completed") {
          patch.scheduleStatus = "scheduled";
        }
        const localNow = localScheduleParts(deliveredAt);
        if (body.scheduledDate === undefined) {
          patch.scheduledDate = localNow.date;
        }
        if (body.scheduledTime === undefined) {
          patch.scheduledTime = localNow.time;
        }
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

    const productIdForKind =
      typeof data?.productId === "string" && data.productId.trim()
        ? data.productId.trim()
        : typeof data?.type === "string" && data.type.trim()
          ? data.type.trim()
          : "";

    // Joint live video / chat sessions: notify fan + creator when a time is set (async treats: no schedule ping).
    // Skip when this same request is marking delivered — avoid "session scheduled" when completing delivery.
    if (
      scheduleStatus === "scheduled" &&
      deliveryStatus !== "delivered" &&
      isJointLiveSessionProductId(productIdForKind)
    ) {
      const fanId = typeof data?.fanId === "string" ? data.fanId.trim() : "";
      const dateAfter =
        patch.scheduledDate !== undefined
          ? (patch.scheduledDate as string | null)
          : data?.scheduledDate ?? null;
      const timeAfter =
        patch.scheduledTime !== undefined
          ? (patch.scheduledTime as string | null)
          : data?.scheduledTime ?? null;
      const dateStr = dateAfter && String(dateAfter).trim() ? String(dateAfter).trim() : "";
      const timeStr = timeAfter && String(timeAfter).trim() ? String(timeAfter).trim() : "";
      const when =
        dateStr && timeStr ? `${dateStr} at ${timeStr}` : dateStr ? dateStr : timeStr ? timeStr : "the scheduled time";
      const itemName =
        typeof data?.productTitle === "string" && data.productTitle.trim()
          ? data.productTitle.trim()
          : productIdForKind || "your session";
      const jointKind = jointSessionKindFromProductId(productIdForKind);
      const fanTitle = jointKind === "video_call" ? "Video call scheduled" : "Chat session scheduled";
      const fanBody = `Your session (${itemName}) is set for ${when}. Open Purchases for details.`;
      const creatorTitle = jointKind === "video_call" ? "Video call scheduled" : "Chat session scheduled";
      const creatorBody = `You scheduled ${itemName} with a fan for ${when}.`;

      if (fanId && !fanId.startsWith("guest_")) {
        try {
          await sendFanNotification({
            fanId,
            type: "live_session_scheduled",
            title: fanTitle,
            body: fanBody,
            data: {
              orderId,
              creatorId: storedCreatorId,
              jointKind,
              destination: "purchases",
            },
          });
        } catch (e) {
          console.error("updateCreatorOrderSchedule: fan schedule notification failed", e);
        }
      }

      if (storedCreatorId) {
        try {
          await sendCreatorHubNotification({
            creatorId: storedCreatorId,
            type: "live_session_scheduled",
            title: creatorTitle,
            body: creatorBody,
            data: {
              orderId,
              fanId,
              jointKind,
              destination: jointKind === "video_call" ? "videoChats" : "sessions",
            },
          });
        } catch (e) {
          console.error("updateCreatorOrderSchedule: creator schedule notification failed", e);
        }
      }

      const fanUid = fanId && !fanId.startsWith("guest_") ? fanId : "";
      const isoRaw =
        typeof body.scheduledStartIso === "string" && body.scheduledStartIso.trim()
          ? body.scheduledStartIso.trim()
          : "";
      if (fanUid && isoRaw) {
        const sessionStart = new Date(isoRaw);
        if (!Number.isNaN(sessionStart.getTime())) {
          try {
            await upsertOrderSessionFiveMinuteReminder({
              orderId,
              fanId: fanUid,
              jointKind,
              sessionStart,
              itemName,
              whenLabel: when,
              creatorId: storedCreatorId || storedCreatorRaw,
            });
          } catch (e) {
            console.error("updateCreatorOrderSchedule: 5min reminder upsert failed", e);
          }
        }
      }
    }

    // Notify fan when creator marks this purchase as delivered.
    if (deliveryStatus === "delivered") {
      const fanId = typeof data?.fanId === "string" ? data.fanId.trim() : "";
      if (fanId) {
        const title = "Your purchase is ready";
        const itemName =
          typeof data?.productTitle === "string" && data.productTitle.trim()
            ? data.productTitle.trim()
            : typeof data?.productId === "string" && data.productId.trim()
              ? data.productId.trim()
              : "your item";
        const bodyText = `Your creator delivered ${itemName}. Open Purchases to view it.`;
        try {
          await sendFanNotification({
            fanId,
            type: "purchase_confirmed",
            title,
            body: bodyText,
            data: {
              orderId,
              creatorId: storedCreatorId,
              destination: "purchases",
            },
          });
        } catch (notifyErr) {
          console.error("updateCreatorOrderSchedule: fan notification failed", notifyErr);
        }
      }
    }
    return res.status(200).json({ ok: true });
  } catch (e: unknown) {
    console.error("updateCreatorOrderSchedule error:", e);
    return res.status(500).json({ error: "Failed to update order" });
  }
}
