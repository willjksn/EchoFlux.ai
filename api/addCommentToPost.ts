import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { DocumentReference } from "firebase-admin/firestore";
import { getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.js";
import { sanitizeForAI } from "./_inputSanitizer.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { checkApiKeys } from "./_errorHandler.js";

type Comment = { username?: string; author?: string; text: string; hidden?: boolean; authorId?: string; isCreatorReply?: boolean };

function countCreatorRepliesToFan(comments: Comment[], fanAuthorId: string): number {
  let count = 0;
  for (let i = 0; i < comments.length; i++) {
    if (comments[i].isCreatorReply && i > 0 && comments[i - 1].authorId === fanAuthorId) count++;
  }
  return count;
}

async function generateReplyInline(
  db: ReturnType<typeof getAdminDb>,
  creatorId: string,
  commentText: string,
  postBody: string | undefined,
  creatorName: string
): Promise<string> {
  const userSnap = await db.collection("users").doc(creatorId).get();
  const userData = userSnap.data() || {};
  const personality = sanitizeForAI(String(userData.creatorPersonality || "friendly"), 1500) || "friendly, authentic";
  const postSnippet = sanitizeForAI(String(postBody ?? ""), 500);
  const getModelForTask = await getModelRouter();
  const model = await getModelForTask("reply", creatorId);
  const prompt = `You write a single short reply to a fan's comment on a creator's feed post. Reply as the creator, in their voice.

RULES (strict):
- Do NOT give medical, legal, or professional advice.
- Do NOT write explicit sexual content or graphic descriptions.
- Edgy, bold, or playful is fine if it matches the creator's personality.
- One short reply only (1-2 sentences). No greetings unless the fan asked a question. Stay natural and human.

Creator personality/tone: ${personality}
Creator display name: ${creatorName}
Fan's comment: ${commentText}
${postSnippet ? `Post caption/snippet (for context): ${postSnippet}` : ""}

Reply (short, in creator voice):`;
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return result.response.text().trim().slice(0, 500);
}

/** Add a fan comment to a post; if creator has Elite + AI reply on, may append an AI reply (max 2 per fan per post, random chance). */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let tokenUser: { uid: string; displayName?: string } | null;
  try {
    const verifyAuth = await getVerifyAuth();
    tokenUser = await verifyAuth(req);
  } catch (authError: any) {
    res.status(200).json({ success: false, error: "Authentication error", note: authError?.message });
    return;
  }
  if (!tokenUser?.uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "addCommentToPost",
    limit: 30,
    windowMs: 60_000,
    identifier: tokenUser.uid,
  });
  if (!ok) return;

  const { creatorId, postId, text: bodyText, authorDisplayName } = (req.body as Record<string, unknown>) || {};
  const creatorIdStr = String(creatorId ?? "").trim();
  const postIdStr = String(postId ?? "").trim();
  const text = sanitizeForAI(String(bodyText ?? ""), 2000);
  if (!creatorIdStr || !postIdStr || !text) {
    res.status(400).json({ error: "Missing creatorId, postId, or text" });
    return;
  }

  const db = getAdminDb();
  const creatorSnap = await db.collection("users").doc(creatorIdStr).get();
  const creatorData = creatorSnap.data() || {};
  const creatorName = String(creatorData.displayName ?? authorDisplayName ?? "Creator").trim() || "Creator";

  // Resolve post across fan hub paths (Fan Hub Posts composer → creators/.../fanPosts; legacy → users/.../posts, creators/.../posts)
  const candidateRefs = [
    db.collection("creators").doc(creatorIdStr).collection("fanPosts").doc(postIdStr),
    db.collection("users").doc(creatorIdStr).collection("posts").doc(postIdStr),
    db.collection("creators").doc(creatorIdStr).collection("posts").doc(postIdStr),
  ];
  const existingRefs: DocumentReference[] = [];
  let postData: Record<string, unknown> = {};
  for (const ref of candidateRefs) {
    const snap = await ref.get();
    if (snap.exists) {
      existingRefs.push(ref);
      if (Object.keys(postData).length === 0) {
        postData = snap.data() || {};
      }
    }
  }
  if (existingRefs.length === 0) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const existingComments: Comment[] = Array.isArray(postData.comments) ? postData.comments : [];
  const postBody = postData.body ?? postData.caption ?? "";

  const fanUserSnap = await db.collection("users").doc(tokenUser.uid).get();
  const fanUser = fanUserSnap.data() || {};
  const memberHandleRaw = typeof fanUser.username === "string" ? fanUser.username.replace(/^@/, "").trim().toLowerCase() : "";
  const displayFromAuth = String(authorDisplayName ?? tokenUser.displayName ?? "").trim();
  /** Public label: member handle when set; otherwise legacy fallback (display name) */
  const usernamePublic = memberHandleRaw || displayFromAuth || "fan";
  const fanComment: Comment = {
    authorId: tokenUser.uid,
    author: displayFromAuth || "Fan",
    username: usernamePublic,
    text,
  };
  let nextComments: Comment[] = [...existingComments, fanComment];

  const plan = creatorData.plan as string | undefined;
  const role = creatorData.role as string | undefined;
  const isElite = plan === "Elite" || plan === "Agency" || role === "Admin";
  const settings = (creatorData.fanHubFeedSettings as { autoReplyAI?: boolean; autoReplyChance?: number }) || {};
  const autoReplyAI = !!settings.autoReplyAI;
  const autoReplyChance = Math.max(0, Math.min(100, Number(settings.autoReplyChance) ?? 25));

  // Prioritize fans who tipped or bought from the store: always consider replying to them; others use slider chance
  let isTipperOrBuyer = false;
  try {
    const [ordersSnap, grantSnap] = await Promise.all([
      db.collection("orders").where("creatorId", "==", creatorIdStr).where("fanId", "==", tokenUser.uid).limit(1).get(),
      db.collection("creatorEntitlements").doc(creatorIdStr).collection("grants").doc(tokenUser.uid).get(),
    ]);
    isTipperOrBuyer = !ordersSnap.empty || (grantSnap.exists() && (grantSnap.data()?.subscription === true || (Array.isArray((grantSnap.data() as any)?.unlockedProductIds) && (grantSnap.data() as any).unlockedProductIds.length > 0)));
  } catch (_) {
    // ignore
  }

  if (isElite && autoReplyAI && checkApiKeys().hasKey) {
    const repliesToThisFan = countCreatorRepliesToFan(nextComments, tokenUser.uid);
    const wouldReply = repliesToThisFan < 2 && (isTipperOrBuyer || Math.random() * 100 < autoReplyChance);
    if (wouldReply) {
      try {
        const replyText = await generateReplyInline(db, creatorIdStr, text, postBody, creatorName);
        nextComments.push({
          authorId: creatorIdStr,
          author: creatorName,
          username: creatorName,
          text: replyText,
          isCreatorReply: true,
        });
      } catch (err) {
        console.error("addCommentToPost: AI reply failed", err);
      }
    }
  }

  await Promise.all(existingRefs.map((ref) => ref.update({ comments: nextComments })));
  const rootPostRef = db.collection("posts").doc(postIdStr);
  const rootSnap = await rootPostRef.get();
  if (rootSnap.exists()) {
    await rootPostRef.update({ comments: nextComments });
  }

  res.status(200).json({ success: true, comments: nextComments });
}

export default withErrorHandling(handler);
