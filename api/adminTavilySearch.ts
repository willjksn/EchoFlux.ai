import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, getVerifyAuth } from "./_errorHandler.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { searchWeb } from "./_webSearch.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const verifyAuth = await getVerifyAuth();
  const authUser = await verifyAuth(req);
  if (!authUser?.uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(authUser.uid).get();
  const adminData = adminDoc.data();
  if (adminData?.role !== "Admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const { query, maxResults, searchDepth, bypassCache } = (req.body as any) || {};

  const q = typeof query === "string" ? query.trim() : "";
  if (!q) {
    res.status(400).json({ error: "Missing query" });
    return;
  }

  const result = await searchWeb(q, authUser.uid, adminData?.plan || "Admin", "Admin", {
    maxResults,
    searchDepth,
    bypassCache,
  });

  res.status(200).json(result);
}

export default withErrorHandling(handler);


