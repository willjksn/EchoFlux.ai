import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "../_firebaseAdmin.js";
import { normalizePlanForLimits } from "../_planLimits.js";
import { enforceRateLimit } from "../_rateLimit.js";
import { searchWeb, type WebSearchResult } from "../_webSearch.js";
import { verifyAuth } from "../verifyAuth.js";

type PrimaryAudience = "mostly_men" | "mostly_women" | "mixed";

type TrendSuggestion = {
  id: string;
  title: string;
  category: string;
  audienceFit: string;
  contentAngle: string;
  storyText: string[];
  innerCircleTieIn: string;
  ownershipRecommendation: "own_use" | "similar_curated" | "testing_interest";
  sourceUrl: string;
  dateFound: string;
  status: "new";
};

function asStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
}

function normalizeAudience(raw: unknown): PrimaryAudience {
  return raw === "mostly_women" || raw === "mixed" ? raw : "mostly_men";
}

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function categoryFromQuery(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("car")) return "Car / Driving";
  if (q.includes("desk")) return "Desk / Work";
  if (q.includes("beauty") || q.includes("grooming")) return "Self-Upgrade";
  if (q.includes("summer") || q.includes("travel") || q.includes("fashion")) return "Summer / Lifestyle";
  if (q.includes("home") || q.includes("organization")) return "Home / Everyday";
  return "Random but Useful";
}

function amazonSearchUrl(query: string): string {
  const clean = query
    .replace(/\b(trending|viral|amazon|tiktok|best|products?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `https://www.amazon.com/s?k=${encodeURIComponent(clean || query || "amazon finds")}`;
}

export function buildAmazonTrendQueries(settings: {
  primaryAudience: PrimaryAudience;
  categories?: string[];
}): string[] {
  const custom = (settings.categories || [])
    .slice(0, 4)
    .map((category) => `trending Amazon ${category} products TikTok`);

  if (settings.primaryAudience === "mostly_men") {
    return [
      ...custom,
      "trending Amazon car accessories TikTok",
      "viral Amazon gadgets for men",
      "Amazon car organization products trending",
      "best Amazon desk setup products trending",
      "men grooming tools Amazon trending",
      "random useful Amazon gadgets viral",
      "summer lifestyle products men Amazon",
      "car cleaning products Amazon trending",
    ].slice(0, 8);
  }

  if (settings.primaryAudience === "mostly_women") {
    return [
      ...custom,
      "trending Amazon beauty tools TikTok",
      "viral Amazon fashion finds",
      "Amazon home organization products trending",
      "wellness products Amazon trending",
      "desk setup products Amazon trending",
      "travel essentials Amazon viral",
    ].slice(0, 8);
  }

  return [
    ...custom,
    "viral Amazon gadgets trending",
    "random useful Amazon products TikTok",
    "Amazon home organization products trending",
    "car accessories Amazon trending",
    "desk setup products Amazon trending",
    "travel essentials Amazon viral",
  ].slice(0, 8);
}

function trendFromResult(result: WebSearchResult, query: string, audience: PrimaryAudience, index: number): TrendSuggestion {
  const category = categoryFromQuery(query);
  const audienceFit =
    audience === "mostly_men"
      ? "Strong fit for mostly male followers because it can be mentioned casually without feeling like a hard sell."
      : audience === "mostly_women"
        ? "Good fit for mostly female followers because it connects to everyday routines and useful finds."
        : "Broad fit because it works as a low-pressure useful find for a mixed audience.";
  const title = result.title || category;
  const dateFound = new Date().toISOString();

  return {
    id: `${slug(category)}-${slug(title || query)}-${index}`,
    title,
    category,
    audienceFit,
    contentAngle:
      category === "Car / Driving"
        ? "Use this as a soft mention during your next driving clip."
        : "Use this as a quick Story mention after a curiosity post.",
    storyText:
      category === "Car / Driving"
        ? ["why is this actually useful...", "I didn't think I needed it", "ok... I get it now"]
        : ["random but useful", "I get why people like this", "linked it because why not"],
    innerCircleTieIn:
      category === "Car / Driving"
        ? "Turn the car clip into a short car-talk drop inside Inner Circle."
        : "Share the closer or more personal version inside Inner Circle.",
    ownershipRecommendation: "testing_interest",
    sourceUrl: amazonSearchUrl(query),
    dateFound,
    status: "new",
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const requestedUid = typeof body.uid === "string" ? body.uid.trim() : "";
  if (requestedUid && requestedUid !== decoded.uid) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const db = getAdminDb();
  const userSnap = await db.collection("users").doc(decoded.uid).get();
  const userData = userSnap.data() || {};
  const userPlan = typeof userData.plan === "string" ? userData.plan : "Free";
  const userRole = typeof userData.role === "string" ? userData.role : "";
  const normalizedPlan = normalizePlanForLimits(userPlan);
  const hasAccess = userRole === "Admin" || normalizedPlan === "Pro" || normalizedPlan === "Elite" || userPlan === "Agency";

  if (!hasAccess) {
    return res.status(403).json({ error: "Creator OS trend search is available on Pro and Elite." });
  }

  const allowed = await enforceRateLimit({
    req,
    res,
    keyPrefix: "creator-os-amazon-trends",
    limit: 6,
    windowMs: 60 * 60 * 1000,
    identifier: decoded.uid,
  });
  if (!allowed) return;

  const primaryAudience = normalizeAudience(body.primaryAudience);
  const categories = asStringArray(body.categories);
  const queries = buildAmazonTrendQueries({ primaryAudience, categories });
  const trends: TrendSuggestion[] = [];
  const notes: string[] = [];

  for (const query of queries) {
    const result = await searchWeb(query, decoded.uid, userPlan, userRole, {
      allowQuotaUserTrendSearch: true,
      maxResults: 3,
      searchDepth: "basic",
    });

    if (!result.success) {
      if (result.note) notes.push(result.note);
      if (result.usageLimitReached) break;
      continue;
    }

    result.results.slice(0, 2).forEach((item, index) => {
      trends.push(trendFromResult(item, query, primaryAudience, trends.length + index));
    });
  }

  if (trends.length === 0) {
    return res.status(200).json({
      trends: [],
      note: notes[0] || "Trend search is unavailable right now. You can still plan your week manually.",
    });
  }

  return res.status(200).json({ trends: trends.slice(0, 12) });
}

