import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { applyBrowserApiCors } from "./_browserApiCors.js";

const MAX_IDS = 50;

function sanitizeIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const o = body as Record<string, unknown>;
  const fromArr = Array.isArray(o.notificationIds) ? o.notificationIds : [];
  const single = typeof o.notificationId === "string" ? [o.notificationId] : [];
  const raw = [...fromArr, ...single].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  const trimmed = [...new Set(raw.map((id) => id.trim()))].filter(
    (id) => id.length <= 256 && !id.includes("/") && !id.includes("\n") && !id.includes("\0")
  );
  return trimmed.slice(0, MAX_IDS);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyBrowserApiCors(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
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

    let body: Record<string, unknown> = {};
    try {
      if (typeof req.body === "string") {
        body = (req.body.trim() ? JSON.parse(req.body) : {}) as Record<string, unknown>;
      } else if (req.body && typeof req.body === "object") {
        body = req.body as Record<string, unknown>;
      }
    } catch {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
    const action = body.action;
    const ids = sanitizeIds(body);

    if (action !== "mark_read" && action !== "delete") {
      res.status(400).json({ error: "action must be mark_read or delete" });
      return;
    }
    if (!ids.length) {
      res.status(400).json({ error: "notificationId or notificationIds required" });
      return;
    }

    const uid = user.uid;
    const col = db.collection("users").doc(uid).collection("notifications");

    if (action === "mark_read") {
      await Promise.all(
        ids.map((id) =>
          col
            .doc(id)
            .update({ read: true })
            .catch(() => {
              /* stale id or race — ignore */
            })
        )
      );
    } else {
      await Promise.all(ids.map((id) => col.doc(id).delete().catch(() => undefined)));
    }

    res.status(200).json({ success: true, action, count: ids.length });
  } catch (e) {
    console.error("fanNotificationMutate:", e);
    if (!res.headersSent) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "Server error",
      });
    }
  }
}
