import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { FAN_DM_THREADS } from "./_fanDmHelpers.js";
import {
  markNewMessageNotificationsReadForThread,
  setCreatorDmMutedMirror,
} from "./_fanDmMutedMirror.js";

type InboxAction = "pin" | "unpin" | "mute" | "unmute" | "mark_unread";

/**
 * Creator-only: sidebar inbox actions (pin, mute, mark unread) on fanDmThreads.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
  const action = body.action as InboxAction;

  const allowed: InboxAction[] = ["pin", "unpin", "mute", "unmute", "mark_unread"];
  if (!threadId || !allowed.includes(action)) {
    return res.status(400).json({ error: "threadId and valid action are required" });
  }

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const ref = db.collection(FAN_DM_THREADS).doc(threadId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Thread not found" });
    }
    const t = snap.data() as { creatorId: string };
    if (t.creatorId !== decoded.uid) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updatedAt: now };

    switch (action) {
      case "pin":
        patch.creatorInboxPinned = true;
        patch.creatorInboxPinnedAt = now;
        break;
      case "unpin":
        patch.creatorInboxPinned = false;
        patch.creatorInboxPinnedAt = FieldValue.delete();
        break;
      case "mute":
        patch.creatorInboxMuted = true;
        break;
      case "unmute":
        patch.creatorInboxMuted = false;
        break;
      case "mark_unread":
        patch.creatorMarkedUnread = true;
        break;
      default:
        return res.status(400).json({ error: "Invalid action" });
    }

    await ref.update(patch);

    if (action === "mute") {
      await setCreatorDmMutedMirror(decoded.uid, threadId, true);
      await markNewMessageNotificationsReadForThread(decoded.uid, threadId);
    } else if (action === "unmute") {
      await setCreatorDmMutedMirror(decoded.uid, threadId, false);
    }

    return res.status(200).json({ ok: true, threadId, action });
  } catch (e: unknown) {
    console.error("fanDmThreadCreatorInbox error:", e);
    return res.status(500).json({
      error: "Failed to update thread",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
