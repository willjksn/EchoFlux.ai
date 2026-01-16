import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, getVerifyAuth } from "./_errorHandler.js";
import { searchWeb } from "./_webSearch.js";
import { getAdminDb } from "./_firebaseAdmin.js";

interface TrendData {
  category: string;
  query: string;
  results: Array<{
    title: string;
    link: string;
    snippet: string;
  }>;
  timestamp: string;
}

const adultTrendQueries = [
  {
    category: "adult_platform_updates",
    query: "OnlyFans Fansly Fanvue platform updates 2024 2025 creator changes",
  },
  {
    category: "adult_content_trends",
    query: "adult content trends 2024 2025 creator economy explicit content trends",
  },
  {
    category: "adult_ppv_trends",
    query: "PPV trends adult creators 2024 2025 pricing bundling upsells",
  },
  {
    category: "adult_bundle_strategies",
    query: "adult content bundle strategies creator bundles 2024 2025",
  },
  {
    category: "adult_session_trends",
    query: "sexting session trends adult creators tips 2024 2025",
  },
  {
    category: "adult_gfe_trends",
    query: "girlfriend experience GFE trends adult creators 2024 2025",
  },
  {
    category: "adult_interactive_trends",
    query: "interactive adult content trends polls games prompts 2024 2025",
  },
  {
    category: "compliance_onlyfans",
    query: "OnlyFans terms policy updates 2024 2025 prohibited content rules compliance creator guidelines",
  },
  {
    category: "compliance_fansly",
    query: "Fansly policy updates 2024 2025 content rules compliance creator guidelines",
  },
  {
    category: "compliance_fanvue",
    query: "Fanvue policy updates 2024 2025 content rules compliance creator guidelines",
  },
];

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const verifyAuth = await getVerifyAuth();
  const authUser = await verifyAuth(req);
  if (!authUser?.uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(authUser.uid).get();
  const adminData = adminDoc.data();
  if (adminData?.role !== "Admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const timestamp = new Date().toISOString();
  const adultTrends: TrendData[] = [];

  for (const { category, query } of adultTrendQueries) {
    try {
      const searchResult = await searchWeb(query);
      if (searchResult.success && searchResult.results.length > 0) {
        adultTrends.push({
          category,
          query,
          results: searchResult.results,
          timestamp,
        });
      }
    } catch (error: any) {
      console.error(`[adminRunAdultTrendsJob] Error fetching ${category}:`, error);
    }
  }

  if (adultTrends.length === 0) {
    res.status(200).json({
      success: false,
      note: "No adult trend results returned",
      trendsFetched: 0,
    });
    return;
  }

  const adultDoc = {
    trends: adultTrends,
    fetchedAt: timestamp,
    week: getWeekNumber(new Date()),
    year: new Date().getFullYear(),
  };

  await db
    .collection("weekly_trends_adult")
    .doc(`week_${getWeekNumber(new Date())}_${new Date().getFullYear()}`)
    .set(adultDoc, { merge: true });
  await db.collection("weekly_trends_adult").doc("latest").set(adultDoc);

  res.status(200).json({
    success: true,
    trendsFetched: adultTrends.length,
    timestamp,
  });
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export default withErrorHandling(handler);
