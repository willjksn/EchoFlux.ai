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

function normalizeCreatorId(raw: string): string {
    const id = raw.trim();
    if (!id) return "";
    const idx = id.indexOf("--collection=");
    if (idx >= 0) return id.slice(0, idx).trim();
    return id;
}

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

function mergeFanRowIntoMap(byId: Map<string, FanRow>, row: FanRow): void {
    const existing = byId.get(row.id);
    if (!existing) {
        byId.set(row.id, row);
        return;
    }
    byId.set(row.id, {
        id: row.id,
        email: existing.email !== "—" ? existing.email : row.email,
        displayName: existing.displayName !== "—" ? existing.displayName : row.displayName,
        subscriptionStatus: existing.subscriptionStatus || row.subscriptionStatus,
        totalSpentCents: Math.max(existing.totalSpentCents, row.totalSpentCents),
    });
}

const FAN_READ_LIMIT = 2000;

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
    const creatorIdParam = typeof raw === "string" ? raw.trim() : "";
    if (!creatorIdParam) {
        res.status(400).json({ error: "Missing creatorId" });
        return;
    }

    let resolvedCreatorId = creatorIdParam;

    try {
        /** Canonical creators doc id may differ from query (handle / legacy id). */
        let creatorSnap = await db.collection("creators").doc(creatorIdParam).get();
        if (!creatorSnap.exists) {
            const handleAlias = creatorIdParam.replace(/^@/, "").trim().toLowerCase();
            if (handleAlias) {
                const byHandle = await db.collection("creators").where("handle", "==", handleAlias).limit(1).get();
                if (!byHandle.empty) {
                    creatorSnap = byHandle.docs[0];
                    resolvedCreatorId = creatorSnap.id;
                }
            }
        }

        const pathIds = [...new Set([creatorIdParam, resolvedCreatorId].map((x) => normalizeCreatorId(x)).filter(Boolean))];

        const byId = new Map<string, FanRow>();

        for (const cid of pathIds) {
            const fansSnap = await db.collection("creators").doc(cid).collection("fans").limit(FAN_READ_LIMIT).get();
            for (const d of fansSnap.docs) {
                mergeFanRowIntoMap(byId, rowFromFansDoc(d.id, d.data() as Record<string, unknown>));
            }
        }

        const mergeSubscribers = async (subscriberRootId: string) => {
            const subsSnap = await db
                .collection("creatorSubscribers")
                .doc(subscriberRootId)
                .collection("subscribers")
                .limit(FAN_READ_LIMIT)
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
        };
        try {
            for (const cid of pathIds) {
                await mergeSubscribers(cid);
            }
        } catch (e) {
            console.warn("adminCreatorHubFans creatorSubscribers", pathIds, e);
        }

        for (const cid of pathIds) {
            try {
                const manualSnap = await db.collection("creators").doc(cid).collection("fanUsers").limit(FAN_READ_LIMIT).get();
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
                console.warn("adminCreatorHubFans fanUsers", cid, e);
            }
        }

        /** Fans whose `creatorId` field points at this creator but doc may live under another path. */
        const fieldIds = [...new Set(pathIds.map(normalizeCreatorId).filter(Boolean))];
        try {
            if (fieldIds.length === 1) {
                const cg = await db
                    .collectionGroup("fans")
                    .where("creatorId", "==", fieldIds[0])
                    .limit(FAN_READ_LIMIT)
                    .get();
                for (const d of cg.docs) {
                    mergeFanRowIntoMap(byId, rowFromFansDoc(d.id, d.data() as Record<string, unknown>));
                }
            } else if (fieldIds.length >= 2 && fieldIds.length <= 10) {
                const cg = await db
                    .collectionGroup("fans")
                    .where("creatorId", "in", fieldIds)
                    .limit(FAN_READ_LIMIT)
                    .get();
                for (const d of cg.docs) {
                    mergeFanRowIntoMap(byId, rowFromFansDoc(d.id, d.data() as Record<string, unknown>));
                }
            }
        } catch (e) {
            console.warn(
                "adminCreatorHubFans collectionGroup fans by creatorId (add COLLECTION_GROUP index on fans.creatorId if missing):",
                fieldIds,
                e,
            );
        }

        const fans = Array.from(byId.values());
        const UID_RE = /^[A-Za-z0-9]{20,36}$/;
        const enrichTargets = fans.filter((f) => (f.email === "—" || f.displayName === "—") && UID_RE.test(f.id));
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
        console.error("adminCreatorHubFans", creatorIdParam, e);
        res.status(500).json({ error: "Failed to load fans" });
    }
}
