import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { getModelForTask } from "./_modelRouter.js";

/**
 * POST — authenticated creator drafts a short DM welcome message (filled into My Page automation).
 * Body: none. Uses Personality Override text + display/bio context when present.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const uid = decoded.uid;
  const rl = await enforceRateLimit({
    req,
    res,
    keyPrefix: "generateMemberWelcomeDraft",
    limit: 30,
    windowMs: 60 * 60 * 1000,
    identifier: uid,
  });
  if (!rl) return;

  try {
    const db = getAdminDb();
    const userSnap = await db.collection("users").doc(uid).get();
    const u = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

    const settings = u.settings && typeof u.settings === "object" ? (u.settings as Record<string, unknown>) : {};
    const creatorPersonality =
      (typeof u.creatorPersonality === "string" && u.creatorPersonality.trim()
        ? u.creatorPersonality.trim()
        : typeof settings.creatorPersonality === "string"
          ? settings.creatorPersonality.trim()
          : "") || "";
    const displayName = typeof u.name === "string" ? u.name.trim() : "";
    const bio = typeof u.bio === "string" ? u.bio.trim() : "";

    const creatorSnap = await db.collection("creators").doc(uid).get();
    const c = creatorSnap.exists ? (creatorSnap.data() as Record<string, unknown>) : {};
    const handle = typeof c.handle === "string" ? c.handle.trim() : "";

    let personalityBlock = creatorPersonality
      ? `Creator voice / personality notes:\n${creatorPersonality}`
      : "No Personality Override saved — write a friendly, concise welcome.";
    personalityBlock +=
      `\nPublic context — name: ${displayName || "Creator"}${handle ? `, @${handle}` : ""}${bio ? `, bio excerpt: ${bio.slice(0, 300)}` : ""}`;

    const prompt = `You draft ONE short DM a creator sends automatically when someone NEW joins their membership (paid or free).
Rules:
- Second person (“you”). Warm, inviting, genuine.
- 2–6 short sentences OR up to ~500 characters total; no hashtags unless natural.
- Thank them for joining; mention exclusives/community/shoutouts only if plausible; no hard sell.
- Plain text only. No Markdown. No bullets.
${personalityBlock}`;

    const model = await getModelForTask("reply", uid);
    const out = await model.generateContent(prompt);
    const text = typeof out.response?.text === "function" ? out.response.text().trim() : "";
    if (!text) {
      return res.status(502).json({ error: "Empty model response", code: "EMPTY_OUTPUT" });
    }

    return res.status(200).json({ text: text.slice(0, 2500) });
  } catch (e: unknown) {
    console.error("generateMemberWelcomeDraft:", e);
    return res.status(500).json({
      error: "Failed to generate draft",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
