import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";

function hasPlatformAdminAccess(userData: Record<string, unknown> | undefined): boolean {
  if (!userData) return false;
  const role = typeof userData.role === "string" ? userData.role.trim().toLowerCase() : "";
  if (role === "admin" || role === "superadmin" || role === "owner") return true;
  if (userData.isAdmin === true || userData.isSuperAdmin === true || userData.isOwner === true) return true;
  return false;
}

function updatedAtToMs(v: unknown): number {
  if (v == null) return 0;
  if (typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().getTime();
  }
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }
  return 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const authUser = await verifyAuth(req);
    if (!authUser?.uid) return res.status(401).json({ error: "Unauthorized" });

    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });
    const userSnap = await db.collection("users").doc(authUser.uid).get();
    const caller = (userSnap.data() as Record<string, unknown> | undefined) ?? undefined;
    if (!hasPlatformAdminAccess(caller)) return res.status(403).json({ error: "Admin access required" });

    const limitParam = typeof req.query?.limit === "string" ? Number(req.query.limit) : 200;
    const rawStatus = typeof req.query?.status === "string" ? req.query.status.toLowerCase() : "all";
    const status: "all" | "open" | "done" =
      rawStatus === "open" || rawStatus === "done" ? rawStatus : "all";
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 20), 500) : 200;

    let docs;
    try {
      let q = db.collection("support_tickets").orderBy("updatedAt", "desc").limit(limit);
      if (status === "open" || status === "done") q = q.where("status", "==", status);
      const snap = await q.get();
      docs = snap.docs;
    } catch (queryErr) {
      // Missing composite index fallback: fetch a wider set then sort/filter in memory.
      console.warn("adminListSupportTickets indexed query failed, using fallback:", queryErr);
      const cap = Math.min(limit * 3, 1500);
      const snap = await db.collection("support_tickets").limit(cap).get();
      docs = snap.docs
        .filter((d) => {
          if (status !== "open" && status !== "done") return true;
          const s = String((d.data() as Record<string, unknown>).status || "").toLowerCase();
          return s === status;
        })
        .sort((a, b) => updatedAtToMs(b.data().updatedAt) - updatedAtToMs(a.data().updatedAt))
        .slice(0, limit);
    }

    const items = docs.map((d) => {
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

