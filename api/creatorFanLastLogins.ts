import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminApp, getAdminDb } from "./_firebaseAdmin.js";

type Body = {
  authUids?: string[];
  emails?: string[];
};

const UID_RE = /^[A-Za-z0-9]{20,36}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_UIDS = 300;
const MAX_EMAILS = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const creatorId = decoded.uid;
  const db = getAdminDb();
  const creatorSnap = await db.collection("creators").doc(creatorId).get();
  if (!creatorSnap.exists) {
    return res.status(403).json({ error: "Creator account required" });
  }

  const body = (req.body || {}) as Body;
  const requested = Array.isArray(body.authUids) ? body.authUids : [];
  const requestedEmails = Array.isArray(body.emails) ? body.emails : [];
  const authUids = Array.from(
    new Set(
      requested
        .map((v) => String(v || "").trim())
        .filter((v) => UID_RE.test(v))
        .slice(0, MAX_UIDS)
    )
  );
  const emails = Array.from(
    new Set(
      requestedEmails
        .map((v) => String(v || "").trim().toLowerCase())
        .filter((v) => EMAIL_RE.test(v))
        .slice(0, MAX_EMAILS)
    )
  );

  if (authUids.length === 0 && emails.length === 0) {
    return res.status(200).json({ byUid: {}, byEmail: {} });
  }

  const adminAuth = getAdminApp().auth();
  const byUid: Record<string, { lastSignInTime: string | null; exists: boolean; displayName: string | null }> = {};
  const byEmail: Record<string, { lastSignInTime: string | null; exists: boolean; displayName: string | null }> = {};

  await Promise.all(
    authUids.map(async (uid) => {
      try {
        const user = await adminAuth.getUser(uid);
        const lastSignInTime =
          typeof user.metadata?.lastSignInTime === "string" && user.metadata.lastSignInTime.trim()
            ? user.metadata.lastSignInTime
            : null;
        const displayName = typeof user.displayName === "string" && user.displayName.trim() ? user.displayName.trim() : null;
        byUid[uid] = { lastSignInTime, exists: true, displayName };
      } catch {
        byUid[uid] = { lastSignInTime: null, exists: false, displayName: null };
      }
    })
  );

  await Promise.all(
    emails.map(async (email) => {
      try {
        const user = await adminAuth.getUserByEmail(email);
        const lastSignInTime =
          typeof user.metadata?.lastSignInTime === "string" && user.metadata.lastSignInTime.trim()
            ? user.metadata.lastSignInTime
            : null;
        const displayName = typeof user.displayName === "string" && user.displayName.trim() ? user.displayName.trim() : null;
        byEmail[email] = { lastSignInTime, exists: true, displayName };
      } catch {
        byEmail[email] = { lastSignInTime: null, exists: false, displayName: null };
      }
    })
  );

  return res.status(200).json({ byUid, byEmail });
}

