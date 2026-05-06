import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { DocumentReference } from "firebase-admin/firestore";
import { applyBrowserApiCors } from "./_browserApiCors.js";
import { getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.js";
import { sanitizeForAI } from "./_inputSanitizer.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { checkApiKeys } from "./_errorHandler.js";
import { sendCreatorHubNotification } from "./_fanNotifications.js";
import { normalizePlanForLimits } from "./_planLimits.js";

type Comment = { username?: string; author?: string; text: string; hidden?: boolean; authorId?: string; isCreatorReply?: boolean };

const INLINE_POST_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

function collectPostMediaHttpsUrls(postData: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (u: unknown) => {
    if (typeof u !== "string") return;
    const t = u.trim();
    if (t.startsWith("https://") || t.startsWith("http://")) out.push(t);
  };
  if (Array.isArray(postData.mediaUrls)) {
    for (const u of postData.mediaUrls) push(u);
  }
  push(postData.mediaUrl);
  return [...new Set(out)];
}

/** Prefer a still image URL for cheap multimodal context (skip obvious video extensions). */
function pickFirstStillImageUrlForReply(urls: string[]): string | null {
  const videoLike = /\.(mp4|mov|webm|m4v|mkv|avi)(\?|#|$)/i;
  for (const u of urls) {
    if (!videoLike.test(u)) return u;
  }
  return null;
}

async function fetchPostImageInlineForGemini(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const mediaRes = await fetch(url);
    if (!mediaRes.ok) return null;
    const mimeType = (mediaRes.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!mimeType.startsWith("image/")) return null;
    const arr = await mediaRes.arrayBuffer();
    if (arr.byteLength > INLINE_POST_IMAGE_MAX_BYTES) return null;
    return { data: Buffer.from(arr).toString("base64"), mimeType };
  } catch (e) {
    console.warn("addCommentToPost: fetch post image for AI reply skipped:", e);
    return null;
  }
}

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
  creatorName: string,
  postImageInline: { data: string; mimeType: string } | null
): Promise<string> {
  const userSnap = await db.collection("users").doc(creatorId).get();
  const userData = userSnap.data() || {};
  const personality = sanitizeForAI(String(userData.creatorPersonality || "friendly"), 1500) || "friendly, authentic";
  const postSnippet = sanitizeForAI(String(postBody ?? ""), 500);
  const getModelForTask = await getModelRouter();
  const model = await getModelForTask("reply", creatorId);

  const perspectiveBlock = `
CRITICAL — WHO YOU ARE VS THE FAN (do not invert):
- You are ${creatorName}, the CREATOR. The fan commented on YOUR post. They are viewing your content — they are not the photographer or default subject of your photos unless they explicitly say they appear in the post.
- Do NOT assume the fan is doing what your photos show (road trip, gym, beach, flight, etc.). Never wish THEM "safe travels", "have fun on the road", "enjoy your trip", "drive safe", or similar unless they clearly said THEY are traveling or doing that activity.
- If YOUR media shows YOU traveling or on the road, react as yourself (thanks for the love, appreciate them, vibe with the comment) — do not redirect that scenario onto the fan.
- If unsure who is in the scene, stay neutral: brief thanks + warmth — no misplaced travel or activity wishes aimed at the fan.
`;

  const visionLine = postImageInline
    ? `VISUAL CONTEXT: An image from YOUR post is attached. Use it only to understand what YOU posted (setting, activity, vibe). The fan is still a separate person commenting — follow the POV rules above.`
    : `No post image was supplied for vision — use caption/snippet only; do not invent that the fan is in your scenario or traveling.`;

  const prompt = `You write ONE short reply to a fan's comment on YOUR feed post. Reply as ${creatorName} (the creator), first person.

RULES (strict):
- Do NOT give medical, legal, or professional advice.
- Do NOT write explicit sexual content or graphic descriptions.
- Edgy, bold, or playful is fine if it matches the creator's personality.
- One short reply only (1-2 sentences). Stay natural and human.
${perspectiveBlock}
${visionLine}

Creator personality/tone: ${personality}
Fan's comment: ${commentText}
${postSnippet ? `Post caption/snippet: ${postSnippet}` : ""}

Reply (short, in creator voice — obey POV rules):`;

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [{ text: prompt }];
  if (postImageInline) {
    parts.push({
      inlineData: { data: postImageInline.data, mimeType: postImageInline.mimeType },
    });
  }

  const result = await model.generateContent({
    contents: [{ role: "user", parts }],
  });
  return result.response.text().trim().slice(0, 500);
}

/** Add a fan comment to a post; if creator has Elite + AI reply on, may append an AI reply (max 2 per fan per post, random chance). */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyBrowserApiCors(req, res)) return;

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
  const [creatorUserSnap, creatorProfileSnap] = await Promise.all([
    db.collection("users").doc(creatorIdStr).get(),
    db.collection("creators").doc(creatorIdStr).get(),
  ]);
  const creatorData = creatorUserSnap.data() || {};
  const storefrontData = creatorProfileSnap.exists ? creatorProfileSnap.data() || {} : {};
  const dnFromUser =
    typeof creatorData.displayName === "string" ? creatorData.displayName.trim() : "";
  const dnFromStorefront =
    typeof storefrontData.displayName === "string" ? storefrontData.displayName.trim() : "";
  /** Never use request authorDisplayName here — that is the fan's name and broke AI reply attribution. */
  const creatorName = dnFromUser || dnFromStorefront || "Creator";

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
  const postBodyRaw = postData.body ?? postData.caption;
  const postBody = typeof postBodyRaw === "string" ? postBodyRaw : undefined;

  const fanUserSnap = await db.collection("users").doc(tokenUser.uid).get();
  const fanUser = fanUserSnap.data() || {};
  const firstString = (...values: unknown[]): string =>
    values.find((v) => typeof v === "string" && v.trim()) as string;

  const memberHandleCandidate = firstString(
    fanUser.username,
    fanUser.userName,
    fanUser.memberUsername,
    fanUser.handle
  );
  const memberHandleRaw = String(memberHandleCandidate ?? "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
  const usernamePublic = /^[a-z0-9_]{2,32}$/i.test(memberHandleRaw) ? memberHandleRaw : "";
  const displayFromAuth = String(
    firstString(authorDisplayName, fanUser.displayName, tokenUser.displayName, fanUser.name) ?? ""
  ).trim();
  const fanComment: Comment = {
    authorId: tokenUser.uid,
    author: displayFromAuth || (usernamePublic ? `@${usernamePublic}` : "Fan"),
    username: usernamePublic || undefined,
    text,
  };
  let nextComments: Comment[] = [...existingComments, fanComment];

  const plan = creatorData.plan as string | undefined;
  const role = creatorData.role as string | undefined;
  const isElite = normalizePlanForLimits(plan ?? "") === "Elite" || plan === "Agency" || role === "Admin";
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
    isTipperOrBuyer =
      !ordersSnap.empty ||
      (grantSnap.exists &&
        (grantSnap.data()?.subscription === true ||
          (Array.isArray((grantSnap.data() as any)?.unlockedProductIds) &&
            (grantSnap.data() as any).unlockedProductIds.length > 0)));
  } catch (_) {
    // ignore
  }

  if (isElite && autoReplyAI && checkApiKeys().hasKey) {
    const repliesToThisFan = countCreatorRepliesToFan(nextComments, tokenUser.uid);
    const wouldReply = repliesToThisFan < 2 && (isTipperOrBuyer || Math.random() * 100 < autoReplyChance);
    if (wouldReply) {
      try {
        const mediaUrls = collectPostMediaHttpsUrls(postData);
        const stillUrl = pickFirstStillImageUrlForReply(mediaUrls);
        const postImageInline = stillUrl ? await fetchPostImageInlineForGemini(stillUrl) : null;
        const replyText = await generateReplyInline(
          db,
          creatorIdStr,
          text,
          postBody,
          creatorName,
          postImageInline
        );
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
  if (rootSnap.exists) {
    await rootPostRef.update({ comments: nextComments });
  }

  if (tokenUser.uid !== creatorIdStr) {
    try {
      const snippet =
        text.length > 120 ? `${text.slice(0, 120)}…` : text;
      await sendCreatorHubNotification({
        creatorId: creatorIdStr,
        type: "post_comment",
        title: "New comment on your post",
        body: `${fanComment.author}: ${snippet}`,
        data: { postId: postIdStr, fanId: tokenUser.uid },
      });
    } catch (e) {
      console.error("addCommentToPost: sendCreatorHubNotification", e);
    }
  }

  res.status(200).json({ success: true, comments: nextComments });
}

export default withErrorHandling(handler);
