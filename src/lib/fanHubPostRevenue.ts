import { classifyFanHubOrderLedgerKind } from "./fanHubOrderLedger";

export type PostRevenueRow = {
  postId: string;
  unlocksCents: number;
  unlockCount: number;
  tipsCents: number;
  tipCount: number;
  liveTicketCents: number;
  liveTicketCount: number;
  totalCents: number;
  totalPurchaseCount: number;
};

export type PostRevenueSummary = {
  rows: PostRevenueRow[];
  totalAttributedCents: number;
  postsWithRevenue: number;
  avgRevenuePerEarningPostCents: number;
};

export type PostRevenuePostMeta = {
  id: string;
  body: string;
  thumbUrl: string | null;
  thumbIsVideo: boolean;
  likes: number;
  comments: number;
  liveStreamStreamId?: string | null;
};

export type EnrichedPostRevenueRow = PostRevenueRow & {
  body: string;
  thumbUrl: string | null;
  thumbIsVideo: boolean;
  likes: number;
  comments: number;
  vsAvgPct: number | null;
};

export function orderCreatedAtMs(order: Record<string, unknown>): number {
  const raw = order.createdAt;
  if (raw == null) return 0;
  if (typeof raw === "string") {
    const t = Date.parse(raw);
    return Number.isNaN(t) ? 0 : t;
  }
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "object" && raw !== null && "toDate" in raw) {
    const toDate = (raw as { toDate?: () => Date }).toDate;
    if (typeof toDate === "function") {
      try {
        return toDate.call(raw).getTime();
      } catch {
        return 0;
      }
    }
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  return 0;
}

export function isPaidOrderForPostRevenue(order: Record<string, unknown>): boolean {
  const status = String(order.status ?? "paid").trim().toLowerCase();
  return status !== "refunded" && status !== "canceled" && status !== "cancelled";
}

export function resolveOrderPostId(
  order: Record<string, unknown>,
  streamIdToPostId: Map<string, string>,
): string | null {
  const postId = typeof order.postId === "string" ? order.postId.trim() : "";
  if (postId) return postId;
  const streamId = typeof order.streamId === "string" ? order.streamId.trim() : "";
  if (streamId && streamIdToPostId.has(streamId)) return streamIdToPostId.get(streamId) ?? null;
  return null;
}

export function buildStreamIdToPostIdMap(
  posts: Array<{ id: string; liveStreamStreamId?: string | null }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const post of posts) {
    const streamId = post.liveStreamStreamId?.trim();
    if (streamId) map.set(streamId, post.id);
  }
  return map;
}

function emptyRow(postId: string): PostRevenueRow {
  return {
    postId,
    unlocksCents: 0,
    unlockCount: 0,
    tipsCents: 0,
    tipCount: 0,
    liveTicketCents: 0,
    liveTicketCount: 0,
    totalCents: 0,
    totalPurchaseCount: 0,
  };
}

function isLiveStreamTicketOrder(order: Record<string, unknown>): boolean {
  const raw = String(order.type ?? order.productType ?? "").trim().toLowerCase();
  return raw === "live_stream_ticket" || Boolean(typeof order.streamId === "string" && order.streamId.trim());
}

export function buildPostRevenueFromOrders(
  orders: Record<string, unknown>[],
  streamIdToPostId: Map<string, string>,
  options?: { startMs?: number | null; endMs?: number | null },
): Map<string, PostRevenueRow> {
  const byPost = new Map<string, PostRevenueRow>();
  const startMs = options?.startMs ?? null;
  const endMs = options?.endMs ?? null;

  const ensure = (postId: string): PostRevenueRow => {
    const existing = byPost.get(postId);
    if (existing) return existing;
    const row = emptyRow(postId);
    byPost.set(postId, row);
    return row;
  };

  for (const order of orders) {
    if (!isPaidOrderForPostRevenue(order)) continue;

    const ms = orderCreatedAtMs(order);
    if (startMs != null && ms > 0 && ms < startMs) continue;
    if (endMs != null && ms > 0 && ms > endMs) continue;

    const amount = Math.max(0, Math.round(Number(order.amountCents) || 0));
    if (amount <= 0) continue;

    const kind = classifyFanHubOrderLedgerKind(order);
    if (kind === "unlock") {
      const postId = resolveOrderPostId(order, streamIdToPostId);
      if (!postId) continue;
      const row = ensure(postId);
      row.unlocksCents += amount;
      row.unlockCount += 1;
      row.totalCents += amount;
      row.totalPurchaseCount += 1;
      continue;
    }

    if (kind === "tip") {
      const postId = resolveOrderPostId(order, streamIdToPostId);
      if (!postId) continue;
      const row = ensure(postId);
      row.tipsCents += amount;
      row.tipCount += 1;
      row.totalCents += amount;
      row.totalPurchaseCount += 1;
      continue;
    }

    if (isLiveStreamTicketOrder(order)) {
      const postId = resolveOrderPostId(order, streamIdToPostId);
      if (!postId) continue;
      const row = ensure(postId);
      row.liveTicketCents += amount;
      row.liveTicketCount += 1;
      row.totalCents += amount;
      row.totalPurchaseCount += 1;
    }
  }

  return byPost;
}

export function summarizePostRevenue(rows: Map<string, PostRevenueRow>): PostRevenueSummary {
  const sorted = [...rows.values()]
    .filter((r) => r.totalCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents);
  const totalAttributedCents = sorted.reduce((sum, r) => sum + r.totalCents, 0);
  return {
    rows: sorted,
    totalAttributedCents,
    postsWithRevenue: sorted.length,
    avgRevenuePerEarningPostCents:
      sorted.length > 0 ? Math.round(totalAttributedCents / sorted.length) : 0,
  };
}

export function pctVsAvg(totalCents: number, avgCents: number): number | null {
  if (avgCents <= 0) return null;
  return Math.round(((totalCents - avgCents) / avgCents) * 100);
}

export function enrichPostRevenueRows(
  summary: PostRevenueSummary,
  postMetaById: Map<string, PostRevenuePostMeta>,
): EnrichedPostRevenueRow[] {
  const avg = summary.avgRevenuePerEarningPostCents;
  return summary.rows.map((row) => {
    const meta = postMetaById.get(row.postId);
    return {
      ...row,
      body: meta?.body ?? "",
      thumbUrl: meta?.thumbUrl ?? null,
      thumbIsVideo: meta?.thumbIsVideo ?? false,
      likes: meta?.likes ?? 0,
      comments: meta?.comments ?? 0,
      vsAvgPct: pctVsAvg(row.totalCents, avg),
    };
  });
}

export function formatPostRevenueAiLines(rows: EnrichedPostRevenueRow[], limit = 5): string[] {
  return rows.slice(0, limit).map((row) => {
    const parts = [`$${(row.totalCents / 100).toFixed(2)} total`];
    if (row.unlocksCents > 0) parts.push(`$${(row.unlocksCents / 100).toFixed(2)} unlocks`);
    if (row.tipsCents > 0) parts.push(`$${(row.tipsCents / 100).toFixed(2)} tips`);
    if (row.liveTicketCents > 0) parts.push(`$${(row.liveTicketCents / 100).toFixed(2)} live tickets`);
    const engagement = `${row.likes} likes, ${row.comments} comments`;
    const vsAvg =
      row.vsAvgPct != null
        ? row.vsAvgPct >= 0
          ? `+${row.vsAvgPct}% vs avg earning post`
          : `${row.vsAvgPct}% vs avg earning post`
        : "";
    const snippet = (row.body || "Post").replace(/\s+/g, " ").trim().slice(0, 80);
    return `"${snippet}" — ${parts.join(", ")}; ${engagement}${vsAvg ? `; ${vsAvg}` : ""}`;
  });
}
