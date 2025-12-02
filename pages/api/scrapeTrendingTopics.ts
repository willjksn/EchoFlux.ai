// api/scrapeTrendingTopics.ts
// Background job to scrape trending topics from social media platforms
// Runs via Vercel Cron every 4-6 hours

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

interface TrendingTopic {
  platform: string;
  topic: string;
  description?: string;
  engagement?: number;
  category?: string;
  timestamp: string;
}

/**
 * Scrape trending topics from a platform
 */
async function scrapePlatformTrends(platform: string): Promise<TrendingTopic[]> {
  const trends: TrendingTopic[] = [];

  try {
    switch (platform) {
      case "Instagram":
        trends.push(...(await scrapeInstagramTrends()));
        break;
      case "Twitter":
      case "X":
        trends.push(...(await scrapeTwitterTrends()));
        break;
      case "TikTok":
        trends.push(...(await scrapeTikTokTrends()));
        break;
      case "YouTube":
        trends.push(...(await scrapeYouTubeTrends()));
        break;
      default:
        console.warn(`Trending topics not supported for platform: ${platform}`);
    }
  } catch (error: any) {
    console.error(`Error scraping trends for ${platform}:`, error);
  }

  return trends;
}

/**
 * Scrape Instagram trending topics (via Graph API)
 */
async function scrapeInstagramTrends(): Promise<TrendingTopic[]> {
  // TODO: Implement Instagram Graph API trending hashtags/topics
  // For now, return empty array
  console.log("Scraping Instagram trends...");
  return [];
}

/**
 * Scrape Twitter/X trending topics
 */
async function scrapeTwitterTrends(): Promise<TrendingTopic[]> {
  // TODO: Implement Twitter API v2 trending topics
  // Note: Twitter API requires elevated access for trends endpoint
  console.log("Scraping Twitter trends...");
  return [];
}

/**
 * Scrape TikTok trending topics
 */
async function scrapeTikTokTrends(): Promise<TrendingTopic[]> {
  // TODO: Implement TikTok Business API trending hashtags
  console.log("Scraping TikTok trends...");
  return [];
}

/**
 * Scrape YouTube trending topics
 */
async function scrapeYouTubeTrends(): Promise<TrendingTopic[]> {
  // TODO: Implement YouTube Data API v3 trending videos/categories
  console.log("Scraping YouTube trends...");
  return [];
}

/**
 * Store trending topics in Firestore
 */
async function storeTrendingTopics(
  platform: string,
  trends: TrendingTopic[],
  db: any
) {
  if (trends.length === 0) return;

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const docId = `${platform}_${today}`;

  await db
    .collection("trending_topics")
    .doc(docId)
    .set(
      {
        platform,
        date: today,
        trends,
        scrapedAt: new Date().toISOString(),
      },
      { merge: true }
    );
}

/**
 * Main handler
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret (if called via cron)
  const cronSecret = req.headers["authorization"]?.replace("Bearer ", "");
  const isCronCall = cronSecret === process.env.CRON_SECRET;

  // If not cron, require auth
  if (!isCronCall) {
    try {
      const user = await verifyAuth(req);
      if (!user || user.role !== "Admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
    } catch (authError) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const db = getAdminDb();
    const { platform } = req.query;

    const platforms = platform
      ? [platform as string]
      : ["Instagram", "Twitter", "X", "TikTok", "YouTube"];

    const results: Record<string, number> = {};

    for (const platformName of platforms) {
      try {
        const trends = await scrapePlatformTrends(platformName);
        await storeTrendingTopics(platformName, trends, db);
        results[platformName] = trends.length;
      } catch (error: any) {
        console.error(`Failed to scrape trends for ${platformName}:`, error);
        results[platformName] = 0;
      }
    }

    return res.status(200).json({
      success: true,
      platforms: results,
      totalTrends: Object.values(results).reduce((a, b) => a + b, 0),
    });
  } catch (error: any) {
    console.error("scrapeTrendingTopics error:", error);
    return res.status(500).json({
      error: "Failed to scrape trending topics",
      details: error?.message || String(error),
    });
  }
}

