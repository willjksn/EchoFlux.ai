import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { resolveFanPartyDisplayLabel } from "./_fanDmLabels.js";

type MemberRow = { fanId: string; label: string };

/**
 * Creator-only: list members under creators/{creatorId}/fans for DM picker + search.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const creatorId = decoded.uid;
  const qRaw = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const snap = await db.collection("creators").doc(creatorId).collection("fans").limit(400).get();

    const rows: MemberRow[] = await Promise.all(
      snap.docs.map(async (d) => {
        const fanId = d.id;
        const label = await resolveFanPartyDisplayLabel(db, creatorId, fanId).catch(() => "Member");
        return { fanId, label };
      })
    );

    const filtered = qRaw
      ? rows.filter((r) => r.label.toLowerCase().includes(qRaw) || r.fanId.toLowerCase().includes(qRaw))
      : rows;

    filtered.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

    return res.status(200).json({ members: filtered.slice(0, 100) });
  } catch (e: unknown) {
    console.error("fanDmMemberDirectory error:", e);
    return res.status(500).json({
      error: "Failed to load members",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
