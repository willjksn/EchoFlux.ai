/**
 * Helper functions for accessing weekly trends data
 * Uses the existing Firebase Admin initialization from _firebaseAdmin.ts
 */

import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "./_firebaseAdmin.js";

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
 * Helper function to get latest trends from Firestore
 * This can be called by other API endpoints to get current trends
 */
export async function getLatestTrends(): Promise<string> {
  try {
    const app = getAdminApp();
    const db = getFirestore(app);
    
    const latestDoc = await db.collection("weekly_trends").doc("latest").get();
    
    if (!latestDoc.exists) {
      return "No trend data available. Using general best practices.";
    }

    const data = latestDoc.data();
    if (!data || !data.trends || !Array.isArray(data.trends)) {
      return "Trend data format invalid. Using general best practices.";
    }

    // Format trends for AI consumption
    const formattedTrends = data.trends.map((trend: TrendData) => {
      const results = trend.results
        .slice(0, 3) // Top 3 results per category
        .map((r, idx) => `${idx + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.link}`)
        .join("\n\n");
      
      return `\n${trend.category.toUpperCase().replace(/_/g, " ")}:\n${results}`;
    }).join("\n\n");

    return `
CURRENT SOCIAL MEDIA TRENDS & BEST PRACTICES (Fetched: ${data.fetchedAt || "Unknown"}):
${formattedTrends}

KEY INSIGHTS FOR AI SUGGESTIONS:
- Stay current with algorithm changes and platform updates
- Adapt content to trending formats and styles
- Use trending hashtags and topics when relevant
- Follow platform-specific best practices
- Consider seasonal and cultural trends
- Optimize content for current algorithm preferences
`;
  } catch (error: any) {
    console.error("[getLatestTrends] Error:", error);
    return "Trend data unavailable. Using general best practices.";
  }
}

/**
 * Helper function to get OnlyFans-specific weekly trends
 * Filters trends to only include OnlyFans-related categories
 */
export async function getOnlyFansWeeklyTrends(): Promise<string> {
  try {
    const app = getAdminApp();
    const db = getFirestore(app);
    
    const latestDoc = await db.collection("weekly_trends").doc("latest").get();
    
    if (!latestDoc.exists) {
      return "OnlyFans trend data unavailable. Using general OnlyFans best practices.";
    }

    const data = latestDoc.data();
    if (!data || !data.trends || !Array.isArray(data.trends)) {
      return "OnlyFans trend data format invalid. Using general OnlyFans best practices.";
    }

    // Filter to only OnlyFans-related categories
    const onlyfansTrends = data.trends.filter((trend: TrendData) => 
      trend.category.toLowerCase().includes('onlyfans')
    );

    if (onlyfansTrends.length === 0) {
      return "OnlyFans-specific trend data unavailable. Using general OnlyFans best practices.";
    }

    // Format OnlyFans trends for AI consumption
    const formattedTrends = onlyfansTrends.map((trend: TrendData) => {
      const results = trend.results
        .slice(0, 3) // Top 3 results per category
        .map((r, idx) => `${idx + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.link}`)
        .join("\n\n");
      
      return `\n${trend.category.toUpperCase().replace(/_/g, " ")}:\n${results}`;
    }).join("\n\n");

    return `
CURRENT ONLYFANS-SPECIFIC TRENDS & BEST PRACTICES (Fetched: ${data.fetchedAt || "Unknown"}):
${formattedTrends}

KEY INSIGHTS FOR ONLYFANS CREATORS:
- Stay current with OnlyFans platform updates and new features
- Adapt content to trending OnlyFans content types and formats
- Use proven OnlyFans monetization strategies and engagement tactics
- Follow OnlyFans-specific best practices for subscriber retention
- Consider OnlyFans content trends and what subscribers are responding to
- Optimize content for OnlyFans platform preferences and subscriber behavior
- Focus on adult/explicit content strategies, girlfriend experience, and sexual content monetization
`;
  } catch (error: any) {
    console.error("[getOnlyFansWeeklyTrends] Error:", error);
    return "OnlyFans trend data unavailable. Using general OnlyFans best practices.";
  }
}


