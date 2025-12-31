import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

type Milestone = "day7" | "day14";

function removeUndefined(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  const clean: any = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) {
    const val = (obj as any)[key];
    if (val === undefined) continue;
    clean[key] = removeUndefined(val);
  }
  return clean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authed = await verifyAuth(req);
  if (!authed?.uid) return res.status(401).json({ error: "Unauthorized" });

  const { milestone, answers, openEnded } = (req.body || {}) as {
    milestone?: Milestone;
    answers?: Record<string, string>;
    openEnded?: Record<string, string>;
  };

  if (milestone !== "day7" && milestone !== "day14") {
    return res.status(400).json({ error: "Invalid milestone" });
  }
  if (!answers || typeof answers !== "object") {
    return res.status(400).json({ error: "answers is required" });
  }
  if (!openEnded || typeof openEnded !== "object") {
    return res.status(400).json({ error: "openEnded is required" });
  }

  const db = getAdminDb();
  const nowIso = new Date().toISOString();
  const uid = authed.uid;

  try {
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? (userSnap.data() as any) : null;

    const docId = `${uid}_${milestone}`;
    const feedbackRef = db.collection("feedback_submissions").doc(docId);

    const payload = removeUndefined({
      id: docId,
      uid,
      milestone,
      createdAt: nowIso,
      updatedAt: nowIso,
      email: userData?.email || authed.email || "",
      name: userData?.name || null,
      plan: userData?.plan || null,
      inviteGrantPlan: userData?.inviteGrantPlan || null,
      invitedWithCode: userData?.invitedWithCode || null,
      inviteGrantRedeemedAt: userData?.inviteGrantRedeemedAt || null,
      answers,
      openEnded,
      userAgent: req.headers["user-agent"] || null,
    });

    await feedbackRef.set(payload, { merge: true });

    const submittedField = milestone === "day7" ? "feedbackDay7SubmittedAt" : "feedbackDay14SubmittedAt";
    const snoozeField = milestone === "day7" ? "feedbackDay7SnoozeUntil" : "feedbackDay14SnoozeUntil";

    await userRef.set(
      {
        [submittedField]: nowIso,
        [snoozeField]: null,
        feedbackLastSubmittedAt: nowIso,
        feedbackLastMilestone: milestone,
      } as any,
      { merge: true }
    );

    return res.status(200).json({ success: true });
  } catch (e: any) {
    console.error("submitInAppFeedback error:", e);
    return res.status(500).json({ error: "Failed to submit feedback" });
  }
}


