import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { applyBrowserApiCors } from "./_browserApiCors.js";
import { verifyAuth } from "./verifyAuth.js";
import { tryGetAdminDb } from "./_firebaseAdmin.js";
import { isFanBlocked } from "./_fanDmHelpers.js";
import { shouldGrantFanPageAdminMemberAccess } from "../src/lib/fanPageAdminBypass.js";
import {
  createOrGetLiveStreamBroadcastRoom,
  createLiveStreamMeetingToken,
  isDailyConfigured,
} from "./_dailyco.js";

const TOKEN_DURATION_MIN = 360;

function isPaidLikeStatus(status: unknown): boolean {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  return s === "active" || s === "trialing";
}

async function isPaidSubscriber(db: Firestore, creatorId: string, fanId: string): Promise<boolean> {
  const snap = await db
    .collection("creatorSubscribers")
    .doc(creatorId)
    .collection("subscribers")
    .doc(fanId)
    .get();
  if (!snap.exists) return false;
  return isPaidLikeStatus(snap.data()?.status);
}

async function fanCanWatchStream(
  db: Firestore,
  fanId: string,
  creatorId: string,
  streamId: string,
  ticketCents: number,
  freeForSubscribers: boolean
): Promise<boolean> {
  if (await shouldGrantFanPageAdminMemberAccess(db, fanId, creatorId)) return true;
  if (await isFanBlocked(db, creatorId, fanId)) return false;
  if (ticketCents <= 0) return true;
  const grantRef = db.collection("creatorEntitlements").doc(creatorId).collection("grants").doc(fanId);
  const grantSnap = await grantRef.get();
  const unlocked = grantSnap.data()?.unlockedLiveStreamIds;
  if (Array.isArray(unlocked) && unlocked.includes(streamId)) return true;
  if (freeForSubscribers && (await isPaidSubscriber(db, creatorId, fanId))) return true;
  return false;
}

function displayNameFromDecoded(decoded: { name?: string; email?: string }, uid: string): string {
  const n = typeof decoded.name === "string" ? decoded.name.trim() : "";
  if (n) return n.slice(0, 80);
  const e = typeof decoded.email === "string" ? decoded.email.trim() : "";
  if (e) return e.split("@")[0]!.slice(0, 80);
  return `guest-${uid.slice(0, 8)}`;
}

/**
 * Daily.co broadcast for fan live streams (interactive live streaming / Prebuilt).
 *
 * POST JSON:
 * - { action: "goLive", streamId } — creator; creates/refreshes Daily room, sets stream + promo post to live
 * - { action: "endLive", streamId } — creator; marks stream ended, syncs promo post
 * - { action: "token", creatorId, streamId } — creator (presenter) or entitled fan (viewer); stream must be `live`
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyBrowserApiCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isDailyConfigured()) {
    return res.status(503).json({ error: "Live video is not configured" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}) as {
    action?: string;
    streamId?: string;
    creatorId?: string;
  };

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const streamId = typeof body.streamId === "string" ? body.streamId.trim() : "";
  if (!streamId) {
    return res.status(400).json({ error: "streamId is required" });
  }

  const db = tryGetAdminDb();
  if (!db) {
    return res.status(503).json({
      error:
        "Server database is not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 (or equivalent) on the deployment that serves /api.",
    });
  }

  const uid = decoded.uid;

  try {
    if (action === "goLive" || action === "endLive") {
      const streamRef = db.collection("creators").doc(uid).collection("liveStreams").doc(streamId);
      const snap = await streamRef.get();
      if (!snap.exists) {
        return res.status(404).json({ error: "Stream not found" });
      }
      const sdata = snap.data() as Record<string, unknown>;
      if (String(sdata.creatorId || "") !== uid) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (action === "goLive") {
        const st = String(sdata.status ?? "scheduled").trim().toLowerCase();
        if (st === "cancelled") {
          return res.status(400).json({ error: "Cannot go live on a cancelled stream" });
        }
        const { roomUrl, roomName } = await createOrGetLiveStreamBroadcastRoom(uid, streamId, 48);
        await streamRef.update({
          status: "live",
          dailyRoomName: roomName,
          dailyRoomUrl: roomUrl,
          updatedAt: FieldValue.serverTimestamp(),
        });

        const promoPostId = typeof sdata.promoPostId === "string" ? sdata.promoPostId.trim() : "";
        if (promoPostId) {
          await db
            .collection("creators")
            .doc(uid)
            .collection("fanPosts")
            .doc(promoPostId)
            .update({
              "liveStreamPromo.streamStatus": "live",
              updatedAt: FieldValue.serverTimestamp(),
            })
            .catch(() => {
              /* promo doc may be missing or field path unsupported in older rules — non-fatal */
            });
        }

        return res.status(200).json({ ok: true, roomUrl, roomName });
      }

      // endLive
      await streamRef.update({
        status: "ended",
        updatedAt: FieldValue.serverTimestamp(),
      });
      const promoPostId = typeof sdata.promoPostId === "string" ? sdata.promoPostId.trim() : "";
      if (promoPostId) {
        await db
          .collection("creators")
          .doc(uid)
          .collection("fanPosts")
          .doc(promoPostId)
          .update({
            "liveStreamPromo.streamStatus": "ended",
            updatedAt: FieldValue.serverTimestamp(),
          })
          .catch(() => {});
      }
      return res.status(200).json({ ok: true });
    }

    if (action === "token") {
      const creatorId = typeof body.creatorId === "string" ? body.creatorId.trim() : "";
      if (!creatorId) {
        return res.status(400).json({ error: "creatorId is required" });
      }

      const streamRef = db.collection("creators").doc(creatorId).collection("liveStreams").doc(streamId);
      const snap = await streamRef.get();
      if (!snap.exists) {
        return res.status(404).json({ error: "Stream not found" });
      }
      const sdata = snap.data() as Record<string, unknown>;
      if (String(sdata.creatorId || "") !== creatorId) {
        return res.status(403).json({ error: "Invalid stream" });
      }

      const status = String(sdata.status ?? "").trim().toLowerCase();
      if (status !== "live") {
        return res.status(409).json({ error: "Stream is not live yet" });
      }

      const roomName = typeof sdata.dailyRoomName === "string" ? sdata.dailyRoomName.trim() : "";
      const roomUrl = typeof sdata.dailyRoomUrl === "string" ? sdata.dailyRoomUrl.trim() : "";
      if (!roomName || !roomUrl) {
        return res.status(409).json({ error: "Broadcast room is not ready" });
      }

      const ticketCents =
        typeof sdata.ticketCents === "number" && Number.isFinite(sdata.ticketCents)
          ? Math.max(0, Math.round(sdata.ticketCents))
          : 0;
      const freeForSubscribers = sdata.freeForSubscribers === true;

      const isHost = uid === creatorId;
      if (!isHost && sdata.creatorTestOnly === true) {
        return res.status(403).json({ error: "This broadcast is in creator test mode" });
      }
      if (!isHost) {
        if (await isFanBlocked(db, creatorId, uid)) {
          return res.status(403).json({ error: "Access denied" });
        }
        const ok = await fanCanWatchStream(db, uid, creatorId, streamId, ticketCents, freeForSubscribers);
        if (!ok) {
          return res.status(403).json({ error: "You need a ticket or membership to watch" });
        }
      }

      const userName = displayNameFromDecoded(decoded, uid);
      const role = isHost ? "presenter" : "viewer";
      const token = await createLiveStreamMeetingToken(roomName, uid, userName, role, TOKEN_DURATION_MIN);

      return res.status(200).json({
        token,
        roomUrl,
        roomName,
        role,
      });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    console.error("liveStreamDaily:", e);
    const msg = e instanceof Error ? e.message : "Request failed";
    return res.status(500).json({ error: msg });
  }
}
