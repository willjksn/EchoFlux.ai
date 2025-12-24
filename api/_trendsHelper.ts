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

