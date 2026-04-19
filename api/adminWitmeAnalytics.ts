import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";
import { verifyAuth } from "./verifyAuth.js";

type EventDoc = {
  eventName?: string;
  path?: string;
  referrer?: string | null;
  visitorId?: string | null;
  createdAtMs?: number;
  meta?: Record<string, unknown>;
};

function parseReferrerHost(referrer?: string | null): string {
  if (!referrer) return "direct";
  try {
    const u = new URL(referrer);
    return u.hostname || "direct";
  } catch {
    return "direct";
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authUser = await verifyAuth(req);
  if (!authUser?.uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const db = getAdminDb();
  const userSnap = await db.collection("users").doc(authUser.uid).get();
  if (!hasPlatformAdminAccess(userSnap.data() as Record<string, unknown> | undefined)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const days = Math.min(Math.max(Number(req.query.days || 30), 1), 180);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  try {
    const snap = await db.collection("witmeEvents").where("createdAtMs", ">=", cutoff).limit(20000).get();
    const events = snap.docs.map((d) => d.data() as EventDoc);

    const byPath: Record<string, number> = {};
    const byEvent: Record<string, number> = {};
    const byReferrer: Record<string, number> = {};
    const daily: Record<string, { totalEvents: number; pageViews: number; creatorCardClicks: number }> = {};
    const creatorClicksByHandle: Record<string, number> = {};
    const uniqueVisitors = new Set<string>();
    let pageViews = 0;
    let homePageViews = 0;
    let discoverPageViews = 0;
    let creatorPageViews = 0;
    let exploreClicks = 0;
    let creatorCardClicks = 0;
    let legalLinkClicks = 0;

    for (const row of events) {
      const eventName = typeof row.eventName === "string" && row.eventName ? row.eventName : "unknown";
      const path = typeof row.path === "string" && row.path ? row.path : "/";
      const createdAtMs = typeof row.createdAtMs === "number" ? row.createdAtMs : 0;
      const dayKey = createdAtMs > 0 ? new Date(createdAtMs).toISOString().slice(0, 10) : "unknown";
      const refHost = parseReferrerHost(row.referrer);
      const visitorId = typeof row.visitorId === "string" ? row.visitorId : "";
      const meta = row.meta && typeof row.meta === "object" ? row.meta : {};

      byEvent[eventName] = (byEvent[eventName] || 0) + 1;
      byReferrer[refHost] = (byReferrer[refHost] || 0) + 1;
      daily[dayKey] = daily[dayKey] || { totalEvents: 0, pageViews: 0, creatorCardClicks: 0 };
      daily[dayKey].totalEvents += 1;

      if (eventName === "page_view") {
        byPath[path] = (byPath[path] || 0) + 1;
        pageViews += 1;
        daily[dayKey].pageViews += 1;
        if (path === "/") {
          homePageViews += 1;
        } else if (path === "/discover") {
          discoverPageViews += 1;
        } else {
          creatorPageViews += 1;
        }
      } else if (eventName === "explore_click") {
        exploreClicks += 1;
      } else if (eventName === "creator_card_click") {
        creatorCardClicks += 1;
        daily[dayKey].creatorCardClicks += 1;
        const handleRaw = typeof meta.handle === "string" ? meta.handle.trim().toLowerCase() : "";
        const handle = handleRaw.replace(/^@+/, "");
        if (handle) {
          creatorClicksByHandle[handle] = (creatorClicksByHandle[handle] || 0) + 1;
        }
      } else if (eventName === "legal_link_click") {
        legalLinkClicks += 1;
      }
      if (visitorId) uniqueVisitors.add(visitorId);
    }

    const topPaths = Object.entries(byPath)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const topReferrers = Object.entries(byReferrer)
      .map(([host, count]) => ({ host, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    const dailySeries = Object.entries(daily)
      .filter(([date]) => date !== "unknown")
      .map(([date, counts]) => ({
        date,
        totalEvents: counts.totalEvents,
        pageViews: counts.pageViews,
        creatorCardClicks: counts.creatorCardClicks,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    const topCreatorClicks = Object.entries(creatorClicksByHandle)
      .map(([handle, clicks]) => ({ handle: `@${handle}`, clicks }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 20);

    const toPct = (n: number, d: number): number => {
      if (!d) return 0;
      return Math.round((n / d) * 10000) / 100;
    };

    const funnel = {
      homePageViews,
      exploreClicks,
      creatorCardClicks,
      exploreRateFromHomePct: toPct(exploreClicks, homePageViews),
      creatorClickRateFromExplorePct: toPct(creatorCardClicks, exploreClicks),
      creatorClickRateFromHomePct: toPct(creatorCardClicks, homePageViews),
    };

    const ctaCtr = {
      exploreFromAllViewsPct: toPct(exploreClicks, pageViews),
      creatorCardFromAllViewsPct: toPct(creatorCardClicks, pageViews),
      legalLinksFromAllViewsPct: toPct(legalLinkClicks, pageViews),
    };

    res.status(200).json({
      success: true,
      days,
      totals: {
        events: events.length,
        pageViews,
        uniqueVisitors: uniqueVisitors.size,
        homePageViews,
        discoverPageViews,
        creatorPageViews,
        exploreClicks,
        creatorCardClicks,
        legalLinkClicks,
      },
      byEvent,
      topPaths,
      topReferrers,
      dailySeries,
      topCreatorClicks,
      funnel,
      ctaCtr,
    });
  } catch (error) {
    console.error("adminWitmeAnalytics", error);
    res.status(500).json({ error: "Failed to load witme analytics" });
  }
}
