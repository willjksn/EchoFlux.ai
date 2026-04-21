import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import type { LiveStreamEventStatus, LiveStreamPromoOnPost } from "../../types";

const ALLOWED: LiveStreamEventStatus[] = ["draft", "scheduled", "live", "ended", "cancelled"];

function normStatus(raw: unknown): LiveStreamEventStatus | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  return ALLOWED.includes(t as LiveStreamEventStatus) ? (t as LiveStreamEventStatus) : null;
}

/**
 * Live `status` on `creators/{creatorId}/liveStreams/{streamId}` (authoritative for go-live / end).
 * Denormalized `fanPosts.liveStreamPromo.streamStatus` can lag; merging fixes stale Watch live CTAs.
 */
export function useCreatorLiveStreamStatuses(creatorId: string | undefined, streamIds: string[]): Record<string, LiveStreamEventStatus> {
  const [map, setMap] = useState<Record<string, LiveStreamEventStatus>>({});
  const key = useMemo(() => [...new Set(streamIds)].filter(Boolean).sort().join("\x1e"), [streamIds]);

  useEffect(() => {
    if (!creatorId || !db) return;
    const ids = key ? key.split("\x1e").filter(Boolean) : [];
    if (ids.length === 0) {
      setMap({});
      return;
    }
    const unsubs: Unsubscribe[] = [];
    for (const streamId of ids) {
      const ref = doc(db, "creators", creatorId, "liveStreams", streamId);
      unsubs.push(
        onSnapshot(
          ref,
          (snap) => {
            if (!snap.exists()) {
              setMap((prev) => {
                if (!(streamId in prev)) return prev;
                const next = { ...prev };
                delete next[streamId];
                return next;
              });
              return;
            }
            const st = normStatus((snap.data() as { status?: unknown })?.status);
            if (!st) return;
            setMap((prev) => (prev[streamId] === st ? prev : { ...prev, [streamId]: st }));
          },
          () => {
            /* permission-denied or transport: keep post denorm only */
          },
        ),
      );
    }
    return () => unsubs.forEach((u) => u());
  }, [creatorId, key]);

  return map;
}

export function mergeLiveStreamPromoWithLiveDocStatus(
  promo: LiveStreamPromoOnPost,
  liveByStreamId: Record<string, LiveStreamEventStatus>,
): LiveStreamPromoOnPost {
  const st = liveByStreamId[promo.streamId];
  if (st) return { ...promo, streamStatus: st };
  return promo;
}

/**
 * After this much time past `scheduledStart`, fan UI treats `live` / `scheduled` as over so CTAs don’t
 * stay “On air” / “Watch live” when the host closed without End or denormalized status never updated.
 */
const FAN_STREAM_STALE_AFTER_SCHEDULED_START_MS = 10 * 60 * 60 * 1000;

/**
 * Status used for fan-facing promo (member feed / storefront). Does not affect creator dashboard.
 */
export function fanEffectiveStreamStatus(promo: LiveStreamPromoOnPost): LiveStreamEventStatus | undefined {
  const base = promo.streamStatus;
  if (base === "ended" || base === "cancelled") return base;

  const startIso = promo.scheduledStart?.trim();
  if (!startIso) return base;

  const t = new Date(startIso).getTime();
  if (Number.isNaN(t)) return base;
  if (Date.now() <= t + FAN_STREAM_STALE_AFTER_SCHEDULED_START_MS) return base;

  if (!base || base === "draft" || base === "live" || base === "scheduled") return "ended";
  return base;
}
