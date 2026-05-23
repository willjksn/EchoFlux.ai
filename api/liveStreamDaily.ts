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
import { userMayUseLiveStreaming } from "./_liveStreamAccess.js";
import { fanHubListLabelFromInput, safeUsernameForHandle } from "../src/lib/fanHubDisplay.js";
import { syncLiveStreamTicketOrdersForStream } from "./_syncLiveStreamTicketOrders.js";
import {
  clearLiveStreamParticipants,
  recordLiveStreamViewerJoin,
  recordLiveStreamViewerLeave,
} from "./_liveStreamParticipants.js";

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

/**
 * Denormalized `liveStreamPromo.streamStatus` on feed posts must match `liveStreams.status`
 * so fans see Watch live / On air toggle off when the host ends the broadcast.
 * Updates every matching doc (handles missing `promoPostId` on the stream doc or failed one-off syncs).
 */
async function syncLiveStreamPromoStatusOnPostCollections(
  db: Firestore,
  creatorId: string,
  streamId: string,
  streamStatus: "live" | "ended"
): Promise<void> {
  const paths: ReadonlyArray<readonly [string, string, string]> = [
    ["creators", creatorId, "fanPosts"],
    ["creators", creatorId, "posts"],
    ["users", creatorId, "posts"],
  ];
  const patch: Record<string, unknown> = {
    "liveStreamPromo.streamStatus": streamStatus,
    updatedAt: FieldValue.serverTimestamp(),
  };
  for (const segs of paths) {
    try {
      const col = db.collection(segs[0]).doc(segs[1]).collection(segs[2]);
      const snap = await col.where("liveStreamPromo.streamId", "==", streamId).limit(25).get();
      if (snap.empty) continue;
      await Promise.all(snap.docs.map((d) => d.ref.update(patch)));
    } catch (e) {
      console.warn("liveStreamDaily: syncLiveStreamPromoStatusOnPostCollections", segs.join("/"), e);
    }
  }
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

/**
 * Daily.co `user_name`: prefer EchoFlux @handle / username from Firestore, not Auth full name.
 * Host: creators.handle → users.username → then display name / JWT.
 * Fan: users.username → then same fallbacks as Fan Hub lists (display name, etc.).
 */
async function dailyParticipantDisplayName(
  db: Firestore,
  uid: string,
  decoded: { name?: string; email?: string },
  isHost: boolean
): Promise<string> {
  const userSnap = await db.collection("users").doc(uid).get();
  const u = userSnap.exists
    ? (userSnap.data() as { username?: string; displayName?: string; name?: string; email?: string })
    : {};
  const email =
    (typeof u.email === "string" && u.email.trim() ? u.email.trim() : "") ||
    (typeof decoded.email === "string" ? decoded.email.trim() : "") ||
    undefined;

  if (isHost) {
    const creatorSnap = await db.collection("creators").doc(uid).get();
    const c = creatorSnap.exists ? (creatorSnap.data() as { handle?: string }) : undefined;
    const raw = typeof c?.handle === "string" ? c.handle.replace(/^@/, "").trim().toLowerCase() : "";
    if (raw) return `@${raw}`.slice(0, 80);
  }

  const handle = safeUsernameForHandle(typeof u.username === "string" ? u.username : null);
  if (handle) return `@${handle}`.slice(0, 80);

  const rest = fanHubListLabelFromInput(
    {
      username: typeof u.username === "string" ? u.username : null,
      displayName: typeof u.displayName === "string" ? u.displayName : null,
      email: email ?? null,
      name: typeof u.name === "string" ? u.name : null,
    },
    { fallback: "" }
  );
  if (rest && rest !== "Member") return rest.slice(0, 80);

  const n = typeof decoded.name === "string" ? decoded.name.trim() : "";
  if (n) return n.slice(0, 80);
  const e = email || "";
  if (e.includes("@")) return e.split("@")[0]!.slice(0, 80);
  return `guest-${uid.slice(0, 8)}`;
}

/** Vercel may pass `body` as string, object, or Buffer — avoid uncaught JSON.parse → 500 */
function parseLiveStreamDailyBody(req: { body?: unknown }): {
  action?: string;
  streamId?: string;
  creatorId?: string;
} {
  try {
    const raw = req.body;
    if (raw == null || raw === "") return {};
    if (typeof raw === "object" && !Buffer.isBuffer(raw)) {
      return raw as { action?: string; streamId?: string; creatorId?: string };
    }
    const s = typeof raw === "string" ? raw : String(raw);
    return JSON.parse(s || "{}") as { action?: string; streamId?: string; creatorId?: string };
  } catch {
    return {};
  }
}

/**
 * Daily.co broadcast for fan live streams (interactive live streaming / Prebuilt).
 *
 * POST JSON:
 * - { action: "goLive", streamId } — creator; creates/refreshes Daily room, sets stream + promo post to live
 * - { action: "endLive", streamId } — creator; marks stream ended, syncs promo post
 * - { action: "token", creatorId, streamId } — creator (presenter) or entitled fan (viewer); stream must be `live`
 * - { action: "leaveViewer", creatorId, streamId } — fan left the broadcast (updates host roster)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyBrowserApiCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isDailyConfigured()) {
    return res.status(503).json({ error: "Live video is not configured" });
  }

  try {
    const decoded = await verifyAuth(req);
    if (!decoded?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = parseLiveStreamDailyBody(req);

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

    if (action === "goLive" || action === "endLive") {
      const hostSnap = await db.collection("users").doc(uid).get();
      const hostData = hostSnap.data() as { plan?: string; role?: string } | undefined;
      if (!userMayUseLiveStreaming(hostData?.plan, hostData?.role)) {
        return res.status(403).json({
          error: "Live streaming is available on Elite and Agency plans",
          code: "LIVE_STREAM_PLAN_REQUIRED",
        });
      }

      const streamRef = db.collection("creators").doc(uid).collection("liveStreams").doc(streamId);
      const snap = await streamRef.get();
      if (!snap.exists) {
        return res.status(404).json({ error: "Stream not found" });
      }
      const sdata = snap.data() as Record<string, unknown>;
      const docCreator = String(sdata.creatorId ?? "").trim();
      if (docCreator && docCreator !== uid) {
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

        await syncLiveStreamPromoStatusOnPostCollections(db, uid, streamId, "live");

        try {
          await clearLiveStreamParticipants(db, uid, streamId);
        } catch (e) {
          console.warn("clearLiveStreamParticipants (goLive):", e);
        }

        try {
          await syncLiveStreamTicketOrdersForStream(db, uid, streamId);
        } catch (e) {
          console.warn("syncLiveStreamTicketOrdersForStream (goLive):", e);
        }

        return res.status(200).json({ ok: true, roomUrl, roomName });
      }

      // endLive
      try {
        await clearLiveStreamParticipants(db, uid, streamId);
      } catch (e) {
        console.warn("clearLiveStreamParticipants (endLive):", e);
      }

      await streamRef.update({
        status: "ended",
        endedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await syncLiveStreamPromoStatusOnPostCollections(db, uid, streamId, "ended");
      try {
        await syncLiveStreamTicketOrdersForStream(db, uid, streamId);
      } catch (e) {
        console.warn("syncLiveStreamTicketOrdersForStream (endLive):", e);
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
      const tokenDocCreator = String(sdata.creatorId ?? "").trim();
      if (tokenDocCreator && tokenDocCreator !== creatorId) {
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
      if (isHost) {
        const hostSnap = await db.collection("users").doc(uid).get();
        const hostData = hostSnap.data() as { plan?: string; role?: string } | undefined;
        if (!userMayUseLiveStreaming(hostData?.plan, hostData?.role)) {
          return res.status(403).json({
            error: "Live streaming is available on Elite and Agency plans",
            code: "LIVE_STREAM_PLAN_REQUIRED",
          });
        }
      }

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

      const userName = await dailyParticipantDisplayName(db, uid, decoded, isHost);
      const role = isHost ? "presenter" : "viewer";
      const token = await createLiveStreamMeetingToken(roomName, uid, userName, role, TOKEN_DURATION_MIN);

      if (!isHost) {
        try {
          await recordLiveStreamViewerJoin(db, creatorId, streamId, uid, userName);
        } catch (e) {
          console.warn("recordLiveStreamViewerJoin:", e);
        }
      }

      return res.status(200).json({
        token,
        roomUrl,
        roomName,
        role,
      });
    }

    if (action === "leaveViewer") {
      const creatorId = typeof body.creatorId === "string" ? body.creatorId.trim() : "";
      if (!creatorId) {
        return res.status(400).json({ error: "creatorId is required" });
      }
      if (uid === creatorId) {
        return res.status(200).json({ ok: true });
      }
      try {
        await recordLiveStreamViewerLeave(db, creatorId, streamId, uid);
      } catch (e) {
        console.warn("recordLiveStreamViewerLeave:", e);
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    console.error("liveStreamDaily:", e);
    const msg = e instanceof Error ? e.message : "Request failed";
    const isDaily = /daily\.co/i.test(msg) || msg.startsWith("Daily.co:");
    return res.status(isDaily ? 502 : 500).json({
      error: msg,
      ...(isDaily ? { hint: "Check DAILY_API_KEY and Daily dashboard limits." } : {}),
    });
  }
}
