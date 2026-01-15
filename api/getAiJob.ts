import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authUser = await verifyAuth(req);
  if (!authUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const jobId = String(req.query?.jobId || "");
  if (!jobId) {
    res.status(400).json({ error: "Missing jobId" });
    return;
  }

  try {
    const db = getAdminDb();
    const doc = await db.collection("ai_jobs").doc(jobId).get();
    if (!doc.exists) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const data = doc.data();
    if (data?.userId !== authUser.uid && authUser.role !== "Admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.status(200).json({
      id: doc.id,
      status: data?.status,
      result: data?.result,
      error: data?.error,
      createdAt: data?.createdAt,
      updatedAt: data?.updatedAt,
    });
  } catch (error: any) {
    console.error("getAiJob error:", error);
    res.status(500).json({ error: "Failed to load job" });
  }
}
