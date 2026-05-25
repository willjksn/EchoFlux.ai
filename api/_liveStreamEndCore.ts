import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { trackLiveBroadcastUsage } from "./_videoUsageTracking.js";

export const LIVE_STREAM_HOST_IDLE_END_MS = 5 * 60 * 1000;

export function firestoreTimeToMs(value: unknown): number {
  if (value == null) return 0;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate().getTime();
    } catch {
      return 0;
    }
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  return 0;
}

export async function syncLiveStreamPromoStatusOnPostCollections(
  db: Firestore,
  creatorId: string,
  streamId: string,
  streamStatus: "live" | "ended",
): Promise<void> {
  const paths: ReadonlyArray<readonly [string, string, string]> = [
    ["creators", creatorId, "fanPosts"],
    ["creators", creatorId, "posts"],
    ["users", creatorId, "posts"],
  ];
  const patch: Record<string, unknown> = {
    "liveStreamPromo.streamStatus": streamStatus,
    updatedAt: FieldValue.serverTimestamp(),
  };
  for (const segs of paths) {
    try {
      const col = db.collection(segs[0]).doc(segs[1]).collection(segs[2]);
      const snap = await col.where("liveStreamPromo.streamId", "==", streamId).limit(25).get();
      if (snap.empty) continue;
      await Promise.all(snap.docs.map((d) => d.ref.update(patch)));
    } catch (e) {
      console.warn("syncLiveStreamPromoStatusOnPostCollections", segs.join("/"), e);
    }
  }
}

export type EndLiveStreamResult =
  | { ok: true; alreadyEnded?: boolean; autoEnded?: boolean; participantMinutes?: number }
  | { ok: false; error: string; status: number };

/**
 * Ends a live Fan Hub broadcast: usage logging, roster clear, promo sync.
 */
export async function endLiveStreamBroadcast(
  db: Firestore,
  creatorId: string,
  streamId: string,
  options?: { autoEnded?: boolean },
): Promise<EndLiveStreamResult> {
  const streamRef = db.collection("creators").doc(creatorId).collection("liveStreams").doc(streamId);
  const snap = await streamRef.get();
  if (!snap.exists) {
    return { ok: false, error: "Stream not found", status: 404 };
  }

  const sdata = snap.data() as Record<string, unknown>;
  const status = String(sdata.status ?? "").trim().toLowerCase();
  if (status === "ended" || status === "cancelled") {
    return { ok: true, alreadyEnded: true };
  }
  if (status !== "live") {
    return { ok: false, error: "Stream is not live", status: 409 };
  }

  const usageAlreadyLogged =
    typeof sdata.usageLoggedAt === "string" && sdata.usageLoggedAt.trim().length > 0;
  let broadcastUsage: { participantMinutes: number; durationMinutes: number; viewerCount: number } | null =
    null;

  if (!usageAlreadyLogged) {
    let viewerCount = 0;
    try {
      const rosterSnap = await streamRef.collection("participants").get();
      viewerCount = rosterSnap.size;
    } catch (e) {
      console.warn("endLiveStreamBroadcast: participant roster read failed", e);
    }

    const startedMs = firestoreTimeToMs(sdata.liveStartedAt) || firestoreTimeToMs(sdata.updatedAt);
    const durationMinutes =
      startedMs > 0 ? Math.max(1, Math.ceil((Date.now() - startedMs) / 60000)) : 1;

    try {
      const { participantMinutes } = await trackLiveBroadcastUsage({
        creatorId,
        streamId,
        durationMinutes,
        viewerCount,
      });
      broadcastUsage = { participantMinutes, durationMinutes, viewerCount };
    } catch (e) {
      console.warn("trackLiveBroadcastUsage:", e);
    }
  }

  try {
    const rosterSnap = await streamRef.collection("participants").get();
    if (!rosterSnap.empty) {
      const batch = db.batch();
      for (const doc of rosterSnap.docs) batch.delete(doc.ref);
      await batch.commit();
    }
  } catch (e) {
    console.warn("endLiveStreamBroadcast: clear participants failed", e);
  }

  const endedIso = new Date().toISOString();
  await streamRef.update({
    status: "ended",
    endedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...(options?.autoEnded ? { autoEndedAt: endedIso, autoEnded: true } : {}),
    ...(broadcastUsage
      ? {
          usageLoggedAt: endedIso,
          usageParticipantMinutes: broadcastUsage.participantMinutes,
          liveDurationMinutes: broadcastUsage.durationMinutes,
          liveViewerCountAtEnd: broadcastUsage.viewerCount,
        }
      : {}),
  });

  await syncLiveStreamPromoStatusOnPostCollections(db, creatorId, streamId, "ended");

  return {
    ok: true,
    autoEnded: options?.autoEnded,
    participantMinutes: broadcastUsage?.participantMinutes,
  };
}

/** True when host left or stopped heartbeating long enough to auto-end. */
export function liveStreamEligibleForAutoEnd(
  data: Record<string, unknown>,
  nowMs = Date.now(),
): boolean {
  const status = String(data.status ?? "").trim().toLowerCase();
  if (status !== "live") return false;

  const idleMs = LIVE_STREAM_HOST_IDLE_END_MS;
  const hostLeftMs = firestoreTimeToMs(data.hostLeftAt);
  if (hostLeftMs > 0 && nowMs - hostLeftMs >= idleMs) return true;

  const hostSeenMs = firestoreTimeToMs(data.hostLastSeenAt);
  if (hostSeenMs > 0 && nowMs - hostSeenMs >= idleMs) return true;

  const startedMs = firestoreTimeToMs(data.liveStartedAt) || firestoreTimeToMs(data.updatedAt);
  if (startedMs > 0 && !hostSeenMs && nowMs - startedMs >= idleMs) return true;

  return false;
}
