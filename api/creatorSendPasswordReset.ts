import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminApp, getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { sendEmail } from "./_mailer.js";

type Body = {
  fanId?: string;
  email?: string;
  authUid?: string;
};

const UID_RE = /^[A-Za-z0-9]{20,36}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordResetEmail(name: string | null, resetLink: string): string {
  const displayName = name?.trim() || "there";
  return `Hi ${displayName},

Stormi J has moved to a new member setup: Witme.io powered by EchoFlux.
Your account is still active, and this password setup is required to sign in on the new member login flow.

Set your password here:

${resetLink}

Important: this email is from Stormi J's official member team and was sent to help members complete the move to the new login system.
This reset link expires in 1 hour.

If this was sent to you by mistake, you can safely ignore this message.

- Stormi J Member Support
Witme.io powered by EchoFlux`;
}

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
  const fanId = typeof body.fanId === "string" ? body.fanId.trim() : "";
  const requestedEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const requestedAuthUid = typeof body.authUid === "string" ? body.authUid.trim() : "";

  if (!fanId && !EMAIL_RE.test(requestedEmail) && !UID_RE.test(requestedAuthUid)) {
    return res.status(400).json({ error: "fanId, email, or authUid is required" });
  }

  const fansRef = db.collection("creators").doc(creatorId).collection("fans");
  let fanData = null as Record<string, unknown> | null;

  if (fanId) {
    const s = await fansRef.doc(fanId).get();
    if (s.exists) {
      fanData = (s.data() || {}) as Record<string, unknown>;
    }
  }

  if (!fanData && EMAIL_RE.test(requestedEmail)) {
    const byEmail = await fansRef.where("email", "==", requestedEmail).limit(1).get();
    if (!byEmail.empty) {
      fanData = (byEmail.docs[0].data() || {}) as Record<string, unknown>;
    }
  }

  if (!fanData) {
    return res.status(404).json({ error: "No fan record found for this creator" });
  }

  const email = (typeof fanData.email === "string" ? fanData.email : requestedEmail || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Fan does not have a valid email" });
  }

  const auth = getAdminApp().auth();
  let authUser = null as import("firebase-admin/auth").UserRecord | null;

  try {
    authUser = await auth.getUserByEmail(email);
  } catch {
    if (UID_RE.test(requestedAuthUid)) {
      try {
        authUser = await auth.getUser(requestedAuthUid);
      } catch {
        authUser = null;
      }
    }
  }

  if (!authUser?.uid) {
    return res.status(404).json({ error: "No Firebase Auth account found for this fan" });
  }

  const resetLink = await auth.generatePasswordResetLink(authUser.email || email);
  const name =
    (typeof fanData.displayName === "string" && fanData.displayName.trim()) ||
    (typeof fanData.name === "string" && fanData.name.trim()) ||
    null;

  const mail = await sendEmail({
    to: authUser.email || email,
    subject: "Stormi J Membership: Action required to sign in (Witme.io)",
    text: passwordResetEmail(name, resetLink),
  });

  return res.status(200).json({
    ok: true,
    email: authUser.email || email,
    userId: authUser.uid,
    emailSent: mail.sent === true,
    provider: (mail as { provider?: string | null }).provider || null,
  });
}

