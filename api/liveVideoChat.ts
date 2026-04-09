import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { createVideoRoom, createMeetingToken, deleteVideoRoom, isDailyConfigured } from "./_dailyco.js";
import { trackVideoUsage, canCreatorStartVideoChat, getCreatorQuotaStatus } from "./_videoUsageTracking.js";
import { sendFanNotification } from "./_fanNotifications.js";
import { resolveCreatorPartyDisplayLabel } from "./_fanDmLabels.js";
import type { LiveVideoChatSession, LiveVideoChatStatus } from "../types";

const ECHOFLUX_COMMISSION_RATE = 0.10; // 10% commission

function toSession(doc: FirebaseFirestore.DocumentSnapshot): LiveVideoChatSession {
  const d = doc.data() as Record<string, unknown>;
  return {
    id: doc.id,
    creatorId: d.creatorId as string,
    fanId: d.fanId as string,
    fanEmail: d.fanEmail as string | undefined,
    fanDisplayName: d.fanDisplayName as string | undefined,
    productId: d.productId as string,
    durationMinutes: (d.durationMinutes as number) ?? 10,
    minutesUsed: (d.minutesUsed as number) ?? 0,
    amountPaidCents: (d.amountPaidCents as number) ?? 0,
    creatorEarningsCents: (d.creatorEarningsCents as number) ?? 0,
    status: (d.status as LiveVideoChatStatus) ?? "pending",
    roomUrl: d.roomUrl as string | undefined,
    roomName: d.roomName as string | undefined,
    fanNote: d.fanNote as string | undefined,
    requestedAt: d.requestedAt as string,
    acceptedAt: d.acceptedAt as string | undefined,
    startedAt: d.startedAt as string | undefined,
    endedAt: d.endedAt as string | undefined,
    scheduledFor: d.scheduledFor as string | undefined,
  };
}

/**
 * Live Video Chat API
 * 
 * POST /api/liveVideoChat?action=request   - Fan requests a live video session
 * POST /api/liveVideoChat?action=accept    - Creator accepts request
 * POST /api/liveVideoChat?action=decline   - Creator declines request
 * POST /api/liveVideoChat?action=start     - Mark session as started (first join)
 * POST /api/liveVideoChat?action=end       - End the session
 * POST /api/liveVideoChat?action=token     - Get meeting token for joining
 * POST /api/liveVideoChat?action=deleteSession - Creator deletes completed/declined/cancelled/expired session doc
 * GET  /api/liveVideoChat?sessionId=       - Get session details
 * GET  /api/liveVideoChat?creatorId=       - List sessions for creator
 * GET  /api/liveVideoChat?fanId=           - List sessions for fan
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Check Daily.co configuration
  if (!isDailyConfigured()) {
    return res.status(503).json({ 
      error: "Live video chat is not configured. Please set DAILY_API_KEY." 
    });
  }

  const db = getAdminDb();
  if (!db) {
    return res.status(500).json({ error: "Database unavailable" });
  }

  // GET - Fetch session(s)
  if (req.method === "GET") {
    const sessionId = req.query.sessionId as string | undefined;
    const creatorId = req.query.creatorId as string | undefined;
    const fanId = req.query.fanId as string | undefined;

    const decoded = await verifyAuth(req);
    if (!decoded?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Get single session
      if (sessionId) {
        const [crId, sesId] = sessionId.includes("/") 
          ? sessionId.split("/") 
          : [creatorId, sessionId];
        
        if (!crId) {
          return res.status(400).json({ error: "creatorId required for session lookup" });
        }

        const docRef = db.collection("creators").doc(crId)
          .collection("liveVideoChats").doc(sesId || sessionId);
        const doc = await docRef.get();
        
        if (!doc.exists) {
          return res.status(404).json({ error: "Session not found" });
        }

        const session = toSession(doc);
        
        // Only creator or fan can view
        if (decoded.uid !== session.creatorId && decoded.uid !== session.fanId) {
          return res.status(403).json({ error: "Not authorized to view this session" });
        }

        return res.status(200).json({ session });
      }

      // List sessions for creator
      if (creatorId) {
        if (decoded.uid !== creatorId) {
          return res.status(403).json({ error: "Not authorized" });
        }

        const snap = await db.collection("creators").doc(creatorId)
          .collection("liveVideoChats")
          .orderBy("requestedAt", "desc")
          .limit(100)
          .get();

        const sessions = snap.docs.map(doc => toSession(doc));
        return res.status(200).json({ sessions });
      }

      // List sessions for fan (across all creators)
      if (fanId) {
        if (decoded.uid !== fanId) {
          return res.status(403).json({ error: "Not authorized" });
        }

        // Query across all creators (using collection group)
        const snap = await db.collectionGroup("liveVideoChats")
          .where("fanId", "==", fanId)
          .orderBy("requestedAt", "desc")
          .limit(50)
          .get();

        const sessions = snap.docs.map(doc => toSession(doc));
        return res.status(200).json({ sessions });
      }

      return res.status(400).json({ error: "sessionId, creatorId, or fanId required" });
    } catch (e) {
      console.error("liveVideoChat GET error:", e);
      return res.status(500).json({ error: "Failed to fetch sessions" });
    }
  }

  // POST - Actions
  if (req.method === "POST") {
    const action = req.query.action as string;
    const body = req.body as Record<string, unknown>;

    const decoded = await verifyAuth(req);
    if (!decoded?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // REQUEST - Fan requests a live video session
      if (action === "request") {
        const creatorId = body.creatorId as string;
        const productId = body.productId as string;
        const durationMinutes = (body.durationMinutes as number) || 10;
        const amountPaidCents = (body.amountPaidCents as number) || 0;
        const fanNote = body.fanNote as string | undefined;
        const scheduledFor = body.scheduledFor as string | undefined;
        const fanEmail = body.fanEmail as string | undefined;
        const fanDisplayName = body.fanDisplayName as string | undefined;

        if (!creatorId || !productId) {
          return res.status(400).json({ error: "creatorId and productId required" });
        }

        const fanId = decoded.uid;
        const creatorEarningsCents = Math.round(amountPaidCents * (1 - ECHOFLUX_COMMISSION_RATE));

        const sessionRef = db.collection("creators").doc(creatorId)
          .collection("liveVideoChats").doc();

        const sessionData: Omit<LiveVideoChatSession, "id"> = {
          creatorId,
          fanId,
          fanEmail,
          fanDisplayName,
          productId,
          durationMinutes,
          minutesUsed: 0,
          amountPaidCents,
          creatorEarningsCents,
          status: "pending",
          fanNote,
          requestedAt: new Date().toISOString(),
          scheduledFor,
        };

        await sessionRef.set(sessionData);

        return res.status(201).json({ 
          sessionId: sessionRef.id,
          session: { id: sessionRef.id, ...sessionData }
        });
      }

      // ACCEPT - Creator accepts the request and creates video room
      if (action === "accept") {
        const sessionId = body.sessionId as string;
        const creatorId = body.creatorId as string;

        if (!sessionId || !creatorId) {
          return res.status(400).json({ error: "sessionId and creatorId required" });
        }

        if (decoded.uid !== creatorId) {
          return res.status(403).json({ error: "Only creator can accept" });
        }

        const sessionRef = db.collection("creators").doc(creatorId)
          .collection("liveVideoChats").doc(sessionId);
        const doc = await sessionRef.get();

        if (!doc.exists) {
          return res.status(404).json({ error: "Session not found" });
        }

        const session = toSession(doc);
        if (session.status !== "pending") {
          return res.status(400).json({ error: `Cannot accept session with status: ${session.status}` });
        }

        // Check creator's video chat quota
        const quotaCheck = await canCreatorStartVideoChat(creatorId, session.durationMinutes);
        if (!quotaCheck.allowed) {
          return res.status(403).json({ 
            error: "Video chat quota exceeded",
            reason: quotaCheck.reason,
            remainingMinutes: quotaCheck.remainingMinutes,
            monthlyLimit: quotaCheck.monthlyLimit,
          });
        }

        // Create Daily.co room
        const { roomUrl, roomName } = await createVideoRoom(sessionId, session.durationMinutes);

        await sessionRef.update({
          status: "accepted",
          roomUrl,
          roomName,
          acceptedAt: new Date().toISOString(),
        });

        // Notify the fan that their request was accepted
        await sendFanNotification({
          fanId: session.fanId,
          type: 'video_chat_accepted',
          title: 'Video Chat Ready!',
          body: 'Your video chat request has been accepted. Join now!',
          data: { sessionId, creatorId },
        });

        return res.status(200).json({ 
          success: true,
          roomUrl,
          roomName,
          quotaRemaining: quotaCheck.remainingMinutes,
        });
      }

      // DECLINE - Creator declines the request
      if (action === "decline") {
        const sessionId = body.sessionId as string;
        const creatorId = body.creatorId as string;

        if (!sessionId || !creatorId) {
          return res.status(400).json({ error: "sessionId and creatorId required" });
        }

        if (decoded.uid !== creatorId) {
          return res.status(403).json({ error: "Only creator can decline" });
        }

        const sessionRef = db.collection("creators").doc(creatorId)
          .collection("liveVideoChats").doc(sessionId);
        
        await sessionRef.update({
          status: "declined",
          endedAt: new Date().toISOString(),
        });

        // TODO: Trigger refund to fan

        return res.status(200).json({ success: true });
      }

      // TOKEN - Get meeting token for joining the video call
      if (action === "token") {
        const sessionId = body.sessionId as string;
        const creatorId = body.creatorId as string;

        if (!sessionId || !creatorId) {
          return res.status(400).json({ error: "sessionId and creatorId required" });
        }

        const sessionRef = db.collection("creators").doc(creatorId)
          .collection("liveVideoChats").doc(sessionId);
        const doc = await sessionRef.get();

        if (!doc.exists) {
          return res.status(404).json({ error: "Session not found" });
        }

        const session = toSession(doc);

        // Only creator or fan can get token
        const isCreator = decoded.uid === session.creatorId;
        const isFan = decoded.uid === session.fanId;
        if (!isCreator && !isFan) {
          return res.status(403).json({ error: "Not authorized" });
        }

        if (session.status !== "accepted" && session.status !== "active") {
          return res.status(400).json({ error: `Cannot join session with status: ${session.status}` });
        }

        if (!session.roomName) {
          return res.status(400).json({ error: "Room not ready" });
        }

        // Generate token (Daily shows user_name to the other participant)
        const userName = isCreator
          ? await resolveCreatorPartyDisplayLabel(db, session.creatorId)
          : session.fanDisplayName || "Fan";
        const token = await createMeetingToken(
          session.roomName,
          decoded.uid,
          userName,
          isCreator,
          session.durationMinutes
        );

        return res.status(200).json({ 
          token,
          roomUrl: session.roomUrl,
          durationMinutes: session.durationMinutes,
          isCreator
        });
      }

      // START - Mark session as active (first join)
      if (action === "start") {
        const sessionId = body.sessionId as string;
        const creatorId = body.creatorId as string;

        if (!sessionId || !creatorId) {
          return res.status(400).json({ error: "sessionId and creatorId required" });
        }

        const sessionRef = db.collection("creators").doc(creatorId)
          .collection("liveVideoChats").doc(sessionId);
        const doc = await sessionRef.get();

        if (!doc.exists) {
          return res.status(404).json({ error: "Session not found" });
        }

        const session = toSession(doc);
        if (decoded.uid !== session.creatorId && decoded.uid !== session.fanId) {
          return res.status(403).json({ error: "Not authorized" });
        }

        // Only update if not already active
        if (session.status === "accepted") {
          await sessionRef.update({
            status: "active",
            startedAt: new Date().toISOString(),
          });
        }

        return res.status(200).json({ success: true });
      }

      // END - End the session
      if (action === "end") {
        const sessionId = body.sessionId as string;
        const creatorId = body.creatorId as string;
        const minutesUsed = body.minutesUsed as number | undefined;

        if (!sessionId || !creatorId) {
          return res.status(400).json({ error: "sessionId and creatorId required" });
        }

        const sessionRef = db.collection("creators").doc(creatorId)
          .collection("liveVideoChats").doc(sessionId);
        const doc = await sessionRef.get();

        if (!doc.exists) {
          return res.status(404).json({ error: "Session not found" });
        }

        const session = toSession(doc);
        if (decoded.uid !== session.creatorId && decoded.uid !== session.fanId) {
          return res.status(403).json({ error: "Not authorized" });
        }

        // Calculate minutes used if not provided
        let actualMinutesUsed = minutesUsed;
        if (actualMinutesUsed === undefined && session.startedAt) {
          const startTime = new Date(session.startedAt).getTime();
          const endTime = Date.now();
          actualMinutesUsed = Math.ceil((endTime - startTime) / 60000);
        }

        await sessionRef.update({
          status: "completed",
          endedAt: new Date().toISOString(),
          minutesUsed: actualMinutesUsed ?? 0,
        });

        // Clean up Daily.co room
        if (session.roomName) {
          await deleteVideoRoom(session.roomName);
        }

        // Track video usage for analytics and quota
        await trackVideoUsage({
          creatorId: session.creatorId,
          fanId: session.fanId,
          sessionId,
          durationMinutes: actualMinutesUsed ?? 0,
          amountPaidCents: session.amountPaidCents,
          echofluxCommissionCents: session.amountPaidCents - session.creatorEarningsCents,
          creatorEarningsCents: session.creatorEarningsCents,
        });

        // Record earnings for creator
        if (session.creatorEarningsCents > 0) {
          const orderRef = db.collection("creators").doc(creatorId)
            .collection("orders").doc();
          
          await orderRef.set({
            type: "live_video_chat",
            sessionId,
            fanId: session.fanId,
            amountCents: session.amountPaidCents,
            creatorEarningsCents: session.creatorEarningsCents,
            commissionCents: session.amountPaidCents - session.creatorEarningsCents,
            durationMinutes: session.durationMinutes,
            minutesUsed: actualMinutesUsed ?? 0,
            status: "completed",
            createdAt: new Date().toISOString(),
          });
        }

        return res.status(200).json({ 
          success: true,
          minutesUsed: actualMinutesUsed ?? 0
        });
      }

      // INSTANT - Creator initiates instant video call with fan
      if (action === "instant") {
        const creatorId = body.creatorId as string;
        const fanId = body.fanId as string;
        const fanDisplayName = body.fanDisplayName as string | undefined;
        const durationMinutes = (body.durationMinutes as number) || 15;

        if (!creatorId || !fanId) {
          return res.status(400).json({ error: "creatorId and fanId required" });
        }

        if (decoded.uid !== creatorId) {
          return res.status(403).json({ error: "Only creator can start instant video call" });
        }

        // Check creator's video chat quota
        const quotaCheck = await canCreatorStartVideoChat(creatorId, durationMinutes);
        if (!quotaCheck.allowed) {
          return res.status(403).json({ 
            error: "Video chat quota exceeded",
            reason: quotaCheck.reason,
            remainingMinutes: quotaCheck.remainingMinutes,
            monthlyLimit: quotaCheck.monthlyLimit,
          });
        }

        // Create session
        const sessionRef = db.collection("creators").doc(creatorId)
          .collection("liveVideoChats").doc();

        // Create Daily.co room immediately
        const { roomUrl, roomName } = await createVideoRoom(sessionRef.id, durationMinutes);

        const sessionData: Omit<LiveVideoChatSession, "id"> = {
          creatorId,
          fanId,
          fanDisplayName,
          productId: "instant_call",
          durationMinutes,
          minutesUsed: 0,
          amountPaidCents: 0, // Instant calls are free for fans
          creatorEarningsCents: 0,
          status: "accepted", // Skip pending state for instant calls
          roomUrl,
          roomName,
          requestedAt: new Date().toISOString(),
          acceptedAt: new Date().toISOString(),
        };

        await sessionRef.set(sessionData);

        // Notify the fan about the instant video call
        await sendFanNotification({
          fanId,
          type: 'video_chat_accepted',
          title: 'Video Call Invitation!',
          body: 'You have been invited to a live video call. Join now!',
          data: { sessionId: sessionRef.id, creatorId },
        });

        return res.status(201).json({ 
          sessionId: sessionRef.id,
          roomUrl,
          roomName,
          quotaRemaining: quotaCheck.remainingMinutes,
          session: { id: sessionRef.id, ...sessionData }
        });
      }

      // DELETE SESSION — creator removes a terminal session from the list (Firestore + optional Daily room cleanup)
      if (action === "deleteSession") {
        const sessionId = body.sessionId as string;
        const creatorId = body.creatorId as string;

        if (!sessionId || !creatorId) {
          return res.status(400).json({ error: "sessionId and creatorId required" });
        }

        if (decoded.uid !== creatorId) {
          return res.status(403).json({ error: "Only the creator can delete this session" });
        }

        const sessionRef = db.collection("creators").doc(creatorId).collection("liveVideoChats").doc(sessionId);
        const doc = await sessionRef.get();

        if (!doc.exists) {
          return res.status(404).json({ error: "Session not found" });
        }

        const session = toSession(doc);
        const deletable: LiveVideoChatStatus[] = ["completed", "declined", "cancelled", "expired"];
        if (!deletable.includes(session.status)) {
          return res.status(400).json({
            error: "Only completed, declined, cancelled, or expired sessions can be deleted",
          });
        }

        if (session.roomName) {
          await deleteVideoRoom(session.roomName).catch(() => {
            /* room may already be deleted */
          });
        }

        await sessionRef.delete();
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: "Invalid action" });
    } catch (e) {
      console.error("liveVideoChat POST error:", e);
      return res.status(500).json({ 
        error: "Failed to process request",
        details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined
      });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
