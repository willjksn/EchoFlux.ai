import type { DocumentData, Firestore, QueryDocumentSnapshot, UpdateData } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

/** UTC calendar parts for purchases UI (`scheduledDate` / `scheduledTime` on orders). */
function schedulePartsFromIso(scheduledStart: string): { date: string; time: string } | null {
  const t = Date.parse(scheduledStart);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return { date: `${y}-${m}-${day}`, time: `${hh}:${mm}` };
}

/**
 * Keeps `orders` rows for `live_stream_ticket` in sync with `creators/{creatorId}/liveStreams/{streamId}`:
 * - Stream scheduled (with start time) → ticket orders show as scheduled in Purchases.
 * - Stream ended → ticket orders show delivered for fan + creator.
 */
export async function syncLiveStreamTicketOrdersForStream(
  db: Firestore,
  creatorId: string,
  streamId: string
): Promise<void> {
  const cid = creatorId.trim();
  const sid = streamId.trim();
  if (!cid || !sid) return;

  const streamRef = db.collection("creators").doc(cid).collection("liveStreams").doc(sid);
  const streamSnap = await streamRef.get();

  let status: string;
  let parts: ReturnType<typeof schedulePartsFromIso> | null;
  if (!streamSnap.exists) {
    /** Stream doc removed after the event (or rare bad state) — still close out ticket rows. */
    status = "ended";
    parts = null;
  } else {
    const s = streamSnap.data() as Record<string, unknown>;
    status = String(s.status ?? "scheduled").trim().toLowerCase();
    const scheduledStartRaw = typeof s.scheduledStart === "string" ? s.scheduledStart.trim() : "";
    parts = scheduledStartRaw ? schedulePartsFromIso(scheduledStartRaw) : null;
  }

  let docs: QueryDocumentSnapshot[];
  try {
    const ordersSnap = await db
      .collection("orders")
      .where("creatorId", "==", cid)
      .where("streamId", "==", sid)
      .limit(500)
      .get();
    docs = ordersSnap.docs;
  } catch (e) {
    console.warn("syncLiveStreamTicketOrdersForStream: indexed query failed, using fallback", e);
    const fallback = await db.collection("orders").where("creatorId", "==", cid).limit(2500).get();
    docs = fallback.docs.filter((d) => {
      const x = d.data() as Record<string, unknown>;
      return String(x.streamId || "").trim() === sid;
    });
  }

  const nowIso = new Date().toISOString();
  let batch = db.batch();
  let ops = 0;

  const commitIfNeeded = async (force: boolean) => {
    if (ops === 0) return;
    if (force || ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  for (const doc of docs) {
    const data = doc.data() as Record<string, unknown>;
    const typ = String(data.type || "").trim().toLowerCase();
    if (typ !== "live_stream_ticket") continue;

    const patch: Record<string, unknown> = {};

    if (status === "ended") {
      if (data.deliveryStatus !== "delivered") patch.deliveryStatus = "delivered";
      if (data.scheduleStatus !== "completed") patch.scheduleStatus = "completed";
      if (!data.deliveredAt) patch.deliveredAt = nowIso;
      if (parts) {
        if (!data.scheduledDate) patch.scheduledDate = parts.date;
        if (!data.scheduledTime) patch.scheduledTime = parts.time;
      }
    } else if (status === "cancelled") {
      if (data.scheduleStatus !== "cancelled") patch.scheduleStatus = "cancelled";
    } else if (parts && (status === "scheduled" || status === "live" || status === "draft")) {
      const alreadyDone =
        data.scheduleStatus === "completed" || data.deliveryStatus === "delivered";
      if (!alreadyDone) {
        patch.scheduleStatus = "scheduled";
        patch.scheduledDate = parts.date;
        patch.scheduledTime = parts.time;
      }
    }

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = FieldValue.serverTimestamp();
      batch.update(doc.ref, patch as UpdateData<DocumentData>);
      ops++;
      await commitIfNeeded(false);
    }
  }

  await commitIfNeeded(true);
}
