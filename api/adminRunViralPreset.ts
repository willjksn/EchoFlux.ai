import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, getVerifyAuth } from "./_errorHandler.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { searchWeb } from "./_webSearch.js";

type PresetPlatform = "instagram" | "tiktok" | "x" | "onlyfans";

type ViralPreset = {
  id: string;
  platform: PresetPlatform;
  label: string;
  category: string;
  query: string;
};

const PRESETS: Record<string, ViralPreset> = {
  instagram_reels_trends_week: {
    id: "instagram_reels_trends_week",
    platform: "instagram",
    category: "instagram_reels_trends_week",
    label: "Reels trends this week",
    query: "Instagram Reels trends this week viral formats hooks edits 2025",
  },
  instagram_algorithm_updates: {
    id: "instagram_algorithm_updates",
    platform: "instagram",
    category: "instagram_algorithm_updates",
    label: "IG algorithm updates",
    query: "Instagram algorithm update 2025 Reels ranking changes best practices",
  },
  instagram_hook_formulas: {
    id: "instagram_hook_formulas",
    platform: "instagram",
    category: "instagram_hook_formulas",
    label: "Hook formulas working now",
    query: "best Instagram Reels hooks 2025 hook formulas retention patterns",
  },
  instagram_caption_patterns: {
    id: "instagram_caption_patterns",
    platform: "instagram",
    category: "instagram_caption_patterns",
    label: "Top performing caption patterns",
    query: "Instagram caption patterns high engagement 2025 short captions long captions CTA patterns",
  },

  tiktok_trend_signals: {
    id: "tiktok_trend_signals",
    platform: "tiktok",
    category: "tiktok_trend_signals",
    label: "Trend signals",
    query: "TikTok trends this week 2025 viral signals sounds formats",
  },
  tiktok_caption_structure: {
    id: "tiktok_caption_structure",
    platform: "tiktok",
    category: "tiktok_caption_structure",
    label: "Caption structure",
    query: "TikTok caption structure 2025 best practices CTA comment prompts",
  },
  tiktok_retention_hooks: {
    id: "tiktok_retention_hooks",
    platform: "tiktok",
    category: "tiktok_retention_hooks",
    label: "Retention hooks",
    query: "TikTok retention hooks 2025 first 1 second hook patterns watch time",
  },
  tiktok_policy_compliance_changes: {
    id: "tiktok_policy_compliance_changes",
    platform: "tiktok",
    category: "tiktok_policy_compliance_changes",
    label: "Policy/compliance changes",
    query: "TikTok community guidelines updates 2025 policy changes creator compliance",
  },

  x_high_performing_post_formats: {
    id: "x_high_performing_post_formats",
    platform: "x",
    category: "x_high_performing_post_formats",
    label: "High-performing post formats",
    query: "X (Twitter) high performing post formats 2025 short posts lists hot takes",
  },
  x_thread_templates: {
    id: "x_thread_templates",
    platform: "x",
    category: "x_thread_templates",
    label: "Thread templates",
    query: "X (Twitter) thread templates 2025 structure hooks examples",
  },
  x_engagement_patterns_working_now: {
    id: "x_engagement_patterns_working_now",
    platform: "x",
    category: "x_engagement_patterns_working_now",
    label: "Engagement patterns that still work",
    query: "X engagement tactics 2025 what works now replies quote tweets community notes safe tactics",
  },
  x_policy_changes: {
    id: "x_policy_changes",
    platform: "x",
    category: "x_policy_changes",
    label: "Policy changes",
    query: "X (Twitter) policy updates 2025 sensitive media rules creator guidelines",
  },

  onlyfans_monetization_best_practices: {
    id: "onlyfans_monetization_best_practices",
    platform: "onlyfans",
    category: "onlyfans_monetization_best_practices",
    label: "Monetization best practices",
    query: "OnlyFans monetization best practices 2025 PPV tips bundles pricing",
  },
  onlyfans_ppv_promo_copy_patterns: {
    id: "onlyfans_ppv_promo_copy_patterns",
    platform: "onlyfans",
    category: "onlyfans_ppv_promo_copy_patterns",
    label: "PPV promo copy patterns",
    query: "OnlyFans PPV promotion copy examples 2025 tips upsells messaging",
  },
  onlyfans_retention_messaging: {
    id: "onlyfans_retention_messaging",
    platform: "onlyfans",
    category: "onlyfans_retention_messaging",
    label: "Retention messaging",
    query: "OnlyFans subscriber retention messaging 2025 renewals rebills churn reduction",
  },
  onlyfans_policy_updates: {
    id: "onlyfans_policy_updates",
    platform: "onlyfans",
    category: "onlyfans_policy_updates",
    label: "Policy updates",
    query: "OnlyFans terms policy updates 2025 prohibited content rules compliance creator guidelines",
  },
};

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

  const { presetId, maxResults, searchDepth, bypassCache } = (req.body as any) || {};
  const pid = typeof presetId === "string" ? presetId.trim() : "";
  const preset = PRESETS[pid];
  if (!preset) {
    res.status(400).json({ error: "Unknown presetId" });
    return;
  }

  const search = await searchWeb(preset.query, authUser.uid, adminData?.plan || "Elite", "Admin", {
    maxResults,
    searchDepth,
    bypassCache: Boolean(bypassCache),
  });

  if (!search.success) {
    res.status(200).json({
      ...search,
      saved: false,
      preset,
    });
    return;
  }

  const nowIso = new Date().toISOString();
  await db.collection("trend_presets").doc(preset.id).set(
    {
      presetId: preset.id,
      platform: preset.platform,
      category: preset.category,
      label: preset.label,
      query: preset.query,
      results: search.results,
      fetchedAt: nowIso,
      updatedBy: authUser.uid,
      source: "admin_manual",
    },
    { merge: true }
  );

  res.status(200).json({
    ...search,
    saved: true,
    preset,
    fetchedAt: nowIso,
  });
}

export default withErrorHandling(handler);


