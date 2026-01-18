import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { enforceRateLimit } from "./_rateLimit.js";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeUsername(username: string) {
  let decoded = username;
  try {
    decoded = decodeURIComponent(username);
  } catch {}
  return decoded.replace("@", "").toLowerCase().trim();
}

/**
 * Public endpoint: capture an email subscriber from a creator bio page.
 * Stores captures in `bio_page_email_captures` keyed by creatorUid + email.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    (req.headers["x-real-ip"] as string | undefined) ||
    "anonymous";

  // Rate limit: 10 requests / minute per IP
  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "captureEmail",
    limit: 10,
    windowMs: 60 * 1000,
    identifier: ip,
  });
  if (!ok) return;

  const { username, email } = (req.body || {}) as { username?: string; email?: string };
  if (!username || typeof username !== "string") return res.status(400).json({ error: "username is required" });
  if (!email || typeof email !== "string") return res.status(400).json({ error: "email is required" });

  const cleanUsername = normalizeUsername(username);
  const normalizedEmail = normalizeEmail(email);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) return res.status(400).json({ error: "Invalid email" });

  const nowIso = new Date().toISOString();
  const db = getAdminDb();

  try {
    // Resolve creator UID by bioPage.username
    const usersRef = db.collection("users");
    let userDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    try {
      const q = await usersRef.where("bioPage.username", "==", cleanUsername).limit(1).get();
      if (!q.empty) userDoc = q.docs[0];
    } catch (queryError: any) {
      // Fallback if index missing
      console.warn("captureEmail fallback scan (missing index?)", queryError?.message || queryError);
      const all = await usersRef.limit(1000).get();
      const match = all.docs.find((d) => {
        const u = d.data() as any;
        const bioUsername = String(u?.bioPage?.username || "").replace("@", "").toLowerCase().trim();
        return bioUsername === cleanUsername;
      });
      if (match) userDoc = match;
    }

    if (!userDoc) return res.status(404).json({ error: "Bio page not found" });

    const creatorUid = userDoc.id;
    const docIdEmail = normalizedEmail.replace(/[^a-z0-9@._+-]/g, "_");
    const captureId = `${creatorUid}_${docIdEmail}`;

    await db.collection("bio_page_email_captures").doc(captureId).set(
      {
        creatorUid,
        creatorUsername: cleanUsername,
        email: normalizedEmail,
        capturedAt: nowIso,
        source: "bio_page",
      } as any,
      { merge: true }
    );

    return res.status(200).json({ success: true });
  } catch (e: any) {
    console.error("captureEmail error:", e);
    return res.status(500).json({ error: "Failed to capture email" });
  }
}