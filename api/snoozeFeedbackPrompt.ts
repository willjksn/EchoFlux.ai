import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

type Milestone = "day7" | "day14";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authed = await verifyAuth(req);
  if (!authed?.uid) return res.status(401).json({ error: "Unauthorized" });

  const { milestone, snoozeUntil } = (req.body || {}) as {
    milestone?: Milestone;
    snoozeUntil?: string;
  };

  if (milestone !== "day7" && milestone !== "day14") {
    return res.status(400).json({ error: "Invalid milestone" });
  }
  if (!snoozeUntil || typeof snoozeUntil !== "string") {
    return res.status(400).json({ error: "snoozeUntil is required" });
  }

  const snoozeMs = new Date(snoozeUntil).getTime();
  if (!Number.isFinite(snoozeMs)) {
    return res.status(400).json({ error: "snoozeUntil must be a valid ISO timestamp" });
  }

  const db = getAdminDb();
  const userRef = db.collection("users").doc(authed.uid);
  const field = milestone === "day7" ? "feedbackDay7SnoozeUntil" : "feedbackDay14SnoozeUntil";

  try {
    await userRef.set(
      {
        [field]: new Date(snoozeMs).toISOString(),
        feedbackLastSnoozedAt: new Date().toISOString(),
        feedbackLastSnoozedMilestone: milestone,
      } as any,
      { merge: true }
    );
    return res.status(200).json({ success: true });
  } catch (e: any) {
    console.error("snoozeFeedbackPrompt error:", e);
    return res.status(500).json({ error: "Failed to snooze feedback prompt" });
  }
}


