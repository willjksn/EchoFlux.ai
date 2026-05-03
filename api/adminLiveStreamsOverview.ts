import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveAdminCreatorLabels } from "./_adminCreatorLabel.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";
import { verifyAuth } from "./verifyAuth.js";

function parseCreatorIdFromLiveStreamPath(path: string): string | null {
  const m = /^creators\/([^/]+)\/liveStreams\//.exec(path);
  return m?.[1] ?? null;
}

function updatedAtToMs(value: unknown): number {
  if (value == null) return 0;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
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

function orderCreatedAtMs(value: unknown): number {
  return updatedAtToMs(value);
}

const STATUS_KEYS = ["draft", "scheduled", "live", "ended", "cancelled"] as const;

/** US multi-region list price order of magnitude; indicative only (see Firebase console). */
const FIRESTORE_DOC_READ_USD = 0.06 / 100_000;

/** Same marginal $/participant-minute as `api/_videoUsageTracking` for Daily.co (indicative). */
const DAILY_USD_PER_PARTICIPANT_MINUTE = 0.004;
/** Rough broadcast model when we do not store per-session duration (admin estimate only). */
const BROADCAST_GUESS_AVG_MINUTES = 42;
const BROADCAST_GUESS_AVG_PARTICIPANTS = 5;
/** Matches Fan Hub Stripe `application_fee` on checkouts (`createFanCheckoutSession`). */
const FAN_HUB_PLATFORM_FEE_FRACTION = 0.1;

/**
 * GET — Platform-wide snapshot of creators' `liveStreams` subcollections + live ticket orders (admin only).
 * Used by AdminDashboard to monitor fan live streams / Daily broadcast usage across creators.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authUser = await verifyAuth(req);
  if (!authUser?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = getAdminDb();
  if (!db) {
    return res.status(500).json({ error: "Database unavailable" });
  }

  const userSnap = await db.collection("users").doc(authUser.uid).get();
  const userData = userSnap.data() as Record<string, unknown> | undefined;
  if (!hasPlatformAdminAccess(userData)) {
    return res.status(403).json({ error: "Admin access required" });
  }

  const limitParam = parseInt(String(req.query.limit || "3000"), 10);
  const maxDocs = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 100), 5000) : 3000;

  try {
    const snap = await db.collectionGroup("liveStreams").limit(maxDocs).get();
    const cutoff30d = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const byStatus: Record<string, number> = {
      draft: 0,
      scheduled: 0,
      live: 0,
      ended: 0,
      cancelled: 0,
      other: 0,
    };
    let withDailyRoom = 0;
    /** Stream docs with a Daily room whose `updatedAt` falls in the last 30 days (proxy for recent broadcast activity). */
    let streamsWithDailyRoomTouched30d = 0;
    const creatorsWithStreams = new Set<string>();

    type RecentRow = {
      creatorId: string;
      /** Resolved from `creators` / `users` for admin display */
      creatorLabel: string;
      streamId: string;
      title: string;
      status: string;
      ticketCents: number;
      hasDailyRoom: boolean;
      scheduledStart?: string;
      updatedAtMs: number;
    };
    type RecentRowDraft = Omit<RecentRow, "creatorLabel">;
    const recentBuffer: RecentRowDraft[] = [];

    snap.forEach((d) => {
      const creatorId = parseCreatorIdFromLiveStreamPath(d.ref.path);
      if (!creatorId) return;
      creatorsWithStreams.add(creatorId);

      const data = d.data() as Record<string, unknown>;
      const stRaw = String(data.status ?? "scheduled").trim().toLowerCase();
      const st = STATUS_KEYS.includes(stRaw as (typeof STATUS_KEYS)[number]) ? stRaw : "other";
      byStatus[st] = (byStatus[st] ?? 0) + 1;

      const room = typeof data.dailyRoomName === "string" ? data.dailyRoomName.trim() : "";
      if (room) withDailyRoom += 1;

      const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : "(untitled)";
      const ticketCents =
        typeof data.ticketCents === "number" && Number.isFinite(data.ticketCents)
          ? Math.max(0, Math.round(data.ticketCents))
          : 0;
      const scheduledStart =
        typeof data.scheduledStart === "string" && data.scheduledStart.trim()
          ? data.scheduledStart.trim()
          : undefined;
      const updatedAtMs = updatedAtToMs(data.updatedAt) || updatedAtToMs(data.createdAt);
      if (room && updatedAtMs >= cutoff30d) streamsWithDailyRoomTouched30d += 1;

      recentBuffer.push({
        creatorId,
        streamId: d.id,
        title,
        status: st === "other" ? stRaw || "unknown" : st,
        ticketCents,
        hasDailyRoom: !!room,
        scheduledStart,
        updatedAtMs,
      });
    });

    recentBuffer.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    const recentSlice = recentBuffer.slice(0, 200);
    const { labels: labelById, profileDocReads } = await resolveAdminCreatorLabels(
      db,
      recentSlice.map((r) => r.creatorId),
    );
    const recent: RecentRow[] = recentSlice.map((r) => ({
      ...r,
      creatorLabel: labelById[r.creatorId] ?? `${r.creatorId.slice(0, 8)}…`,
    }));

    let ticketsSold30d = 0;
    let ticketRevenueCents30d = 0;
    let orderDocsRead = 0;
    try {
      const ordersSnap = await db.collection("orders").where("type", "==", "live_stream_ticket").limit(5000).get();
      orderDocsRead = ordersSnap.size;
      ordersSnap.forEach((docSnap) => {
        const row = docSnap.data() as Record<string, unknown>;
        const st = typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
        if (st === "refunded") return;
        const ms = orderCreatedAtMs(row.createdAt);
        if (ms < cutoff30d) return;
        ticketsSold30d += 1;
        const cents =
          typeof row.amountCents === "number" && Number.isFinite(row.amountCents)
            ? Math.max(0, Math.round(row.amountCents))
            : 0;
        ticketRevenueCents30d += cents;
      });
    } catch (e) {
      console.warn("adminLiveStreamsOverview: orders scan failed", e);
    }

    const totalStreamsInSample = snap.size;
    const estimatedFirestoreReads =
      totalStreamsInSample + profileDocReads + orderDocsRead + 1; // +1 admin user doc at start
    const estimatedFirestoreReadCostUsd = estimatedFirestoreReads * FIRESTORE_DOC_READ_USD;

    /** Sum of `orders.amountCents` — gross fan checkout totals, not creator net or EchoFlux fee. */
    const ticketGrossCents30d = ticketRevenueCents30d;
    const echofluxCommissionEstimateCents30d = Math.round(ticketGrossCents30d * FAN_HUB_PLATFORM_FEE_FRACTION);
    const estimatedLiveBroadcastParticipantMinutes =
      streamsWithDailyRoomTouched30d * BROADCAST_GUESS_AVG_MINUTES * BROADCAST_GUESS_AVG_PARTICIPANTS;
    const estimatedDailyLiveBroadcastCostUsd =
      estimatedLiveBroadcastParticipantMinutes * DAILY_USD_PER_PARTICIPANT_MINUTE;

    return res.status(200).json({
      ok: true,
      sampledDocs: totalStreamsInSample,
      sampleLimit: maxDocs,
      sampleTruncated: totalStreamsInSample >= maxDocs,
      byStatus,
      withDailyRoom,
      uniqueCreatorsWithStreams: creatorsWithStreams.size,
      ticketsSold30d,
      /** @deprecated use `ticketGrossCents30d` — same value; gross fan payments */
      ticketRevenueCents30d,
      ticketGrossCents30d,
      echofluxCommissionEstimateCents30d,
      streamsWithDailyRoomTouched30d,
      estimatedLiveBroadcastParticipantMinutes,
      estimatedDailyLiveBroadcastCostUsd,
      recent,
      estimatedFirestoreReads,
      estimatedFirestoreReadCostUsd,
    });
  } catch (e) {
    console.error("adminLiveStreamsOverview:", e);
    const msg = e instanceof Error ? e.message : "Failed to load overview";
    return res.status(500).json({ error: msg });
  }
}
