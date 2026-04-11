import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { checkApiKeys } from "./_errorHandler.js";
import { isCreatorIdentityPlan } from "./_creatorIdentityElite.js";
import { getModelForTask } from "./_modelRouter.js";
import { needsFollowup, scoreAnswers, computeConfidence } from "../src/lib/creatorIdentity/engine.js";
import type { CreatorIdentityDraftAnswers } from "../src/lib/creatorIdentity/types.js";

function isDraftAnswers(x: unknown): x is CreatorIdentityDraftAnswers {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.structured === "object" && o.structured !== null && typeof o.openText === "object" && o.openText !== null;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await verifyAuth(req);
  if (!user?.uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const db = getAdminDb();
  if (!db) {
    res.status(500).json({ error: "Database unavailable" });
    return;
  }

  const userDoc = await db.collection("users").doc(user.uid).get();
  const plan = userDoc.exists ? String((userDoc.data() as { plan?: string })?.plan || "") : "";
  if (!isCreatorIdentityPlan(plan)) {
    res.status(403).json({ error: "Not available on your plan." });
    return;
  }

  const body = (req.body || {}) as { answers?: unknown };
  if (!isDraftAnswers(body.answers)) {
    res.status(400).json({ error: "Invalid answers" });
    return;
  }

  const buckets = scoreAnswers(body.answers);
  const conf = computeConfidence(body.answers, buckets.niche, buckets.vibes);
  if (!needsFollowup(conf, buckets.niche)) {
    res.status(200).json({ needFollowup: false, questions: [] as unknown[] });
    return;
  }

  const keyCheck = checkApiKeys();
  if (!keyCheck.hasKey) {
    res.status(200).json({
      needFollowup: true,
      questions: fallbackQuestions(buckets.niche),
      note: "AI not configured — returned template questions.",
    });
    return;
  }

  const nicheTop = Object.entries(buckets.niche)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  const prompt = `You help clarify a creator's brand. Based on quiz signals, propose 3-5 short follow-up questions.
Top niche scores (internal ids): ${nicheTop.join(", ")}. Confidence is borderline.

Return ONLY valid JSON array of objects, each: {"id":"string","question":"string","reason":"string","targetDimension":"niche|vibe|audience|monetization"}
No markdown.`;

  try {
    const model = await getModelForTask("strategy", user.uid);
    const r = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
    const text = r?.response?.text?.() || "";
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as unknown;
    const questions = Array.isArray(parsed) ? parsed.slice(0, 5) : [];
    res.status(200).json({ needFollowup: true, questions });
  } catch (e) {
    console.error("creatorIdentityFollowup AI error:", e);
    res.status(200).json({ needFollowup: true, questions: fallbackQuestions(buckets.niche) });
  }
}

function fallbackQuestions(nicheScores: Record<string, number>): Array<{
  id: string;
  question: string;
  reason: string;
  targetDimension?: string;
}> {
  const top = Object.entries(nicheScores)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => k.replace(/_/g, " "));
  const pair = top.join(" vs ");
  return [
    {
      id: "fb_niche",
      question: pair
        ? `You have pull in both ${top[0] || "lifestyle"} and ${top[1] || "another lane"}. Which one feels closer to what fans come to you for most?`
        : "What single theme do fans mention most when they engage with you?",
      reason: "Niche scores were close; one decisive answer helps positioning.",
      targetDimension: "niche",
    },
    {
      id: "fb_mon",
      question: "What would fans pay for first from you: more access, more exclusive posts, or more direct chat?",
      reason: "Monetization fit was ambiguous.",
      targetDimension: "monetization",
    },
    {
      id: "fb_vibe",
      question: "When someone lands on your page for the first time, should they feel more playful or more polished and premium?",
      reason: "Resolve vibe tension for brand consistency.",
      targetDimension: "vibe",
    },
  ];
}
