import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { isCreatorIdentityPlan } from "./_creatorIdentityElite.js";
import { getCreatorIdentityCurrent } from "./_creatorIdentityFirestore.js";
import {
  appendFollowupOpenText,
  buildCreatorIdentityProfile,
} from "../src/lib/creatorIdentity/engine.js";
import type { CreatorIdentityDraftAnswers } from "../src/lib/creatorIdentity/types.js";

function isDraftAnswers(x: unknown): x is CreatorIdentityDraftAnswers {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.structured === "object" && o.structured !== null && typeof o.openText === "object" && o.openText !== null;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
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
      res.status(403).json({ error: "Creator Identity Builder is available on Elite." });
      return;
    }

    const body = (req.body || {}) as {
      action?: string;
      answers?: unknown;
      followupAnswers?: Record<string, string>;
      followupQuestionsAsked?: Array<{ id: string; question: string; reason: string; targetDimension?: string }>;
    };

    const ref = db.collection("users").doc(user.uid).collection("creatorIdentity").doc("current");
    const prevSnap = await ref.get();
    const prev = prevSnap.exists ? (prevSnap.data() as Record<string, unknown>) : null;
    const now = new Date().toISOString();
    const startedAt =
      typeof prev?.timestamps === "object" && prev.timestamps !== null && typeof (prev.timestamps as { startedAt?: string }).startedAt === "string"
        ? (prev.timestamps as { startedAt: string }).startedAt
        : now;

    if (body.action === "draft") {
      if (!isDraftAnswers(body.answers)) {
        res.status(400).json({ error: "Invalid answers" });
        return;
      }
      await ref.set(
        {
          status: "draft",
          rawAnswers: body.answers,
          timestamps: { startedAt, updatedAt: now },
          version: typeof prev?.version === "number" ? prev.version : 0,
        },
        { merge: true }
      );
      res.status(200).json({ success: true });
      return;
    }

    if (body.action === "complete" || body.action === "followup_submit") {
      let answersIn: CreatorIdentityDraftAnswers | null = null;
      if (body.action === "followup_submit") {
        const rawPrev = prev?.rawAnswers;
        if (!isDraftAnswers(rawPrev)) {
          res.status(400).json({ error: "No saved quiz answers; run the builder first." });
          return;
        }
        const fa = body.followupAnswers && typeof body.followupAnswers === "object" ? body.followupAnswers : {};
        answersIn = appendFollowupOpenText(rawPrev, fa);
      } else if (isDraftAnswers(body.answers)) {
        answersIn = body.answers;
      }
      if (!answersIn) {
        res.status(400).json({ error: "Invalid answers" });
        return;
      }

      const nextVersion = typeof prev?.version === "number" ? prev.version + 1 : 1;
      const profile = buildCreatorIdentityProfile(answersIn, {
        version: nextVersion,
        startedAt,
        followupQuestionsAsked: body.followupQuestionsAsked,
        followupAnswers: body.action === "followup_submit" ? body.followupAnswers : undefined,
      });

      if (prev && prevSnap.exists && prev.status !== "draft" && typeof prev.version === "number") {
        const histId = `v${prev.version}_${Date.now()}`;
        await db.collection("users").doc(user.uid).collection("creatorIdentityHistory").doc(histId).set(
          { ...prev, archivedAt: now },
          { merge: false }
        );
      }

      const prevEco =
        prev && typeof prev.ecosystemSync === "object" && prev.ecosystemSync !== null
          ? (prev.ecosystemSync as Record<string, boolean | string | undefined>)
          : {};
      profile.ecosystemSync = {
        ...profile.ecosystemSync,
        appliedToEchoFluxProfile: Boolean(prevEco.appliedToEchoFluxProfile),
        appliedToStrategyDefaults: Boolean(prevEco.appliedToStrategyDefaults),
        appliedToCaptionDefaults: Boolean(prevEco.appliedToCaptionDefaults),
        appliedToPremiumStudio: Boolean(prevEco.appliedToPremiumStudio),
        appliedToWitmePage: Boolean(prevEco.appliedToWitmePage),
        lastAppliedAt: typeof prevEco.lastAppliedAt === "string" ? prevEco.lastAppliedAt : undefined,
      };

      await ref.set(JSON.parse(JSON.stringify(profile)), { merge: false });
      res.status(200).json({ success: true, profile });
      return;
    }

    res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    console.error("saveCreatorIdentity:", e);
    if (!res.headersSent) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "Server error",
      });
    }
  }
}
