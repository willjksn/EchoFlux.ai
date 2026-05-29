import type { Firestore } from "firebase-admin/firestore";

type ChatSessionRow = {
  status?: string;
  startedAt?: string;
  createdAt?: string;
  durationMinutes?: number;
};

function toMs(iso: unknown): number {
  if (typeof iso !== "string" || !iso.trim()) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Premium chat session still in progress (matches `api/chatSession.ts` expiry rules).
 * Expired rows still marked active/paused are NOT live — DM notifications should fire again.
 */
export function isChatSessionLiveForDmNotify(data: ChatSessionRow, nowMs = Date.now()): boolean {
  const st = typeof data.status === "string" ? data.status.trim().toLowerCase() : "";
  if (st !== "active" && st !== "paused") return false;

  const startedAtMs = toMs(data.startedAt) || toMs(data.createdAt);
  const durationMinutes =
    typeof data.durationMinutes === "number" && Number.isFinite(data.durationMinutes)
      ? Math.max(1, Math.min(180, Math.round(data.durationMinutes)))
      : 15;

  if (startedAtMs <= 0) return true;

  const endsAtMs = startedAtMs + durationMinutes * 60_000;
  return nowMs < endsAtMs;
}

function isExpiredActiveOrPausedSession(data: ChatSessionRow, nowMs: number): boolean {
  const st = typeof data.status === "string" ? data.status.trim().toLowerCase() : "";
  if (st !== "active" && st !== "paused") return false;
  return !isChatSessionLiveForDmNotify(data, nowMs);
}

/**
 * True when a non-expired active/paused chat session exists for this DM thread.
 * Best-effort: marks time-expired sessions as ended (same as GET /api/chatSession).
 */
export async function hasLiveChatSessionForDmThread(
  db: Firestore,
  creatorId: string,
  threadId: string,
): Promise<boolean> {
  const snap = await db
    .collection("chatSessions")
    .where("creatorId", "==", creatorId)
    .where("threadId", "==", threadId)
    .limit(40)
    .get();

  const nowMs = Date.now();
  let anyLive = false;
  const expiredIds: string[] = [];

  snap.forEach((d) => {
    const data = d.data() as ChatSessionRow;
    if (isChatSessionLiveForDmNotify(data, nowMs)) {
      anyLive = true;
      return;
    }
    if (isExpiredActiveOrPausedSession(data, nowMs)) {
      expiredIds.push(d.id);
    }
  });

  if (expiredIds.length > 0) {
    const nowIso = new Date(nowMs).toISOString();
    await Promise.all(
      expiredIds.map((id) =>
        db
          .collection("chatSessions")
          .doc(id)
          .set({ status: "ended", endedAt: nowIso, updatedAt: nowIso }, { merge: true })
          .catch(() => undefined),
      ),
    );
  }

  return anyLive;
}
