import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { isCreatorIdentityPlan } from "./_creatorIdentityElite.js";
import { getCreatorIdentityCurrent } from "./_creatorIdentityFirestore.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== "GET") {
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

    const current = await getCreatorIdentityCurrent(db, user.uid);
    res.status(200).json({ profile: current });
  } catch (e) {
    console.error("getCreatorIdentity:", e);
    if (!res.headersSent) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "Server error",
      });
    }
  }
}
