/**
 * Shared rules for whether a premium chat session is truly in progress.
 * Used by API (DM notify guard) and client (Fan Hub bell / badges).
 */
export type ChatSessionLiveFields = {
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

export function isChatSessionLiveForDmNotify(data: ChatSessionLiveFields, nowMs = Date.now()): boolean {
  const st = typeof data.status === "string" ? data.status.trim().toLowerCase() : "";
  if (st !== "active" && st !== "paused") return false;

  const startedAtMs = toMs(data.startedAt) || toMs(data.createdAt);
  const durationMinutes =
    typeof data.durationMinutes === "number" && Number.isFinite(data.durationMinutes)
      ? Math.max(1, Math.min(180, Math.round(data.durationMinutes)))
      : 15;

  if (startedAtMs <= 0) return false;

  const endsAtMs = startedAtMs + durationMinutes * 60_000;
  return nowMs < endsAtMs;
}
