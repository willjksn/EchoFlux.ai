import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { getModelForTask } from "./_modelRouter.js";
import { parseJSON } from "./_geminiShared.js";
import { enforceRateLimit } from "./_rateLimit.js";

type TeaserPackRequest = {
  promotionType: "PPV" | "New set" | "Promo" | "General tease";
  concept: string;
  tone: "Teasing" | "Flirty" | "Explicit";
};

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(200).json({ success: false, error: "AI not configured" });
    return;
  }

  let authed: any = null;
  try {
    const verifyAuth = await getVerifyAuth();
    authed = await verifyAuth(req);
  } catch (e: any) {
    res.status(200).json({ success: false, error: "Authentication error" });
    return;
  }

  if (!authed?.uid) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  // Rate limiting: 8 requests / minute (teaser packs are expensive)
  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "generateTeaserPack",
    limit: 8,
    windowMs: 60_000,
    identifier: authed.uid,
  });
  if (!ok) return;

  const body: Partial<TeaserPackRequest> = (req.body || {}) as any;
  const promotionType = body.promotionType;
  const concept = typeof body.concept === "string" ? body.concept.trim() : "";
  const tone = body.tone;

  if (
    !promotionType ||
    !tone ||
    !concept ||
    concept.length < 3
  ) {
    res.status(400).json({ success: false, error: "Missing required fields" });
    return;
  }

  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(authed.uid).get();
  const userData = userDoc.exists ? (userDoc.data() as any) : null;
  const plan = userData?.plan || "Free";
  const role = userData?.role;

  const hasAccess = role === "Admin" || ["Elite", "OnlyFansStudio", "Agency"].includes(plan);
  if (!hasAccess) {
    res.status(403).json({ success: false, error: "Upgrade required" });
    return;
  }

  const monetized = userData?.settings?.monetizedOnboarding || null;
  const monetizedContext =
    monetized
      ? `Personalization (from onboarding):
- Posting frequency: ${monetized.postingFrequency || "unknown"}
- Help planning: ${Array.isArray(monetized.contentHelp) ? monetized.contentHelp.join(", ") : "unknown"}
- Biggest challenge: ${monetized.biggestChallenge || "unknown"}
- Monthly goal: ${monetized.monthlyGoal || "unknown"}`
      : "";

  try {
    const model = await getModelForTask("strategy", authed.uid);

    const prompt = `
You are a creator growth copywriter.
Create a multi-platform funnel teaser pack that drives curiosity and converts to paid subscribers.

Context:
- Promotion type: ${promotionType}
- Concept: ${concept}
- Tone: ${tone}
- Manual posting only (account-safe). Do not claim integrations or auto posting.
${monetizedContext ? `\n${monetizedContext}\n` : ""}

Return ONLY valid JSON (no markdown fences) with this shape:
{
  "instagram": {
    "reelHooks": ["...","...","...","...","..."],
    "caption": "...",
    "storyFrames": ["Frame 1...", "Frame 2...", "Frame 3..."]
  },
  "x": {
    "posts": ["...","...","...","...","..."]
  },
  "tiktok": {
    "hooks": ["...","...","...","...","..."],
    "caption": "..."
  },
  "ctas": ["...","...","...","...","..."]
}

Guidelines:
- Keep each hook short and scroll-stopping.
- CTAs should range from soft to direct (5 variants).
- Avoid banned words that could cause platform issues; keep it suggestive where appropriate.
`.trim();

    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });

    const raw = response.response.text().trim();
    const pack = parseJSON(raw);

    res.status(200).json({ success: true, pack });
  } catch (err: any) {
    console.error("generateTeaserPack error:", err);
    res.status(200).json({ success: false, error: err?.message || "Failed to generate teaser pack" });
  }
}

export default withErrorHandling(handler);



