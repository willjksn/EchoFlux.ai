import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminCreatorLabelFromCreatorDoc } from "./_adminCreatorLabel.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";
import { verifyAuth } from "./verifyAuth.js";

function normalizeHandle(raw: unknown): string {
    if (typeof raw !== "string") return "";
    return raw.replace(/^@/, "").trim().toLowerCase();
}

export type CreatorHandlesIssue =
    | { kind: "missing_creator"; handleKey: string; creatorId: string }
    | { kind: "handle_mismatch"; handleKey: string; creatorId: string; creatorDocHandle: string };

/**
 * Admin-only: detect duplicate `creators` docs sharing the same handle, missing `users/{creatorId}`,
 * and drift between `creatorHandles/{handle}` and `creators/{creatorId}`.
 * GET /api/adminCreatorStorefrontDiagnostics
 */
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

    const adminSnap = await db.collection("users").doc(decoded.uid).get();
    if (!hasPlatformAdminAccess(adminSnap.data() as Record<string, unknown> | undefined)) {
        res.status(403).json({ error: "Admin access required" });
        return;
    }

    try {
        const creatorsSnap = await db.collection("creators").get();
        const byHandle = new Map<string, string[]>();
        const displayNameByCreatorId = new Map<string, string | null>();

        for (const d of creatorsSnap.docs) {
            const data = d.data() as Record<string, unknown>;
            const h = normalizeHandle(data.handle);
            const label = adminCreatorLabelFromCreatorDoc(data);
            displayNameByCreatorId.set(d.id, label || null);
            if (h) {
                if (!byHandle.has(h)) byHandle.set(h, []);
                byHandle.get(h)!.push(d.id);
            }
        }

        const duplicateHandles = [...byHandle.entries()]
            .filter(([, ids]) => ids.length > 1)
            .map(([normalizedHandle, creatorIds]) => ({
                normalizedHandle,
                creatorIds: [...new Set(creatorIds)].sort(),
                displayNames: [...new Set(creatorIds)].sort().map((id) => displayNameByCreatorId.get(id) ?? null),
            }))
            .sort((a, b) => a.normalizedHandle.localeCompare(b.normalizedHandle));

        const creatorIds = creatorsSnap.docs.map((d) => d.id);
        const missingUsersDoc: string[] = [];
        const chunk = 100;
        for (let i = 0; i < creatorIds.length; i += chunk) {
            const part = creatorIds.slice(i, i + chunk);
            const snaps = await db.getAll(...part.map((id) => db.collection("users").doc(id)));
            snaps.forEach((s, j) => {
                if (!s.exists) missingUsersDoc.push(part[j]);
            });
        }
        missingUsersDoc.sort();

        const creatorHandlesIssues: CreatorHandlesIssue[] = [];
        let creatorHandlesScanned = 0;
        const chSnap = await db.collection("creatorHandles").limit(2500).get();
        creatorHandlesScanned = chSnap.docs.length;

        for (const d of chSnap.docs) {
            const handleKey = d.id;
            const row = d.data() as { creatorId?: unknown };
            const creatorId = typeof row.creatorId === "string" ? row.creatorId.trim() : "";
            if (!creatorId) {
                creatorHandlesIssues.push({ kind: "missing_creator", handleKey, creatorId: "" });
                continue;
            }
            const cSnap = await db.collection("creators").doc(creatorId).get();
            if (!cSnap.exists) {
                creatorHandlesIssues.push({ kind: "missing_creator", handleKey, creatorId });
                continue;
            }
            const cData = cSnap.data() as Record<string, unknown>;
            const docHandle = normalizeHandle(cData.handle);
            if (docHandle && docHandle !== handleKey) {
                creatorHandlesIssues.push({
                    kind: "handle_mismatch",
                    handleKey,
                    creatorId,
                    creatorDocHandle: docHandle,
                });
            }
        }

        res.status(200).json({
            success: true,
            generatedAt: new Date().toISOString(),
            creatorsScanned: creatorsSnap.size,
            duplicateHandles,
            creatorsWithoutUsersDoc: {
                total: missingUsersDoc.length,
                sampleIds: missingUsersDoc.slice(0, 40),
                truncated: missingUsersDoc.length > 40,
            },
            creatorHandlesScanned,
            creatorHandlesIssues,
            creatorHandlesIssuesTruncated: chSnap.size >= 2500,
        });
    } catch (e) {
        console.error("adminCreatorStorefrontDiagnostics", e);
        res.status(500).json({ error: "Failed to run diagnostics" });
    }
}
