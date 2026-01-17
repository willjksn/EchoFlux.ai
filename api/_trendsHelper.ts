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

interface TrendPresetDoc {
  presetId: string;
  platform: string;
  category: string;
  label: string;
  query: string;
  results: Array<{
    title: string;
    link: string;
    snippet: string;
  }>;
  fetchedAt?: string;
  updatedBy?: string;
  source?: string;
}

function isComplianceCategory(category: string): boolean {
  const c = (category || "").toLowerCase();
  return c.startsWith("compliance_") || c.includes("policy") || c.includes("guidelines");
}

function formatTrendBlock(trend: TrendData): string {
  const results = trend.results
    .slice(0, 3) // Top 3 results per category
    .map((r, idx) => `${idx + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.link}`)
    .join("\n\n");

  return `\n${trend.category.toUpperCase().replace(/_/g, " ")}:\n${results}`;
}

function formatPresetBlock(preset: TrendPresetDoc): string {
  const results = (preset.results || [])
    .slice(0, 3)
    .map((r, idx) => `${idx + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.link}`)
    .join("\n\n");

  const header = preset.label
    ? `${preset.platform.toUpperCase()} — ${preset.label}`
    : preset.category.toUpperCase().replace(/_/g, " ");

  return `\n${header}:\n${results}`;
}

async function getAdminViralPresets(db: FirebaseFirestore.Firestore, platform?: string): Promise<TrendPresetDoc[]> {
  try {
    const snapshot = await db.collection("trend_presets").get();
    const all = snapshot.docs
      .map((d) => d.data() as TrendPresetDoc)
      .filter((p) => p && Array.isArray(p.results) && p.results.length > 0);

    const filtered = platform
      ? all.filter((p) => (p.platform || "").toLowerCase() === platform.toLowerCase())
      : all;

    // Only include recent preset runs (avoid stale prompts)
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const recent = filtered.filter((p) => {
      const t = p.fetchedAt ? Date.parse(p.fetchedAt) : NaN;
      return Number.isFinite(t) ? t >= cutoff : true;
    });

    // Sort newest first
    recent.sort((a, b) => {
      const ta = a.fetchedAt ? Date.parse(a.fetchedAt) : 0;
      const tb = b.fetchedAt ? Date.parse(b.fetchedAt) : 0;
      return tb - ta;
    });

    return recent;
  } catch (err) {
    console.warn("[getAdminViralPresets] Failed to load admin presets:", err);
    return [];
  }
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
    const adminPresets = await getAdminViralPresets(db);
    
    if (!latestDoc.exists) {
      return "No trend data available. Using general best practices.";
    }

    const data = latestDoc.data();
    if (!data || !data.trends || !Array.isArray(data.trends)) {
      return "Trend data format invalid. Using general best practices.";
    }

    const allTrends = data.trends as TrendData[];
    const compliance = allTrends.filter((t) => isComplianceCategory(t.category));
    const nonCompliance = allTrends.filter((t) => !isComplianceCategory(t.category));

    const formattedCompliance = compliance.map(formatTrendBlock).join("\n\n");
    const formattedTrends = nonCompliance.map(formatTrendBlock).join("\n\n");
    const formattedAdminPresets = adminPresets.length ? adminPresets.map(formatPresetBlock).join("\n\n") : "";

    return `
CURRENT SOCIAL MEDIA TRENDS & BEST PRACTICES (Fetched: ${data.fetchedAt || "Unknown"}):
${formattedAdminPresets ? `\n\nADMIN “WHAT’S VIRAL THIS WEEK” PRESETS (Manual refresh):\n${formattedAdminPresets}\n` : ""}
${formattedCompliance ? `\n\nCOMPLIANCE & POLICY UPDATES (Weekly check):\n${formattedCompliance}\n` : ""}
${formattedTrends}

KEY INSIGHTS FOR AI SUGGESTIONS:
- Stay current with algorithm changes and platform updates
- Respect platform policies and community guidelines (avoid risky claims/content)
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
    const adminOnlyFansPresets = await getAdminViralPresets(db, "onlyfans");
    
    if (!latestDoc.exists) {
      return "OnlyFans trend data unavailable. Using general OnlyFans best practices.";
    }

    const data = latestDoc.data();
    if (!data || !data.trends || !Array.isArray(data.trends)) {
      return "OnlyFans trend data format invalid. Using general OnlyFans best practices.";
    }

    // Filter to OnlyFans-related categories + OnlyFans compliance categories.
    // (weeklyTrendsJob stores compliance_onlyfans, which should always be included here)
    const onlyfansTrends = (data.trends as TrendData[]).filter((trend: TrendData) => {
      const c = trend.category.toLowerCase();
      return c.includes('onlyfans') || (c.startsWith('compliance_') && c.includes('onlyfans'));
    });

    if (onlyfansTrends.length === 0) {
      return "OnlyFans-specific trend data unavailable. Using general OnlyFans best practices.";
    }

    const compliance = onlyfansTrends.filter((t) => isComplianceCategory(t.category));
    const nonCompliance = onlyfansTrends.filter((t) => !isComplianceCategory(t.category));
    const formattedCompliance = compliance.map(formatTrendBlock).join("\n\n");
    const formattedTrends = nonCompliance.map(formatTrendBlock).join("\n\n");
    const formattedAdminPresets = adminOnlyFansPresets.length ? adminOnlyFansPresets.map(formatPresetBlock).join("\n\n") : "";

    return `
CURRENT ONLYFANS-SPECIFIC TRENDS & BEST PRACTICES (Fetched: ${data.fetchedAt || "Unknown"}):
${formattedAdminPresets ? `\n\nADMIN “WHAT’S VIRAL THIS WEEK” PRESETS (Manual refresh):\n${formattedAdminPresets}\n` : ""}
${formattedCompliance ? `\n\nCOMPLIANCE & POLICY UPDATES (Weekly check):\n${formattedCompliance}\n` : ""}
${formattedTrends}

KEY INSIGHTS FOR ONLYFANS CREATORS:
- Stay current with OnlyFans platform updates and new features
- Respect OnlyFans policies and content restrictions (avoid risky/non-compliant guidance)
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

/**
 * Helper function to get Adult Premium weekly trends
 * Uses a dedicated adult-only weekly_trends_adult dataset
 */
export async function getAdultWeeklyTrends(): Promise<string> {
  try {
    const app = getAdminApp();
    const db = getFirestore(app);

    const latestDoc = await db.collection("weekly_trends_adult").doc("latest").get();
    const adminAdultPresets = await getAdminViralPresets(db, "adult");

    if (!latestDoc.exists) {
      return "Adult trend data unavailable. Using general adult best practices.";
    }

    const data = latestDoc.data();
    if (!data || !data.trends || !Array.isArray(data.trends)) {
      return "Adult trend data format invalid. Using general adult best practices.";
    }

    const allTrends = data.trends as TrendData[];
    const compliance = allTrends.filter((t) => isComplianceCategory(t.category));
    const nonCompliance = allTrends.filter((t) => !isComplianceCategory(t.category));
    const formattedCompliance = compliance.map(formatTrendBlock).join("\n\n");
    const formattedTrends = nonCompliance.map(formatTrendBlock).join("\n\n");
    const formattedAdminPresets = adminAdultPresets.length ? adminAdultPresets.map(formatPresetBlock).join("\n\n") : "";

    return `
CURRENT ADULT MONETIZED CREATOR TRENDS & BEST PRACTICES (Fetched: ${data.fetchedAt || "Unknown"}):
${formattedAdminPresets ? `\n\nADMIN “WHAT’S VIRAL THIS WEEK” PRESETS (Manual refresh):\n${formattedAdminPresets}\n` : ""}
${formattedCompliance ? `\n\nCOMPLIANCE & POLICY UPDATES (Weekly check):\n${formattedCompliance}\n` : ""}
${formattedTrends}

KEY INSIGHTS FOR ADULT MONETIZED CREATORS:
- Focus on monetization and subscriber retention
- Use trending adult content themes and formats
- Prioritize PPV, bundles, and session conversion angles
- Respect platform compliance updates for adult platforms
- Adapt to creator economy shifts and viewer preferences
`;
  } catch (error: any) {
    console.error("[getAdultWeeklyTrends] Error:", error);
    return "Adult trend data unavailable. Using general adult best practices.";
  }
}


