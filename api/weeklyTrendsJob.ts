/**
 * Weekly Tavily Trends Job
 * 
 * This job runs weekly (via Vercel Cron or external scheduler) to fetch
 * current social media trends and store them for use across the app.
 * 
 * The trends are stored in Firestore and can be accessed by any Gemini endpoint
 * to ensure AI suggestions stay current with social media best practices.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { searchWeb } from "./_webSearch.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { requireCronAuth } from "./_cronAuth.js";

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

/**
 * Fetch and store weekly social media trends
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Allow both GET (for cron) and POST (for manual trigger)
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Require cron auth (manual smoke test via CRON_SECRET, or Vercel cron markers)
  if (!requireCronAuth(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      console.log("[WeeklyTrendsJob] TAVILY_API_KEY not configured, skipping");
      res.status(200).json({
        success: false,
        note: "TAVILY_API_KEY not configured",
      });
      return;
    }

    console.log("[WeeklyTrendsJob] Starting weekly trends fetch...");

    // Define trend categories and queries
    const trendQueries = [
      {
        category: "general_social_media_trends",
        query: "social media trends 2024 2025 algorithm updates",
      },
      // Weekly compliance / policy checks (to keep guidance current)
      {
        category: "compliance_general",
        query: "social media policy updates 2024 2025 community guidelines changes creator compliance",
      },
      {
        category: "compliance_instagram",
        query: "Instagram community guidelines policy updates 2024 2025 creator content restrictions",
      },
      {
        category: "compliance_tiktok",
        query: "TikTok community guidelines policy updates 2024 2025 creator content restrictions",
      },
      {
        category: "compliance_x",
        query: "X (Twitter) policy updates 2024 2025 sensitive media rules creator guidelines",
      },
      {
        category: "compliance_threads",
        query: "Threads policy updates 2024 2025 community guidelines changes",
      },
      {
        category: "compliance_facebook",
        query: "Facebook community standards policy updates 2024 2025 content rules",
      },
      {
        category: "compliance_onlyfans",
        query: "OnlyFans terms policy updates 2024 2025 prohibited content rules compliance creator guidelines",
      },
      {
        category: "instagram_trends",
        query: "Instagram algorithm updates 2024 2025 best practices Reels",
      },
      {
        category: "tiktok_trends",
        query: "TikTok trends 2024 2025 algorithm changes best practices",
      },
      {
        category: "content_creator_tips",
        query: "content creator best practices 2024 2025 social media tips",
      },
      {
        category: "engagement_strategies",
        query: "social media engagement strategies 2024 2025 increase engagement",
      },
      {
        category: "hashtag_strategies",
        query: "social media hashtag strategy 2024 2025 trending hashtags",
      },
      {
        category: "video_content_trends",
        query: "video content trends 2024 2025 short-form video Reels Shorts",
      },
      {
        category: "platform_updates",
        query: "social media platform updates 2024 2025 new features",
      },
      {
        category: "onlyfans_creator_tips",
        query: "OnlyFans creator tips strategies best practices 2024 2025",
      },
      {
        category: "onlyfans_monetization_strategies",
        query: "OnlyFans monetization strategies tips revenue 2024 2025",
      },
      {
        category: "onlyfans_platform_updates",
        query: "OnlyFans platform updates features changes 2024 2025",
      },
      {
        category: "onlyfans_engagement_tactics",
        query: "OnlyFans subscriber engagement strategies retention 2024 2025",
      },
      {
        category: "onlyfans_content_ideas",
        query: "OnlyFans content ideas adult content creator tips 2024 2025",
      },
      {
        category: "onlyfans_photo_shoot_concepts",
        query: "OnlyFans photoshoot ideas concepts adult content 2024 2025",
      },
      {
        category: "onlyfans_girlfriend_experience",
        query: "OnlyFans girlfriend experience GFE content strategies 2024 2025",
      },
      {
        category: "onlyfans_subscriber_retention",
        query: "OnlyFans subscriber retention strategies keep fans engaged 2024 2025",
      },
      {
        category: "onlyfans_content_trends",
        query: "OnlyFans trending content types adult creator trends 2024 2025",
      },
    ];

    // Adult monetized creator trends (dedicated dataset)
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

    const allTrends: TrendData[] = [];
    const adultTrends: TrendData[] = [];
    const timestamp = new Date().toISOString();

    // Fetch trends for each category
    for (const { category, query } of trendQueries) {
      try {
        console.log(`[WeeklyTrendsJob] Fetching trends for: ${category}`);
        
        // Use searchWeb without user limits (this is a system job)
        const searchResult = await searchWeb(query);
        
        if (searchResult.success && searchResult.results.length > 0) {
          allTrends.push({
            category,
            query,
            results: searchResult.results,
            timestamp,
          });
          console.log(`[WeeklyTrendsJob] Fetched ${searchResult.results.length} results for ${category}`);
        } else {
          console.log(`[WeeklyTrendsJob] No results for ${category}: ${searchResult.note || "Unknown error"}`);
        }
      } catch (error: any) {
        console.error(`[WeeklyTrendsJob] Error fetching ${category}:`, error);
        // Continue with other categories even if one fails
      }
    }

    // Fetch adult monetized trends for separate dataset
    for (const { category, query } of adultTrendQueries) {
      try {
        console.log(`[WeeklyTrendsJob] Fetching adult trends for: ${category}`);
        const searchResult = await searchWeb(query);
        if (searchResult.success && searchResult.results.length > 0) {
          adultTrends.push({
            category,
            query,
            results: searchResult.results,
            timestamp,
          });
          console.log(`[WeeklyTrendsJob] Fetched ${searchResult.results.length} adult results for ${category}`);
        } else {
          console.log(`[WeeklyTrendsJob] No adult results for ${category}: ${searchResult.note || "Unknown error"}`);
        }
      } catch (error: any) {
        console.error(`[WeeklyTrendsJob] Error fetching adult ${category}:`, error);
      }
    }

    // Store trends in Firestore
    if (allTrends.length > 0) {
      const db = getAdminDb();
      const trendsDoc = {
        trends: allTrends,
        fetchedAt: timestamp,
        week: getWeekNumber(new Date()),
        year: new Date().getFullYear(),
      };

      // Store in a collection for easy access
      await db.collection("weekly_trends").doc(`week_${getWeekNumber(new Date())}_${new Date().getFullYear()}`).set(trendsDoc, { merge: true });
      
      // Also store as "latest" for easy access
      await db.collection("weekly_trends").doc("latest").set(trendsDoc);

      console.log(`[WeeklyTrendsJob] Stored ${allTrends.length} trend categories in Firestore`);
    }

    if (adultTrends.length > 0) {
      const db = getAdminDb();
      const adultDoc = {
        trends: adultTrends,
        fetchedAt: timestamp,
        week: getWeekNumber(new Date()),
        year: new Date().getFullYear(),
      };
      await db.collection("weekly_trends_adult").doc(`week_${getWeekNumber(new Date())}_${new Date().getFullYear()}`).set(adultDoc, { merge: true });
      await db.collection("weekly_trends_adult").doc("latest").set(adultDoc);
      console.log(`[WeeklyTrendsJob] Stored ${adultTrends.length} adult trend categories in Firestore`);
    }

    res.status(200).json({
      success: true,
      trendsFetched: allTrends.length,
      timestamp,
      message: "Weekly trends fetched and stored successfully",
    });
    return;
  } catch (error: any) {
    console.error("[WeeklyTrendsJob] Error:", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Failed to fetch weekly trends",
    });
    return;
  }
}

/**
 * Get week number of the year
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}


