import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const authUser = await verifyAuth(req);
  if (!authUser?.uid) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const userSnap = await db.collection("users").doc(authUser.uid).get();
  const role = (userSnap.data() as { role?: string } | undefined)?.role;
  if (role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const limitParam = typeof req.query?.limit === "string" ? Number(req.query.limit) : 200;
  const status = typeof req.query?.status === "string" ? req.query.status : "all";
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 20), 500) : 200;

  try {
    let q = db.collection("support_tickets").orderBy("updatedAt", "desc").limit(limit);
    if (status === "open" || status === "done") q = q.where("status", "==", status);
    const snap = await q.get();

    const items = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        creatorId: typeof data.creatorId === "string" ? data.creatorId : null,
        creatorHandle: typeof data.creatorHandle === "string" ? data.creatorHandle : null,
        creatorDisplayName: typeof data.creatorDisplayName === "string" ? data.creatorDisplayName : null,
        reporterUid: typeof data.reporterUid === "string" ? data.reporterUid : null,
        reporterEmail: typeof data.reporterEmail === "string" ? data.reporterEmail : null,
        reporterName: typeof data.reporterName === "string" ? data.reporterName : null,
        reporterKind: data.reporterKind === "creator" ? "creator" : "fan",
        reporterRole: typeof data.reporterRole === "string" ? data.reporterRole : "User",
        status: data.status === "done" ? "done" : "open",
        preview: typeof data.preview === "string" ? data.preview : "",
        createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
        updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
        lastMessageAt: typeof data.lastMessageAt === "string" ? data.lastMessageAt : null,
        messageCount: typeof data.messageCount === "number" ? data.messageCount : 0,
      };
    });

    return res.status(200).json({ success: true, items });
  } catch (error: any) {
    console.error("adminListSupportTickets error:", error);
    return res.status(500).json({ error: "Failed to load tickets", details: error?.message || String(error) });
  }
}

