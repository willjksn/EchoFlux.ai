import type { Firestore } from "firebase-admin/firestore";
import { isChatSessionLiveForDmNotify } from "../src/lib/chatSessionLive.js";

type ChatSessionRow = {
  status?: string;
  startedAt?: string;
  createdAt?: string;
  durationMinutes?: number;
};

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
