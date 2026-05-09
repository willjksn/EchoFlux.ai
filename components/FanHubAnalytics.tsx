import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAppContext } from "./AppContext";
import { auth, db } from "../firebaseConfig";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { formatFanDisplayLabel } from "../src/lib/fanHubDisplay";
import { inferIsAudioFromUrl, inferIsVideoFromUrl, normalizePostMediaTypes } from "../src/lib/mediaUrlInfer";
import { hasLiveStreamAccess } from "../src/utils/planAccess";
import { classifyFanHubOrderLedgerKind, isGuestCheckoutFanId } from "../src/lib/fanHubOrderLedger";

type DateRange = "7d" | "30d" | "90d" | "all";

interface RevenueMetrics {
  totalRevenueCents: number;
  tipsCents: number;
  guestTipsCents: number;
  unlocksCents: number;
  treatsCents: number;
  subscriptionsCents: number;
}

interface FanMetrics {
  /** Members on your page (prefs) plus anyone who only appears on orders — aligns with Fans tab + order-only guests */
  totalFans: number;
  /** Distinct fans with ≥1 order (tips, treats, subs, unlocks); free-only members are excluded here */
  purchasingFans: number;
  newFans: number;
  activeFans: number;
  churnedFans: number;
  /** Share of purchasing fans inactive 60+ days */
  churnRate: number;
}

interface TopFan {
  id: string;
  name: string;
  email: string;
  totalSpentCents: number;
  lastActiveAt: Date | null;
}

interface Transaction {
  id: string;
  type: "tip" | "unlock" | "treat" | "subscription";
  isGuest?: boolean;
  amountCents: number;
  fanName: string | null;
  fanEmail: string;
  createdAt: Date;
  productName?: string;
}

/** One row in the last-12-months revenue table */
interface MonthlyRow {
  key: string;
  label: string;
  totalCents: number;
  tipsCents: number;
  subscriptionsCents: number;
  storeCents: number;
  newMembers: number;
}

/** Tips + subscriptions by country on the charge (selected date range). */
interface CountrySpendRow {
  code: string;
  label: string;
  flag: string;
  subscriptionsCents: number;
  tipsCents: number;
  totalCents: number;
  chargeCount: number;
  averageChargeCents: number;
  medianChargeCents: number;
}

interface EngagementHighlight {
  postId: string;
  body: string;
  thumbUrl: string | null;
  /** First slot is video — use <video> preview; <img> fails for mp4 etc. */
  thumbIsVideo: boolean;
  likes: number;
  comments: number;
}

interface EngagementStats {
  postsThisMonth: number;
  totalLikes: number;
  topLikes: EngagementHighlight | null;
  topComments: EngagementHighlight | null;
}

/** Creator-facing live stream business metrics (no infra cost / runaway signals). */
interface LiveStreamBizMetrics {
  ticketCount: number;
  ticketGrossCents: number;
  streamTotal: number;
  /** Stream docs with createdAt or updatedAt in the selected date range */
  streamsTouchedInRange: number;
  live: number;
  scheduled: number;
  ended: number;
  draft: number;
  cancelled: number;
  other: number;
}

const DEFAULT_LIVE_STREAM_BIZ: LiveStreamBizMetrics = {
  ticketCount: 0,
  ticketGrossCents: 0,
  streamTotal: 0,
  streamsTouchedInRange: 0,
  live: 0,
  scheduled: 0,
  ended: 0,
  draft: 0,
  cancelled: 0,
  other: 0,
};

/** Default rows shown in Top Fans / Recent Transactions before "Show all". */
const FAN_HUB_ANALYTICS_LIST_PREVIEW = 10;

const TrendUpIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

const TrendDownIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </svg>
);

const DollarIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const UsersIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const HeartIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const UnlockIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
);

const GiftIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 12 20 22 4 22 4 12" />
    <rect x="2" y="7" width="20" height="5" />
    <line x1="12" y1="22" x2="12" y2="7" />
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
  </svg>
);

const StarIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const LiveStreamIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const GlobeIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

function formatCents(cents: number): string {
  return "$" + (cents / 100).toFixed(2);
}

function formatPercentage(value: number): string {
  return value.toFixed(1) + "%";
}

function getDateRangeStart(range: DateRange): Date | null {
  if (range === "all") return null;
  const now = new Date();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function firestoreTimeToMs(v: unknown): number {
  const d = parsePreferenceDate(v);
  return d ? d.getTime() : 0;
}

function liveStreamTicketStatsFromOrders(orders: Array<Record<string, unknown>>): Pick<LiveStreamBizMetrics, "ticketCount" | "ticketGrossCents"> {
  let ticketCount = 0;
  let ticketGrossCents = 0;
  for (const o of orders) {
    const t = String(o.type ?? "").trim().toLowerCase();
    if (t !== "live_stream_ticket") continue;
    const st = String(o.status ?? "paid").trim().toLowerCase();
    if (st === "refunded") continue;
    ticketCount += 1;
    const cents = o.amountCents;
    ticketGrossCents += typeof cents === "number" && Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
  }
  return { ticketCount, ticketGrossCents };
}

function bucketLiveStreamStatus(raw: unknown): "live" | "scheduled" | "ended" | "draft" | "cancelled" | "other" {
  const s = String(raw ?? "scheduled").trim().toLowerCase();
  if (s === "live") return "live";
  if (s === "scheduled") return "scheduled";
  if (s === "ended") return "ended";
  if (s === "draft") return "draft";
  if (s === "cancelled") return "cancelled";
  return "other";
}

async function loadLiveStreamBizMetrics(
  creatorUserId: string,
  rangeStart: Date | null,
  filteredOrders: Array<Record<string, unknown>>,
): Promise<LiveStreamBizMetrics> {
  const ticketStats = liveStreamTicketStatsFromOrders(filteredOrders);
  const empty: LiveStreamBizMetrics = {
    ...ticketStats,
    streamTotal: 0,
    streamsTouchedInRange: 0,
    live: 0,
    scheduled: 0,
    ended: 0,
    draft: 0,
    cancelled: 0,
    other: 0,
  };
  if (!db) return empty;

  try {
    const snap = await getDocs(collection(db, "creators", creatorUserId, "liveStreams"));
    const rs = rangeStart ? rangeStart.getTime() : null;
    let touched = 0;
    const counts = { live: 0, scheduled: 0, ended: 0, draft: 0, cancelled: 0, other: 0 };
    snap.forEach((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      const key = bucketLiveStreamStatus(d.status);
      counts[key] += 1;
      const created = firestoreTimeToMs(d.createdAt);
      const updated = firestoreTimeToMs(d.updatedAt);
      const touchMs = Math.max(created, updated);
      if (rs == null || touchMs >= rs) touched += 1;
    });
    return {
      ...ticketStats,
      streamTotal: snap.size,
      streamsTouchedInRange: touched,
      live: counts.live,
      scheduled: counts.scheduled,
      ended: counts.ended,
      draft: counts.draft,
      cancelled: counts.cancelled,
      other: counts.other,
    };
  } catch (e) {
    console.warn("FanHubAnalytics: liveStreams read failed", e);
    return empty;
  }
}

function parsePreferenceDate(v: unknown): Date | null {
  if (v == null) return null;
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    try {
      const d = (v as { toDate: () => Date }).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function csvEscapeCell(value: string | number): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function normalizeAnalyticsOrderType(order: Record<string, unknown>): "tip" | "unlock" | "subscription" | "treat" {
  return classifyFanHubOrderLedgerKind(order);
}

const UNKNOWN_BILLING_COUNTRY = "__";

function countryFlagEmoji(iso2: string): string {
  if (!/^[A-Z]{2}$/.test(iso2)) return "🌍";
  const base = 0x1f1e6;
  return (
    String.fromCodePoint(base + (iso2.charCodeAt(0) - 65)) +
    String.fromCodePoint(base + (iso2.charCodeAt(1) - 65))
  );
}

/** Median charge in cents from a sorted-low-to-high list of charge amounts. */
function medianChargeCentsSorted(sortedAsc: number[]): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return sortedAsc[mid]!;
  return Math.round((sortedAsc[mid - 1]! + sortedAsc[mid]!) / 2);
}

/** Tips + memberships in range, grouped by country on the order record. */
function buildCountrySpendRows(orders: Array<Record<string, unknown>>): CountrySpendRow[] {
  const agg = new Map<string, { subscriptionsCents: number; tipsCents: number; chargeAmountsCents: number[] }>();
  const regionNames =
    typeof Intl !== "undefined" && typeof Intl.DisplayNames !== "undefined"
      ? new Intl.DisplayNames(["en"], { type: "region" })
      : null;

  for (const o of orders) {
    const typ = normalizeAnalyticsOrderType(o);
    if (typ !== "tip" && typ !== "subscription") continue;
    const amount = Math.max(0, Math.round(Number(o.amountCents) || 0));
    if (amount <= 0) continue;
    const raw = typeof o.billingCountry === "string" ? o.billingCountry.trim().toUpperCase() : "";
    const code = /^[A-Z]{2}$/.test(raw) ? raw : UNKNOWN_BILLING_COUNTRY;
    const cur = agg.get(code) || {
      subscriptionsCents: 0,
      tipsCents: 0,
      chargeAmountsCents: [] as number[],
    };
    if (typ === "tip") cur.tipsCents += amount;
    else cur.subscriptionsCents += amount;
    cur.chargeAmountsCents.push(amount);
    agg.set(code, cur);
  }

  return [...agg.entries()]
    .map(([code, v]) => {
      const label = code === UNKNOWN_BILLING_COUNTRY ? "Unknown" : regionNames?.of(code) || code;
      const totalCents = v.subscriptionsCents + v.tipsCents;
      const sorted = [...v.chargeAmountsCents].sort((a, b) => a - b);
      const chargeCount = sorted.length;
      const averageChargeCents = chargeCount > 0 ? Math.round(totalCents / chargeCount) : 0;
      const medianChargeCents = medianChargeCentsSorted(sorted);
      return {
        code,
        label,
        flag: code === UNKNOWN_BILLING_COUNTRY ? "🌍" : countryFlagEmoji(code),
        subscriptionsCents: v.subscriptionsCents,
        tipsCents: v.tipsCents,
        totalCents,
        chargeCount,
        averageChargeCents,
        medianChargeCents,
      };
    })
    .sort((a, b) => b.totalCents - a.totalCents);
}

/** Creator-facing export labels (not internal order types). */
function orderRowExportType(typeRaw: string): string {
  const normalized = String(typeRaw || "").trim().toLowerCase();
  if (normalized === "tip") return "Tip";
  if (normalized === "unlock" || normalized === "unlock_media" || normalized === "post_unlock") return "Content unlock";
  if (normalized === "subscription") return "Subscription";
  return "Store";
}

function monthLabelShort(monthStart: Date): string {
  const m = monthStart.toLocaleDateString("en-US", { month: "short" });
  const yy = String(monthStart.getFullYear()).slice(-2);
  return `${m} ${yy}`;
}

/** Calendar year months from February through the current month (newest first). January alone if we’re in Jan. */
function buildFebThroughCurrentMonthlyRows(
  orders: Array<{ createdAt?: string; amountCents?: number; type?: string; productType?: string }>,
  prefMeta: Map<string, { createdAt: Date | null; updatedAt: Date | null }>,
  fanSpending: Map<string, { firstOrder: Date }>
): MonthlyRow[] {
  const now = new Date();
  const y = now.getFullYear();
  const cm = now.getMonth();
  const startMonth = cm >= 1 ? 1 : 0;
  const allFanIds = new Set<string>([...prefMeta.keys(), ...fanSpending.keys()]);

  const fanFirstSeen = (id: string): Date | null => {
    const meta = prefMeta.get(id);
    const spend = fanSpending.get(id);
    const times: number[] = [];
    if (meta?.createdAt) times.push(meta.createdAt.getTime());
    if (spend) times.push(spend.firstOrder.getTime());
    if (times.length === 0) return null;
    return new Date(Math.min(...times));
  };

  const rows: MonthlyRow[] = [];
  for (let m = cm; m >= startMonth; m--) {
    const monthStart = new Date(y, m, 1);
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const start = new Date(year, month, 1, 0, 0, 0, 0);
    const endCal = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const isCurrentMonth = m === cm;
    const end = isCurrentMonth ? new Date(Math.min(now.getTime(), endCal.getTime())) : endCal;

    let tipsCents = 0;
    let subscriptionsCents = 0;
    let storeCents = 0;
    for (const o of orders) {
      const orderDate = new Date(o.createdAt ?? 0);
      if (Number.isNaN(orderDate.getTime()) || orderDate < start || orderDate > end) continue;
      const amount = o.amountCents || 0;
      const typ = normalizeAnalyticsOrderType(o as Record<string, unknown>);
      if (typ === "tip") tipsCents += amount;
      else if (typ === "subscription") subscriptionsCents += amount;
      else storeCents += amount;
    }

    let newMembers = 0;
    allFanIds.forEach((id) => {
      const first = fanFirstSeen(id);
      if (first && first >= start && first <= end) newMembers++;
    });

    rows.push({
      key: `${year}-${month}`,
      label: monthLabelShort(monthStart),
      totalCents: tipsCents + subscriptionsCents + storeCents,
      tipsCents,
      subscriptionsCents,
      storeCents,
      newMembers,
    });
  }
  return rows;
}

function pickPostThumbFromDoc(x: Record<string, unknown>): { thumbUrl: string | null; thumbIsVideo: boolean } {
  const urls = Array.isArray(x.mediaUrls)
    ? (x.mediaUrls as string[]).filter((u) => typeof u === "string" && u.trim())
    : [];
  const rawTypes = Array.isArray(x.mediaTypes) ? (x.mediaTypes as string[]) : [];
  const types = normalizePostMediaTypes(urls, rawTypes);
  let firstVideo: string | null = null;
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i].trim();
    if (!u || inferIsAudioFromUrl(u)) continue;
    const isVid = types[i] === "video" || inferIsVideoFromUrl(u);
    if (!isVid) return { thumbUrl: u, thumbIsVideo: false };
    if (!firstVideo) firstVideo = u;
  }
  if (firstVideo) return { thumbUrl: firstVideo, thumbIsVideo: true };
  const single = typeof x.mediaUrl === "string" ? x.mediaUrl.trim() : "";
  if (single && !inferIsAudioFromUrl(single)) {
    return { thumbUrl: single, thumbIsVideo: inferIsVideoFromUrl(single) };
  }
  return { thumbUrl: null, thumbIsVideo: false };
}

function parseFanPostForAnalytics(docSnap: QueryDocumentSnapshot): {
  id: string;
  body: string;
  thumbUrl: string | null;
  thumbIsVideo: boolean;
  likes: number;
  comments: number;
  status: string;
  at: Date;
} | null {
  const x = docSnap.data() as Record<string, unknown>;
  const status = String(x.status ?? "published").trim().toLowerCase();
  if (status === "draft") return null;
  const raw = x.publishedAt ?? x.createdAt;
  let at = new Date(0);
  if (
    raw &&
    typeof raw === "object" &&
    "toDate" in raw &&
    typeof (raw as { toDate?: () => Date }).toDate === "function"
  ) {
    try {
      at = (raw as { toDate: () => Date }).toDate();
    } catch {
      at = new Date(0);
    }
  } else if (typeof raw === "string") {
    const d = new Date(raw);
    at = Number.isNaN(d.getTime()) ? new Date(0) : d;
  }
  const likes =
    typeof x.likeCount === "number" ? x.likeCount : typeof x.likesCount === "number" ? x.likesCount : 0;
  let comments = 0;
  if (typeof x.commentsCount === "number") comments = x.commentsCount;
  else if (Array.isArray(x.comments)) comments = x.comments.length;
  const { thumbUrl: thumb, thumbIsVideo } = pickPostThumbFromDoc(x);
  const body =
    typeof x.body === "string"
      ? x.body
      : typeof x.caption === "string"
        ? x.caption
        : typeof x.content === "string"
          ? x.content
          : "";
  return {
    id: docSnap.id,
    body: body.trim(),
    thumbUrl: thumb,
    thumbIsVideo,
    likes,
    comments,
    status,
    at,
  };
}

async function loadEngagementStats(creatorUserId: string): Promise<EngagementStats> {
  const empty: EngagementStats = {
    postsThisMonth: 0,
    totalLikes: 0,
    topLikes: null,
    topComments: null,
  };
  if (!db) return empty;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  let snapshots: QueryDocumentSnapshot[] = [];
  try {
    const pq = query(
      collection(db, "creators", creatorUserId, "fanPosts"),
      orderBy("createdAt", "desc"),
      limit(500)
    );
    snapshots = (await getDocs(pq)).docs;
  } catch {
    try {
      snapshots = (await getDocs(collection(db, "creators", creatorUserId, "fanPosts"))).docs;
    } catch {
      return empty;
    }
  }

  const parsed = snapshots
    .map(parseFanPostForAnalytics)
    .filter((p): p is NonNullable<typeof p> => p != null);
  const published = parsed.filter((p) => p.status === "published");

  let totalLikes = 0;
  let postsThisMonth = 0;
  for (const p of published) {
    totalLikes += p.likes;
    if (p.at >= monthStart && p.at <= now) postsThisMonth++;
  }

  const thisMonth = published.filter((p) => p.at >= monthStart && p.at <= now);
  let topLikes: EngagementHighlight | null = null;
  let topComments: EngagementHighlight | null = null;
  for (const p of thisMonth) {
    const h: EngagementHighlight = {
      postId: p.id,
      body: p.body,
      thumbUrl: p.thumbUrl,
      thumbIsVideo: p.thumbIsVideo,
      likes: p.likes,
      comments: p.comments,
    };
    if (!topLikes || p.likes > topLikes.likes) topLikes = h;
    if (!topComments || p.comments > topComments.comments) topComments = h;
  }

  return { postsThisMonth, totalLikes, topLikes, topComments };
}

function EngagementMediaThumb({ url, isVideo }: { url: string | null; isVideo: boolean }) {
  if (!url) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 text-center px-1">
        No media
      </div>
    );
  }
  if (isVideo) {
    const videoSrc = url.split("#")[0];
    return (
      <video
        src={videoSrc}
        className="w-full h-full object-cover bg-black"
        muted
        playsInline
        preload="metadata"
        controls={false}
        aria-hidden
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          try {
            if (Number.isFinite(v.duration) && v.duration > 0) {
              v.currentTime = Math.min(0.1, v.duration * 0.02);
            }
          } catch {
            /* ignore */
          }
        }}
      />
    );
  }
  return <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />;
}

export const FanHubAnalytics: React.FC = () => {
  const { user, showToast } = useAppContext();
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [loading, setLoading] = useState(true);
  const [revenue, setRevenue] = useState<RevenueMetrics>({
    totalRevenueCents: 0,
    tipsCents: 0,
    guestTipsCents: 0,
    unlocksCents: 0,
    treatsCents: 0,
    subscriptionsCents: 0,
  });
  const [previousRevenue, setPreviousRevenue] = useState<RevenueMetrics | null>(null);
  const [fanMetrics, setFanMetrics] = useState<FanMetrics>({
    totalFans: 0,
    purchasingFans: 0,
    newFans: 0,
    activeFans: 0,
    churnedFans: 0,
    churnRate: 0,
  });
  const [topFans, setTopFans] = useState<TopFan[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [expandTopFansList, setExpandTopFansList] = useState(false);
  const [expandRecentTransactionsList, setExpandRecentTransactionsList] = useState(false);
  /** Orders in selected date range (for CSV export). */
  const [rangeOrders, setRangeOrders] = useState<Record<string, unknown>[]>([]);
  const [countrySpendRows, setCountrySpendRows] = useState<CountrySpendRow[]>([]);
  /** Filter table to one ISO row when multiple countries appear; "all" shows every row. */
  const [countryTableFilter, setCountryTableFilter] = useState<string>("all");
  const [liveStreamBiz, setLiveStreamBiz] = useState<LiveStreamBizMetrics>(DEFAULT_LIVE_STREAM_BIZ);
  const [monthlyRows, setMonthlyRows] = useState<MonthlyRow[]>([]);
  const [engagement, setEngagement] = useState<EngagementStats>({
    postsThisMonth: 0,
    totalLikes: 0,
    topLikes: null,
    topComments: null,
  });
  const [showLast12, setShowLast12] = useState(true);
  const creatorId = auth.currentUser?.uid ?? user?.id ?? "";

  const countrySpendRowsDisplayed = useMemo(() => {
    if (countryTableFilter === "all") return countrySpendRows;
    return countrySpendRows.filter((r) => r.code === countryTableFilter);
  }, [countrySpendRows, countryTableFilter]);

  const countrySpendGrandTotalCents = useMemo(
    () => countrySpendRows.reduce((sum, r) => sum + r.totalCents, 0),
    [countrySpendRows],
  );

  useEffect(() => {
    setCountryTableFilter((prev) =>
      prev === "all" || countrySpendRows.some((r) => r.code === prev) ? prev : "all",
    );
  }, [countrySpendRows]);

  useEffect(() => {
    setExpandTopFansList(false);
    setExpandRecentTransactionsList(false);
  }, [dateRange]);

  const handleExportTransactionsCsv = useCallback(() => {
    if (rangeOrders.length === 0) {
      showToast?.("No transactions in the selected period", "info");
      return;
    }
    const header = [
      "Date",
      "Type",
      "Amount (USD)",
      "Fan name",
      "Fan email",
      "Product",
      "Order ID",
      "Country (ISO)",
    ];
    const lines = rangeOrders.map((o) => {
      const rec = o as Record<string, unknown>;
      const date =
        typeof rec.createdAt === "string" ? String(rec.createdAt).slice(0, 10) : "";
      const normalized = normalizeAnalyticsOrderType(rec);
      const type = orderRowExportType(normalized === "unlock" ? "post_unlock" : normalized);
      const amt = ((Number(rec.amountCents) || 0) / 100).toFixed(2);
      const fanName = String(rec.fanName ?? "");
      const fanEmail = String(rec.fanEmail ?? rec.fanId ?? "");
      const product = String(rec.productTitle ?? rec.productId ?? "");
      const id = String(rec.id ?? "");
      const country =
        typeof rec.billingCountry === "string" && /^[a-z]{2}$/i.test(rec.billingCountry.trim())
          ? rec.billingCountry.trim().toUpperCase()
          : "";
      return [date, type, amt, fanName, fanEmail, product, id, country].map(csvEscapeCell).join(",");
    });
    const csv = [header.map(csvEscapeCell).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fan-hub-transactions-${dateRange}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast?.("CSV downloaded", "success");
  }, [rangeOrders, dateRange, showToast]);

  const loadAnalytics = useCallback(async () => {
    if (!creatorId) return;
    setLoading(true);

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const startDate = getDateRangeStart(dateRange);

      // Overlap HTTP + Firestore reads that don't depend on each other (same results as sequential).
      const [orders, prefMeta, engagement] = await Promise.all([
        (async (): Promise<any[]> => {
          const ordersRes = await fetch(
            `/api/creatorOrders?limit=1000&creatorId=${encodeURIComponent(creatorId)}`,
            { headers }
          );
          if (!ordersRes.ok) return [];
          const data = await ordersRes.json();
          return data.orders || [];
        })(),
        (async (): Promise<Map<string, { createdAt: Date | null; updatedAt: Date | null }>> => {
          const m = new Map<string, { createdAt: Date | null; updatedAt: Date | null }>();
          try {
            const prefSnap = await getDocs(collection(db, "users", creatorId, "onlyfans_fan_preferences"));
            prefSnap.forEach((d) => {
              const data = d.data() as Record<string, unknown>;
              m.set(d.id, {
                createdAt: parsePreferenceDate(data.createdAt),
                updatedAt: parsePreferenceDate(data.updatedAt),
              });
            });
          } catch (e) {
            console.warn("FanHubAnalytics: could not load fan preferences", e);
          }
          return m;
        })(),
        loadEngagementStats(creatorId).catch((engErr: unknown) => {
          console.warn("FanHubAnalytics: engagement load failed", engErr);
          return {
            postsThisMonth: 0,
            totalLikes: 0,
            topLikes: null,
            topComments: null,
          } satisfies EngagementStats;
        }),
      ]);
      setEngagement(engagement);

      // Filter orders by date range
      const filteredOrders = orders.filter((o: any) => {
        if (!startDate) return true;
        const orderDate = new Date(o.createdAt);
        return orderDate >= startDate;
      });
      setRangeOrders(filteredOrders);

      if (hasLiveStreamAccess(user)) {
        const liveBiz = await loadLiveStreamBizMetrics(
          creatorId,
          startDate,
          filteredOrders as Record<string, unknown>[],
        );
        setLiveStreamBiz(liveBiz);
      } else {
        setLiveStreamBiz(DEFAULT_LIVE_STREAM_BIZ);
      }

      // Calculate revenue by type
      let tipsCents = 0;
      let guestTipsCents = 0;
      let unlocksCents = 0;
      let treatsCents = 0;
      let subscriptionsCents = 0;

      filteredOrders.forEach((order: any) => {
        const amount = order.amountCents || 0;
        const type = normalizeAnalyticsOrderType(order as Record<string, unknown>);
        const fanId = typeof order.fanId === "string" ? order.fanId : "";
        const isGuest = typeof fanId === "string" && isGuestCheckoutFanId(fanId);
        
        if (type === "tip") {
          tipsCents += amount;
          if (isGuest) guestTipsCents += amount;
        } else if (type === "unlock") {
          unlocksCents += amount;
        } else if (type === "subscription") {
          subscriptionsCents += amount;
        } else {
          treatsCents += amount;
        }
      });

      const totalRevenueCents = tipsCents + unlocksCents + treatsCents + subscriptionsCents;

      setRevenue({
        totalRevenueCents,
        tipsCents,
        guestTipsCents,
        unlocksCents,
        treatsCents,
        subscriptionsCents,
      });

      setCountrySpendRows(buildCountrySpendRows(filteredOrders as Record<string, unknown>[]));

      // Calculate previous period for comparison
      if (startDate && dateRange !== "all") {
        const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
        const prevStart = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000);
        const prevOrders = orders.filter((o: any) => {
          const orderDate = new Date(o.createdAt);
          return orderDate >= prevStart && orderDate < startDate;
        });

        let prevTips = 0, prevUnlocks = 0, prevTreats = 0, prevSubs = 0;
        prevOrders.forEach((order: any) => {
          const amount = order.amountCents || 0;
          const type = normalizeAnalyticsOrderType(order as Record<string, unknown>);
          if (type === "tip") prevTips += amount;
          else if (type === "unlock") prevUnlocks += amount;
          else if (type === "subscription") prevSubs += amount;
          else prevTreats += amount;
        });

        setPreviousRevenue({
          totalRevenueCents: prevTips + prevUnlocks + prevTreats + prevSubs,
          tipsCents: prevTips,
          guestTipsCents: 0,
          unlocksCents: prevUnlocks,
          treatsCents: prevTreats,
          subscriptionsCents: prevSubs,
        });
      } else {
        setPreviousRevenue(null);
      }

      // Build recent transactions list
      const transactions: Transaction[] = filteredOrders
        .slice(0, 20)
        .map((o: any) => {
          const normalizedType = normalizeAnalyticsOrderType(o as Record<string, unknown>);
          return ({
          id: o.id,
          type: normalizedType as Transaction["type"],
          isGuest: typeof o.fanId === "string" && isGuestCheckoutFanId(o.fanId),
          amountCents: o.amountCents || 0,
          fanName: o.fanName || null,
          fanEmail: o.fanEmail || o.fanId || "Unknown",
          createdAt: new Date(o.createdAt),
          productName: o.productTitle || o.productId,
        })});
      setRecentTransactions(transactions);

      // Calculate fan metrics from orders (purchasing cohort)
      const fanSpending = new Map<
        string,
        { total: number; lastActive: Date; firstOrder: Date; fanName?: string | null; fanEmail?: string | null }
      >();
      orders.forEach((o: any) => {
        const fanId = o.fanId || o.fanEmail || "unknown";
        const fanEmail = (typeof o.fanEmail === "string" && o.fanEmail) || (fanId.includes("@") ? fanId : null);
        const fanName = (typeof o.fanName === "string" && o.fanName.trim()) ? o.fanName.trim() : null;
        const existing = fanSpending.get(fanId);
        const orderDate = new Date(o.createdAt);
        if (existing) {
          existing.total += o.amountCents || 0;
          if (orderDate > existing.lastActive) existing.lastActive = orderDate;
          if (orderDate < existing.firstOrder) existing.firstOrder = orderDate;
          if (fanName && !existing.fanName) existing.fanName = fanName;
          if (fanEmail && !existing.fanEmail) existing.fanEmail = fanEmail;
        } else {
          fanSpending.set(fanId, {
            total: o.amountCents || 0,
            lastActive: orderDate,
            firstOrder: orderDate,
            fanName,
            fanEmail,
          });
        }
      });

      const purchasingFans = fanSpending.size;

      // Same member list as Fan Hub → Fans (`onlyfans_fan_preferences`), plus order-only fanIds
      const allMemberFanIds = new Set<string>(prefMeta.keys());
      orders.forEach((o: any) => {
        const fid = typeof o.fanId === "string" ? o.fanId.trim() : "";
        if (fid) allMemberFanIds.add(fid);
      });

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

      const newFanIds = new Set<string>();
      allMemberFanIds.forEach((id) => {
        const meta = prefMeta.get(id);
        const created = meta?.createdAt ?? null;
        if (created && created >= thirtyDaysAgo) {
          newFanIds.add(id);
          return;
        }
        const spend = fanSpending.get(id);
        if (spend && spend.firstOrder >= thirtyDaysAgo) {
          newFanIds.add(id);
        }
      });

      const activeFanIds = new Set<string>();
      allMemberFanIds.forEach((id) => {
        const spend = fanSpending.get(id);
        const meta = prefMeta.get(id);
        if (spend && spend.lastActive >= thirtyDaysAgo) {
          activeFanIds.add(id);
          return;
        }
        const upd = meta?.updatedAt;
        if (upd && upd >= thirtyDaysAgo) {
          activeFanIds.add(id);
          return;
        }
        const cr = meta?.createdAt;
        if (!spend && cr && cr >= thirtyDaysAgo) {
          activeFanIds.add(id);
        }
      });

      let churnedFans = 0;
      fanSpending.forEach((data) => {
        if (data.lastActive < sixtyDaysAgo && data.firstOrder < sixtyDaysAgo) churnedFans++;
      });

      const churnRate = purchasingFans > 0 ? (churnedFans / purchasingFans) * 100 : 0;

      setFanMetrics({
        totalFans: allMemberFanIds.size,
        purchasingFans,
        newFans: newFanIds.size,
        activeFans: activeFanIds.size,
        churnedFans,
        churnRate,
      });

      // Top fans by spending
      const topFansList: TopFan[] = Array.from(fanSpending.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10)
        .map(([id, data]) => ({
          id,
          name: formatFanDisplayLabel(
            { displayName: data.fanName, email: data.fanEmail },
            { fallback: id.includes("@") ? "Member" : "Fan" }
          ),
          email: data.fanEmail || (id.includes("@") ? id : id),
          totalSpentCents: data.total,
          lastActiveAt: data.lastActive,
        }));
      setTopFans(topFansList);

      setMonthlyRows(buildFebThroughCurrentMonthlyRows(orders, prefMeta, fanSpending));

    } catch (error) {
      console.error("Error loading fan hub analytics:", error);
      showToast?.("Failed to load analytics", "error");
    } finally {
      setLoading(false);
    }
  }, [creatorId, dateRange, showToast, user]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const getChangePercentage = (current: number, previous: number | undefined): number | null => {
    if (previous === undefined || previous === 0) return null;
    return ((current - previous) / previous) * 100;
  };

  const StatCard: React.FC<{
    title: string;
    value: string;
    icon: React.ReactNode;
    change?: number | null;
    subtitle?: string;
    accentColor?: string;
  }> = ({ title, value, icon, change, subtitle, accentColor = "indigo" }) => (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-5 border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</span>
        <div className={`p-2 rounded-lg bg-${accentColor}-100 dark:bg-${accentColor}-900/30 text-${accentColor}-600 dark:text-${accentColor}-400`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{value}</p>
      {change !== null && change !== undefined && (
        <div className={`flex items-center gap-1 text-sm ${change >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
          {change >= 0 ? <TrendUpIcon /> : <TrendDownIcon />}
          <span>{change >= 0 ? "+" : ""}{formatPercentage(change)} vs prev period</span>
        </div>
      )}
      {subtitle && !change && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      )}
    </div>
  );

  if (!creatorId) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">Sign in to view analytics.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-10 w-10 border-2 border-transparent mx-auto mb-4"
            style={{ borderBottomColor: "var(--fan-primary, #6366f1)" }}
          />
          <p className="text-gray-500 dark:text-gray-400">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Fan Page Analytics</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Track your earnings, fan engagement, and growth metrics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          <button
            type="button"
            onClick={() => handleExportTransactionsCsv()}
            className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            title="Download transactions for the selected period as CSV"
          >
            Export CSV
          </button>
          <button
            onClick={() => loadAnalytics()}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            title="Refresh"
          >
            <RefreshIcon />
          </button>
        </div>
      </div>

      {/* Revenue Overview */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <DollarIcon />
          Revenue Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <StatCard
            title="Total Revenue"
            value={formatCents(revenue.totalRevenueCents)}
            icon={<DollarIcon />}
            change={getChangePercentage(revenue.totalRevenueCents, previousRevenue?.totalRevenueCents)}
            accentColor="indigo"
          />
          <StatCard
            title="Tips"
            value={formatCents(revenue.tipsCents)}
            icon={<HeartIcon />}
            change={getChangePercentage(revenue.tipsCents, previousRevenue?.tipsCents)}
            accentColor="indigo"
          />
          <StatCard
            title="Guest Tips"
            value={formatCents(revenue.guestTipsCents)}
            icon={<HeartIcon />}
            subtitle="Tips from non-members"
            accentColor="indigo"
          />
          <StatCard
            title="Content Unlocks"
            value={formatCents(revenue.unlocksCents)}
            icon={<UnlockIcon />}
            change={getChangePercentage(revenue.unlocksCents, previousRevenue?.unlocksCents)}
            accentColor="purple"
          />
          <StatCard
            title="Store"
            value={formatCents(revenue.treatsCents)}
            icon={<GiftIcon />}
            change={getChangePercentage(revenue.treatsCents, previousRevenue?.treatsCents)}
            accentColor="blue"
          />
          <StatCard
            title="Subscriptions"
            value={formatCents(revenue.subscriptionsCents)}
            icon={<StarIcon />}
            change={getChangePercentage(revenue.subscriptionsCents, previousRevenue?.subscriptionsCents)}
            accentColor="green"
          />
        </div>
      </div>

      {/* Tips + memberships by country */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <GlobeIcon />
            Tips & memberships by country
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-3xl">
            Stripe checkout and renewals. Store unlocks excluded.
          </p>
          {countrySpendRows.length > 1 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label htmlFor="fan-hub-country-filter" className="text-sm text-gray-600 dark:text-gray-400">
                Filter
              </label>
              <select
                id="fan-hub-country-filter"
                className="text-sm rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                value={countryTableFilter}
                onChange={(e) => setCountryTableFilter(e.target.value)}
              >
                <option value="all">All countries</option>
                {countrySpendRows.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                    {r.code !== UNKNOWN_BILLING_COUNTRY ? ` (${r.code})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {countrySpendRows.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
            No tips or subscription charges with country in this period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-600 dark:text-gray-300">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Country</th>
                  <th
                    className="text-right px-4 py-3 font-semibold whitespace-nowrap"
                    title="Share of all tips and memberships in this period (all countries)"
                  >
                    Share
                  </th>
                  <th
                    className="text-right px-4 py-3 font-semibold min-w-[7.5rem]"
                    title="Tips vs memberships by amount for this country"
                  >
                    Tips / subs
                  </th>
                  <th className="text-right px-4 py-3 font-semibold">Subscriptions</th>
                  <th className="text-right px-4 py-3 font-semibold">Tips</th>
                  <th className="text-right px-4 py-3 font-semibold">Total</th>
                  <th
                    className="text-right px-4 py-3 font-semibold whitespace-nowrap"
                    title="Average amount per tip or membership charge"
                  >
                    Avg
                  </th>
                  <th
                    className="text-right px-4 py-3 font-semibold whitespace-nowrap"
                    title="Median amount per tip or membership charge"
                  >
                    Median
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {countrySpendRowsDisplayed.map((row) => {
                  const sharePct =
                    countrySpendGrandTotalCents > 0
                      ? Math.min(100, (100 * row.totalCents) / countrySpendGrandTotalCents)
                      : 0;
                  const tipsMixPct = row.totalCents > 0 ? (100 * row.tipsCents) / row.totalCents : 0;
                  const subsMixPct = row.totalCents > 0 ? (100 * row.subscriptionsCents) / row.totalCents : 0;
                  return (
                    <tr key={row.code} className="text-gray-800 dark:text-gray-200">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="mr-2" aria-hidden>
                          {row.flag}
                        </span>
                        <span className="font-medium">{row.label}</span>
                        {row.code !== UNKNOWN_BILLING_COUNTRY ? (
                          <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{row.code}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-col items-end gap-1 min-w-[5.5rem]">
                          <div
                            className="h-2 w-20 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
                            role="img"
                            aria-label={`${formatPercentage(sharePct)} of period tips and memberships`}
                          >
                            <div
                              className="h-full rounded-full bg-indigo-500 dark:bg-indigo-400"
                              style={{ width: `${sharePct}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-gray-600 dark:text-gray-400">
                            {formatPercentage(sharePct)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-col items-end gap-1">
                          <div
                            className="flex h-2 w-[7rem] rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800"
                            role="img"
                            aria-label={`Tips ${formatPercentage(tipsMixPct)}, memberships ${formatPercentage(subsMixPct)}`}
                          >
                            {subsMixPct > 0 ? (
                              <div
                                className="h-full bg-emerald-500 dark:bg-emerald-600 shrink-0"
                                style={{ width: `${subsMixPct}%` }}
                                title={`Memberships ${formatPercentage(subsMixPct)}`}
                              />
                            ) : null}
                            {tipsMixPct > 0 ? (
                              <div
                                className="h-full bg-amber-400 dark:bg-amber-500 shrink-0"
                                style={{ width: `${tipsMixPct}%` }}
                                title={`Tips ${formatPercentage(tipsMixPct)}`}
                              />
                            ) : null}
                          </div>
                          <span className="text-[10px] leading-tight text-gray-500 dark:text-gray-400 max-w-[7rem] text-right">
                            {formatPercentage(tipsMixPct)} tips · {formatPercentage(subsMixPct)} subs
                          </span>
                        </div>
                      </td>
                      <td className="text-right px-4 py-3 tabular-nums">{formatCents(row.subscriptionsCents)}</td>
                      <td className="text-right px-4 py-3 tabular-nums">{formatCents(row.tipsCents)}</td>
                      <td className="text-right px-4 py-3 font-semibold tabular-nums">{formatCents(row.totalCents)}</td>
                      <td className="text-right px-4 py-3 tabular-nums text-gray-700 dark:text-gray-300">
                        {row.chargeCount > 0 ? formatCents(row.averageChargeCents) : "—"}
                      </td>
                      <td className="text-right px-4 py-3 tabular-nums text-gray-700 dark:text-gray-300">
                        {row.chargeCount > 0 ? formatCents(row.medianChargeCents) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Live streams — Elite (and Agency); skips liveStreams subcollection reads on Pro */}
      {hasLiveStreamAccess(user) ? (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            <LiveStreamIcon />
            Live streams
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-2xl">
            Ticket sales use the date range above. Total streams is all-time; streams active in the period had a create or update during the selected range.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Ticket gross"
              value={formatCents(liveStreamBiz.ticketGrossCents)}
              icon={<DollarIcon />}
              subtitle="Non-refunded live stream tickets in period"
              accentColor="indigo"
            />
            <StatCard
              title="Tickets sold"
              value={liveStreamBiz.ticketCount.toLocaleString()}
              icon={<StarIcon />}
              subtitle="Orders in selected period"
              accentColor="purple"
            />
            <StatCard
              title="Streams (total)"
              value={liveStreamBiz.streamTotal.toLocaleString()}
              icon={<LiveStreamIcon />}
              subtitle="All stream rows in your hub"
              accentColor="blue"
            />
            <StatCard
              title="Streams (active in period)"
              value={liveStreamBiz.streamsTouchedInRange.toLocaleString()}
              icon={<LiveStreamIcon />}
              subtitle={dateRange === "all" ? "Same as total (all time)" : "Created or updated in range"}
              accentColor="green"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ["Live", liveStreamBiz.live],
                ["Scheduled", liveStreamBiz.scheduled],
                ["Ended", liveStreamBiz.ended],
                ["Draft", liveStreamBiz.draft],
                ["Cancelled", liveStreamBiz.cancelled],
                ["Other", liveStreamBiz.other],
              ] as const
            ).map(([label, n]) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/80 px-3 py-1 text-xs text-gray-700 dark:text-gray-300"
              >
                <span className="font-medium">{label}</span>
                <span className="tabular-nums text-gray-500 dark:text-gray-400">{n}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Fan Metrics */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <UsersIcon />
          Fan Metrics
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard
            title="Total fans"
            value={fanMetrics.totalFans.toLocaleString()}
            icon={<UsersIcon />}
            subtitle="Free + paid members"
          />
          <StatCard
            title="Purchasing fans"
            value={fanMetrics.purchasingFans.toLocaleString()}
            icon={<DollarIcon />}
            subtitle="At least one tip, sub, treat, or unlock"
          />
          <StatCard
            title="New fans"
            value={fanMetrics.newFans.toLocaleString()}
            icon={<UsersIcon />}
            subtitle="Joined or first purchase, last 30 days"
          />
          <StatCard
            title="Active fans"
            value={fanMetrics.activeFans.toLocaleString()}
            icon={<UsersIcon />}
            subtitle="Order or profile activity, last 30 days"
          />
          <StatCard
            title="Churned (paying)"
            value={fanMetrics.churnedFans.toLocaleString()}
            icon={<UsersIcon />}
            subtitle="No purchase activity 60+ days"
          />
          <StatCard
            title="Churn rate"
            value={formatPercentage(fanMetrics.churnRate)}
            icon={<TrendDownIcon />}
            subtitle={
              fanMetrics.purchasingFans === 0
                ? "No purchase history yet"
                : fanMetrics.churnRate > 10
                  ? "Of purchasing fans — consider re-engagement"
                  : "Of purchasing fans"
            }
            accentColor={fanMetrics.churnRate > 10 ? "red" : "green"}
          />
        </div>
      </div>

      {/* Monthly revenue: Feb → current month; Hide = this month only */}
      <section
        className="rounded-2xl border p-5 sm:p-6"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--fan-primary, #be185d) 5%, var(--fan-bg, #ffffff)) 0%, var(--fan-bg, #ffffff) 100%)",
          borderColor: "color-mix(in srgb, var(--fan-primary, #be185d) 20%, var(--fan-border, #e5e7eb))",
        }}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-1 h-5 rounded-full shrink-0"
              style={{ background: "var(--fan-primary, #be185d)" }}
              aria-hidden
            />
            <h2
              className="text-xs sm:text-sm font-semibold tracking-[0.12em] uppercase truncate"
              style={{ color: "var(--fan-text, #111827)" }}
            >
              {showLast12 ? "Monthly revenue (Feb – now)" : "This month"}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowLast12((v) => !v)}
            className="text-sm font-medium shrink-0 hover:opacity-80"
            style={{ color: "var(--fan-primary, #be185d)" }}
          >
            {showLast12 ? "Hide" : "Show"}
          </button>
        </div>
        {(() => {
          const tableRows = showLast12 ? monthlyRows : monthlyRows.slice(0, 1);
          if (tableRows.length === 0) {
            return (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No months in range yet.
              </p>
            );
          }
          return (
            <>
              <div className="bg-white dark:bg-gray-900/40 rounded-xl border border-black/[0.06] dark:border-white/10 overflow-x-auto shadow-sm">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr
                      className="text-left border-b border-gray-100 dark:border-gray-700"
                      style={{ color: "color-mix(in srgb, var(--fan-text, #111827) 45%, transparent)" }}
                    >
                      <th className="py-3 px-3 text-[10px] sm:text-xs font-medium uppercase tracking-wider">Month</th>
                      <th className="py-3 px-3 text-[10px] sm:text-xs font-medium uppercase tracking-wider">Total</th>
                      <th className="py-3 px-3 text-[10px] sm:text-xs font-medium uppercase tracking-wider">Tips</th>
                      <th className="py-3 px-3 text-[10px] sm:text-xs font-medium uppercase tracking-wider">Subscriptions</th>
                      <th className="py-3 px-3 text-[10px] sm:text-xs font-medium uppercase tracking-wider">Store</th>
                      <th className="py-3 px-3 text-[10px] sm:text-xs font-medium uppercase tracking-wider">New members</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row) => (
                      <tr
                        key={row.key}
                        className="border-b border-gray-100 dark:border-gray-700/80 last:border-0"
                      >
                        <td className="py-3 px-3 text-gray-700 dark:text-gray-300">{row.label}</td>
                        <td
                          className="py-3 px-3 font-semibold tabular-nums"
                          style={{ color: "var(--fan-primary, #be185d)" }}
                        >
                          {formatCents(row.totalCents)}
                        </td>
                        <td className="py-3 px-3 text-gray-600 dark:text-gray-400 tabular-nums">
                          {formatCents(row.tipsCents)}
                        </td>
                        <td className="py-3 px-3 text-gray-600 dark:text-gray-400 tabular-nums">
                          {formatCents(row.subscriptionsCents)}
                        </td>
                        <td className="py-3 px-3 text-gray-600 dark:text-gray-400 tabular-nums">
                          {formatCents(row.storeCents)}
                        </td>
                        <td className="py-3 px-3 text-gray-600 dark:text-gray-400 tabular-nums">
                          {row.newMembers}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs" style={{ color: "color-mix(in srgb, var(--fan-text, #111827) 50%, transparent)" }}>
                {showLast12
                  ? "February through the current month this calendar year. Totals use your most recent 1,000 orders. Store includes treats and content unlocks."
                  : "Current month only. Use Show for February through today."}
              </p>
            </>
          );
        })()}
      </section>

      {/* Content & engagement — fan feed posts */}
      <section
        className="rounded-2xl border p-5 sm:p-6"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--fan-primary, #be185d) 5%, var(--fan-bg, #ffffff)) 0%, var(--fan-bg, #ffffff) 100%)",
          borderColor: "color-mix(in srgb, var(--fan-primary, #be185d) 20%, var(--fan-border, #e5e7eb))",
        }}
      >
        <div className="flex items-center gap-2 mb-5">
          <span
            className="w-1 h-5 rounded-full shrink-0"
            style={{ background: "var(--fan-primary, #be185d)" }}
            aria-hidden
          />
          <h2
            className="text-xs sm:text-sm font-semibold tracking-[0.12em] uppercase"
            style={{ color: "var(--fan-text, #111827)" }}
          >
            Content &amp; engagement
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div className="bg-white dark:bg-gray-900/40 rounded-xl border border-black/[0.06] dark:border-white/10 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Posts this month</p>
            <p
              className="text-3xl font-bold tabular-nums"
              style={{ color: "var(--fan-primary, #be185d)" }}
            >
              {engagement.postsThisMonth}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Feed posts</p>
          </div>
          <div className="bg-white dark:bg-gray-900/40 rounded-xl border border-black/[0.06] dark:border-white/10 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Total likes</p>
            <p
              className="text-3xl font-bold tabular-nums"
              style={{ color: "var(--fan-primary, #be185d)" }}
            >
              {engagement.totalLikes.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Across all published posts</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(["likes", "comments"] as const).map((kind) => {
            const h = kind === "likes" ? engagement.topLikes : engagement.topComments;
            const title = kind === "likes" ? "Most likes" : "Most comments";
            return (
              <div
                key={kind}
                className="bg-white dark:bg-gray-900/40 rounded-xl border border-black/[0.06] dark:border-white/10 p-4 shadow-sm"
              >
                <p className="font-semibold text-base" style={{ color: "var(--fan-primary, #be185d)" }}>
                  {title}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">This month</p>
                {h ? (
                  <div className="flex gap-3">
                    <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                      <EngagementMediaThumb url={h.thumbUrl} isVideo={h.thumbIsVideo} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">{h.body || "—"}</p>
                      <p className="mt-2 text-sm font-medium tabular-nums" style={{ color: "var(--fan-primary, #be185d)" }}>
                        {kind === "likes" ? `${h.likes} likes` : `${h.comments} comments`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No published posts this month yet.
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs" style={{ color: "color-mix(in srgb, var(--fan-text, #111827) 50%, transparent)" }}>
          Highlights use up to 500 recent feed posts. Totals count all published posts in that set.
        </p>
      </section>

      {/* Two Column Layout: Top Fans & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Fans */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <StarIcon />
              Top Fans by Spending
            </h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {topFans.length === 0 ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                No fan data yet. Earnings will appear here as fans purchase.
              </div>
            ) : (
              (expandTopFansList ? topFans : topFans.slice(0, FAN_HUB_ANALYTICS_LIST_PREVIEW)).map((fan, index) => (
                <div key={fan.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      index === 0 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                      index === 1 ? "bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300" :
                      index === 2 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                      "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{fan.name}</p>
                      {fan.email && fan.email.includes("@") && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{fan.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-indigo-600 dark:text-indigo-400">{formatCents(fan.totalSpentCents)}</p>
                    {fan.lastActiveAt && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {fan.lastActiveAt.toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          {topFans.length > FAN_HUB_ANALYTICS_LIST_PREVIEW && (
            <div className="p-3 border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setExpandTopFansList((v) => !v)}
                className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {expandTopFansList ? "Show less" : `Show all (${topFans.length})`}
              </button>
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <DollarIcon />
              Recent Transactions
            </h3>
          </div>
          <div
            className={
              expandRecentTransactionsList
                ? "divide-y divide-gray-100 dark:divide-gray-700 max-h-[400px] overflow-y-auto"
                : "divide-y divide-gray-100 dark:divide-gray-700"
            }
          >
            {recentTransactions.length === 0 ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                No transactions yet. They'll appear here when fans make purchases.
              </div>
            ) : (
              (expandRecentTransactionsList
                ? recentTransactions
                : recentTransactions.slice(0, FAN_HUB_ANALYTICS_LIST_PREVIEW)
              ).map((tx) => (
                <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      tx.type === "tip" ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400" :
                      tx.type === "unlock" ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" :
                      tx.type === "subscription" ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" :
                      "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                    }`}>
                      {tx.type === "tip" ? <HeartIcon /> :
                       tx.type === "unlock" ? <UnlockIcon /> :
                       tx.type === "subscription" ? <StarIcon /> :
                       <GiftIcon />}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {tx.type === "tip" ? "Tip" :
                         tx.type === "unlock" ? "Content Unlock" :
                         tx.type === "subscription" ? "Subscription" :
                         tx.productName || "Store purchase"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatFanDisplayLabel(
                          { displayName: tx.fanName, email: tx.fanEmail },
                          { fallback: "Member" }
                        )}
                        {tx.fanEmail && tx.fanEmail !== "Unknown" && tx.fanEmail.includes("@") && (
                          <span className="block text-[11px] opacity-80 mt-0.5">{tx.fanEmail}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 dark:text-white">{formatCents(tx.amountCents)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {tx.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          {recentTransactions.length > FAN_HUB_ANALYTICS_LIST_PREVIEW && (
            <div className="p-3 border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setExpandRecentTransactionsList((v) => !v)}
                className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {expandRecentTransactionsList ? "Show less" : `Show all (${recentTransactions.length})`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Insights — tint from creator Fan Hub theme (--fan-* set on PremiumStudioLayout) */}
      <div
        className="rounded-xl p-6 border"
        style={{
          background:
            "linear-gradient(90deg, color-mix(in srgb, var(--fan-primary, #6366f1) 12%, var(--fan-bg, #ffffff)) 0%, color-mix(in srgb, var(--fan-primary, #6366f1) 7%, var(--fan-bg, #ffffff)) 100%)",
          borderColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 28%, var(--fan-border, #e5e7eb))",
        }}
      >
        <h3 className="font-semibold mb-3" style={{ color: "var(--fan-text, #111827)" }}>
          Quick Insights
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-4">
            <p className="font-medium text-gray-900 dark:text-white mb-1">Top Revenue Source</p>
            <p className="text-gray-600 dark:text-gray-400">
              {revenue.tipsCents >= revenue.unlocksCents && revenue.tipsCents >= revenue.treatsCents ? "Tips" :
               revenue.unlocksCents >= revenue.treatsCents ? "Content Unlocks" : "Store"}
              {" "}is your biggest earner
            </p>
          </div>
          <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-4">
            <p className="font-medium text-gray-900 dark:text-white mb-1">Fan Engagement</p>
            <p className="text-gray-600 dark:text-gray-400">
              {fanMetrics.activeFans > 0 
                ? `${Math.round((fanMetrics.activeFans / fanMetrics.totalFans) * 100)}% of fans active this month`
                : "Start building your fan base!"}
            </p>
          </div>
          <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-4">
            <p className="font-medium text-gray-900 dark:text-white mb-1">Growth Opportunity</p>
            <p className="text-gray-600 dark:text-gray-400">
              {fanMetrics.churnedFans > 0 
                ? `Re-engage ${fanMetrics.churnedFans} inactive fans with exclusive content`
                : "Great retention! Keep engaging your fans"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
