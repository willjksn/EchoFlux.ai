const lastFanDmMarkReadAt = new Map<string, number>();
/** Coalesce silent DM polls + rapid re-opens (POST touches Firestore). */
const FAN_DM_MARK_READ_MIN_INTERVAL_MS = 12_000;

/**
 * After the fan loads DM history, persist creator-sent read receipts (non-blocking).
 */
export async function fanDmMarkReadAfterOpen(params: {
  threadId: string;
  responseFanId: string | undefined;
  authUid: string | null | undefined;
  getIdToken: () => Promise<string | null>;
}): Promise<void> {
  const { threadId, responseFanId, authUid, getIdToken } = params;
  const tid = threadId.trim();
  if (!tid || !authUid || !responseFanId || responseFanId !== authUid) return;
  const now = Date.now();
  const prev = lastFanDmMarkReadAt.get(tid) ?? 0;
  if (now - prev < FAN_DM_MARK_READ_MIN_INTERVAL_MS) return;
  const token = await getIdToken();
  if (!token) return;
  try {
    const res = await fetch("/api/fanDmMarkRead", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ threadId: tid }),
    });
    if (res.ok) lastFanDmMarkReadAt.set(tid, Date.now());
  } catch {
    /* ignore */
  }
}
