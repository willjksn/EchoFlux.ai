import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

function hasPlatformAdminAccess(userData: Record<string, unknown> | undefined): boolean {
    if (!userData) return false;
    const role = typeof userData.role === "string" ? userData.role.trim().toLowerCase() : "";
    if (role === "admin" || role === "superadmin" || role === "owner") return true;
    if (userData.isAdmin === true || userData.isSuperAdmin === true || userData.isOwner === true) return true;
    return false;
}

type FanRow = {
    id: string;
    email: string;
    displayName: string;
    subscriptionStatus: string | null;
    totalSpentCents: number;
};

function rowFromFansDoc(docId: string, x: Record<string, unknown>): FanRow {
    const totalRaw = x.totalSpentCents;
    const totalSpentCents =
        typeof totalRaw === "number" && Number.isFinite(totalRaw) ? Math.max(0, Math.round(totalRaw)) : 0;
    return {
        id: docId,
        email: typeof x.email === "string" && x.email.trim() ? x.email.trim() : "—",
        displayName:
            (typeof x.displayName === "string" && x.displayName.trim() && x.displayName) ||
            (typeof x.fanName === "string" && x.fanName.trim() && x.fanName) ||
            "—",
        subscriptionStatus: typeof x.subscriptionStatus === "string" ? x.subscriptionStatus : null,
        totalSpentCents,
    };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (req.method !== "GET") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    const decoded = await verifyAuth(req);
    if (!decoded?.uid) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    const db = getAdminDb();
    if (!db) {
        res.status(500).json({ error: "Database unavailable" });
        return;
    }

    const adminDoc = await db.collection("users").doc(decoded.uid).get();
    if (!hasPlatformAdminAccess(adminDoc.data() as Record<string, unknown> | undefined)) {
        res.status(403).json({ error: "Admin access required" });
        return;
    }

    const raw = req.query.creatorId;
    const creatorId = typeof raw === "string" ? raw.trim() : "";
    if (!creatorId) {
        res.status(400).json({ error: "Missing creatorId" });
        return;
    }

    try {
        /** Same merge idea as FanHubUsers.tsx: fans + creatorSubscribers + fanUsers. */
        const byId = new Map<string, FanRow>();

        const fansSnap = await db.collection("creators").doc(creatorId).collection("fans").limit(500).get();
        for (const d of fansSnap.docs) {
            byId.set(d.id, rowFromFansDoc(d.id, d.data() as Record<string, unknown>));
        }

        try {
            const subsSnap = await db
                .collection("creatorSubscribers")
                .doc(creatorId)
                .collection("subscribers")
                .limit(500)
                .get();
            for (const d of subsSnap.docs) {
                const data = d.data() as Record<string, unknown>;
                const st = typeof data.status === "string" && data.status.trim() ? data.status.trim() : "active";
                const existing = byId.get(d.id);
                if (existing) {
                    if (!existing.subscriptionStatus) existing.subscriptionStatus = st;
                    continue;
                }
                byId.set(d.id, {
                    id: d.id,
                    email: "—",
                    displayName: "—",
                    subscriptionStatus: st,
                    totalSpentCents: 0,
                });
            }
        } catch (e) {
            console.warn("adminCreatorHubFans creatorSubscribers", creatorId, e);
        }

        try {
            const manualSnap = await db.collection("creators").doc(creatorId).collection("fanUsers").limit(500).get();
            for (const d of manualSnap.docs) {
                const data = d.data() as Record<string, unknown>;
                const email = typeof data.email === "string" && data.email.trim() ? data.email.trim() : "";
                const fanId = email || d.id;
                const name =
                    typeof data.name === "string" && data.name.trim()
                        ? data.name.trim()
                        : typeof data.displayName === "string" && data.displayName.trim()
                          ? data.displayName.trim()
                          : "—";
                const existing = byId.get(fanId);
                if (existing) {
                    if (existing.email === "—" && email) existing.email = email;
                    if ((existing.displayName === "—" || !existing.displayName) && name !== "—") existing.displayName = name;
                    continue;
                }
                byId.set(fanId, {
                    id: fanId,
                    email: email || "—",
                    displayName: name,
                    subscriptionStatus: null,
                    totalSpentCents: 0,
                });
            }
        } catch (e) {
            console.warn("adminCreatorHubFans fanUsers", creatorId, e);
        }

        const fans = Array.from(byId.values());
        const UID_RE = /^[A-Za-z0-9]{20,36}$/;
        const enrichTargets = fans.filter(
            (f) => (f.email === "—" || f.displayName === "—") && UID_RE.test(f.id),
        );
        const enrichChunk = enrichTargets.slice(0, 100);
        if (enrichChunk.length > 0) {
            const refs = enrichChunk.map((f) => db.collection("users").doc(f.id));
            const snaps = await db.getAll(...refs);
            snaps.forEach((snap, i) => {
                const f = enrichChunk[i];
                if (!snap.exists || !f) return;
                const ud = snap.data() as Record<string, unknown>;
                if (f.email === "—") {
                    const em = typeof ud.email === "string" && ud.email.trim() ? ud.email.trim() : "";
                    if (em) f.email = em;
                }
                if (f.displayName === "—") {
                    const dn =
                        (typeof ud.name === "string" && ud.name.trim() ? ud.name.trim() : "") ||
                        (typeof ud.displayName === "string" && ud.displayName.trim() ? ud.displayName.trim() : "");
                    if (dn) f.displayName = dn;
                }
            });
        }

        fans.sort((a, b) => b.totalSpentCents - a.totalSpentCents);
        res.status(200).json({ fans });
    } catch (e) {
        console.error("adminCreatorHubFans", creatorId, e);
        res.status(500).json({ error: "Failed to load fans" });
    }
}
