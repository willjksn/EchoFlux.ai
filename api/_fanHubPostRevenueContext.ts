import type { Firestore } from "firebase-admin/firestore";
import {
  buildPostRevenueFromOrders,
  buildStreamIdToPostIdMap,
  enrichPostRevenueRows,
  formatPostRevenueAiLines,
  summarizePostRevenue,
  type PostRevenuePostMeta,
} from "../src/lib/fanHubPostRevenue.js";

export type FanHubPostRevenueAnalyticsContext = {
  topPostTypes: string[];
  avgLikes: number;
  avgComments: number;
  topEngagementTimes: string[];
  recentTips: number;
  postAttributedRevenueDollars: number;
  avgRevenuePerEarningPostDollars: number;
  postsWithRevenue: number;
  topEarningPostLines: string[];
  topEngagementPostLines: string[];
};

function parseLiveStreamStreamId(data: Record<string, unknown>): string | null {
  const raw = data.liveStreamPromo;
  if (!raw || typeof raw !== "object") return null;
  const streamId = (raw as { streamId?: unknown }).streamId;
  return typeof streamId === "string" && streamId.trim() ? streamId.trim() : null;
}

function postBodyFromDoc(data: Record<string, unknown>): string {
  for (const key of ["body", "caption", "content"]) {
    const v = data[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export async function fetchFanHubPostRevenueAnalyticsContext(
  db: Firestore,
  creatorId: string,
): Promise<FanHubPostRevenueAnalyticsContext> {
  const empty: FanHubPostRevenueAnalyticsContext = {
    topPostTypes: [],
    avgLikes: 0,
    avgComments: 0,
    topEngagementTimes: ["evenings", "weekends"],
    recentTips: 0,
    postAttributedRevenueDollars: 0,
    avgRevenuePerEarningPostDollars: 0,
    postsWithRevenue: 0,
    topEarningPostLines: [],
    topEngagementPostLines: [],
  };

  const [postsSnap, ordersSnap] = await Promise.all([
    db
      .collection("creators")
      .doc(creatorId)
      .collection("fanPosts")
      .orderBy("createdAt", "desc")
      .limit(500)
      .get()
      .catch(() => null),
    db
      .collection("orders")
      .where("creatorId", "==", creatorId)
      .limit(1000)
      .get()
      .catch(() => null),
  ]);

  const postMetaById = new Map<string, PostRevenuePostMeta>();
  const postTypes: Record<string, number> = {};
  let totalLikes = 0;
  let totalComments = 0;
  let publishedCount = 0;

  postsSnap?.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const status = String(data.status ?? "published").trim().toLowerCase();
    if (status === "draft") return;
    publishedCount += 1;
    const likes =
      typeof data.likeCount === "number"
        ? data.likeCount
        : typeof data.likesCount === "number"
          ? data.likesCount
          : typeof data.likes === "number"
            ? data.likes
            : 0;
    const comments =
      typeof data.commentsCount === "number"
        ? data.commentsCount
        : Array.isArray(data.comments)
          ? data.comments.length
          : 0;
    totalLikes += likes;
    totalComments += comments;
    const type = typeof data.mediaType === "string" ? data.mediaType : "text";
    postTypes[type] = (postTypes[type] || 0) + 1;
    postMetaById.set(doc.id, {
      id: doc.id,
      body: postBodyFromDoc(data),
      thumbUrl: null,
      thumbIsVideo: false,
      likes,
      comments,
      liveStreamStreamId: parseLiveStreamStreamId(data),
    });
  });

  const postCount = publishedCount || 1;
  const topTypes = Object.entries(postTypes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoMs = weekAgo.getTime();

  const orders: Record<string, unknown>[] = [];
  let recentTips = 0;
  ordersSnap?.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    orders.push({ ...data, id: doc.id });
    const typ = String(data.type ?? "").trim().toLowerCase();
    if (typ === "tip") {
      const raw = data.createdAt;
      let ms = 0;
      if (typeof raw === "string") ms = Date.parse(raw);
      else if (raw && typeof raw === "object" && "toDate" in raw) {
        try {
          ms = (raw as { toDate: () => Date }).toDate().getTime();
        } catch {
          ms = 0;
        }
      }
      if (ms >= weekAgoMs) recentTips += 1;
    }
  });

  const streamMap = buildStreamIdToPostIdMap([...postMetaById.values()]);
  const revenueMap = buildPostRevenueFromOrders(orders, streamMap);
  const summary = summarizePostRevenue(revenueMap);
  const enriched = enrichPostRevenueRows(summary, postMetaById);

  const topEngagement = [...postMetaById.values()]
    .filter((p) => p.likes > 0 || p.comments > 0)
    .sort((a, b) => b.likes + b.comments * 2 - (a.likes + a.comments * 2))
    .slice(0, 5)
    .map((p) => {
      const rev = revenueMap.get(p.id);
      const revLabel = rev && rev.totalCents > 0 ? `$${(rev.totalCents / 100).toFixed(2)} earned` : "$0 earned";
      const snippet = (p.body || "Post").replace(/\s+/g, " ").trim().slice(0, 80);
      return `"${snippet}" — ${p.likes} likes, ${p.comments} comments; ${revLabel}`;
    });

  return {
    topPostTypes: topTypes,
    avgLikes: Math.round(totalLikes / postCount),
    avgComments: Math.round(totalComments / postCount),
    topEngagementTimes: ["evenings", "weekends"],
    recentTips,
    postAttributedRevenueDollars: summary.totalAttributedCents / 100,
    avgRevenuePerEarningPostDollars: summary.avgRevenuePerEarningPostCents / 100,
    postsWithRevenue: summary.postsWithRevenue,
    topEarningPostLines: formatPostRevenueAiLines(enriched, 5),
    topEngagementPostLines: topEngagement,
  };
}

export function buildFanHubPostRevenuePromptBlock(ctx: FanHubPostRevenueAnalyticsContext): string {
  const earningLines =
    ctx.topEarningPostLines.length > 0
      ? ctx.topEarningPostLines.map((l) => `- ${l}`).join("\n")
      : "- No post-attributed revenue yet — prioritize locked drops, tip CTAs, and live promos.";
  const engagementLines =
    ctx.topEngagementPostLines.length > 0
      ? ctx.topEngagementPostLines.map((l) => `- ${l}`).join("\n")
      : "- Not enough engagement data yet.";

  return `
MY PAGE / FAN HUB ANALYTICS (use to tailor content — engagement AND revenue):
- Top performing post types (by volume): ${ctx.topPostTypes.length > 0 ? ctx.topPostTypes.join(", ") : "varied content"}
- Average likes per post: ${ctx.avgLikes}
- Average comments per post: ${ctx.avgComments}
- Recent tip activity: ${ctx.recentTips} tips this week
- Post-attributed revenue (unlocks + on-post tips + live tickets): $${ctx.postAttributedRevenueDollars.toFixed(2)}
- Avg revenue per earning post: $${ctx.avgRevenuePerEarningPostDollars.toFixed(2)} (${ctx.postsWithRevenue} posts with revenue)

Top earning posts (double down on these formats/topics):
${earningLines}

Top engagement posts (likes/comments — may differ from top earners):
${engagementLines}

Generate ideas that mirror patterns from BOTH lists when they align. When engagement and revenue diverge, suggest more locked/paid versions of high-engagement posts and more personality/teaser content around high-earning formats.
DO NOT include hashtags for My Page content — this is a private fan platform, not social media.
`;
}
