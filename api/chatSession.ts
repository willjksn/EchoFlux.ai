import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

type ChatSessionDoc = {
  creatorId?: string;
  fanId?: string;
  memberId?: string;
  fanEmail?: string;
  memberEmail?: string;
  threadId?: string;
  status?: string;
  durationMinutes?: number;
  chatType?: string;
  startedAt?: unknown;
  createdAt?: unknown;
};

function toMs(input: unknown): number {
  if (!input) return 0;
  if (typeof input === "string") {
    const t = Date.parse(input);
    return Number.isNaN(t) ? 0 : t;
  }
  if (input instanceof Date) return input.getTime();
  if (typeof input === "number" && Number.isFinite(input)) return input < 1e12 ? input * 1000 : input;
  if (
    typeof input === "object" &&
    input !== null &&
    "toDate" in input &&
    typeof (input as { toDate?: () => Date }).toDate === "function"
  ) {
    return (input as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "seconds" in input &&
    typeof (input as { seconds?: unknown }).seconds === "number"
  ) {
    return ((input as { seconds: number }).seconds || 0) * 1000;
  }
  return 0;
}

function toIso(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}

function sessionSortMs(d: ChatSessionDoc): number {
  return toMs(d.startedAt) || toMs(d.createdAt) || 0;
}

function canAccessSession(
  session: ChatSessionDoc,
  requesterUid: string,
  requesterEmail: string | null,
  creatorIdFromQuery: string
): boolean {
  if (requesterUid === creatorIdFromQuery) return true;
  const fanId = typeof session.fanId === "string" ? session.fanId : "";
  const memberId = typeof session.memberId === "string" ? session.memberId : "";
  if (requesterUid && (requesterUid === fanId || requesterUid === memberId)) return true;
  const normalizedReqEmail = requesterEmail?.trim().toLowerCase() || "";
  const normalizedFanEmail = typeof session.fanEmail === "string" ? session.fanEmail.trim().toLowerCase() : "";
  const normalizedMemberEmail = typeof session.memberEmail === "string" ? session.memberEmail.trim().toLowerCase() : "";
  return !!normalizedReqEmail && (normalizedReqEmail === normalizedFanEmail || normalizedReqEmail === normalizedMemberEmail);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const decoded = await verifyAuth(req);
  if (!decoded?.uid) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  if (!db) return res.status(500).json({ error: "Database unavailable" });

  if (req.method === "GET") {
    const creatorId = typeof req.query.creatorId === "string" ? req.query.creatorId.trim() : "";
    const threadId = typeof req.query.threadId === "string" ? req.query.threadId.trim() : "";
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId.trim() : "";
    if (!creatorId) return res.status(400).json({ error: "creatorId is required" });
    if (!threadId && !sessionId) return res.status(400).json({ error: "threadId or sessionId is required" });

    try {
      const requesterEmail =
        typeof (decoded as { email?: string }).email === "string" ? (decoded as { email?: string }).email!.trim().toLowerCase() : null;

      let chosenId = "";
      let chosenData: ChatSessionDoc | null = null;
      if (sessionId) {
        const snap = await db.collection("chatSessions").doc(sessionId).get();
        if (snap.exists) {
          chosenId = snap.id;
          chosenData = snap.data() as ChatSessionDoc;
        }
      } else {
        const qSnap = await db.collection("chatSessions").where("creatorId", "==", creatorId).where("threadId", "==", threadId).limit(80).get();
        if (!qSnap.empty) {
          const rows = qSnap.docs.map((d) => ({ id: d.id, data: d.data() as ChatSessionDoc }));
          const liveRows = rows.filter((r) => {
            const st = typeof r.data.status === "string" ? r.data.status : "";
            return st === "active" || st === "paused";
          });
          const pool = liveRows.length > 0 ? liveRows : rows;
          pool.sort((a, b) => sessionSortMs(b.data) - sessionSortMs(a.data));
          chosenId = pool[0]?.id || "";
          chosenData = pool[0]?.data || null;
        }
      }

      if (!chosenData || !chosenId) {
        return res.status(200).json({ session: null });
      }

      if (!canAccessSession(chosenData, decoded.uid, requesterEmail, creatorId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const status = typeof chosenData.status === "string" ? chosenData.status : "active";
      const startedAtMs = toMs(chosenData.startedAt) || toMs(chosenData.createdAt);
      const durationMinutes =
        typeof chosenData.durationMinutes === "number" && Number.isFinite(chosenData.durationMinutes)
          ? Math.max(1, Math.min(180, Math.round(chosenData.durationMinutes)))
          : 15;
      const endsAtMs = startedAtMs > 0 ? startedAtMs + durationMinutes * 60_000 : 0;
      const now = Date.now();
      const expired = (status === "active" || status === "paused") && endsAtMs > 0 && now >= endsAtMs;

      let nextStatus = status;
      if (expired) {
        nextStatus = "ended";
        await db.collection("chatSessions").doc(chosenId).set(
          {
            status: "ended",
            endedAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
          },
          { merge: true }
        );
      }

      const remainingSeconds =
        endsAtMs > 0 && nextStatus !== "ended" ? Math.max(0, Math.ceil((endsAtMs - now) / 1000)) : 0;

      return res.status(200).json({
        session: {
          id: chosenId,
          creatorId: chosenData.creatorId || creatorId,
          fanId: chosenData.fanId || chosenData.memberId || null,
          threadId: chosenData.threadId || threadId || null,
          status: nextStatus,
          chatType: typeof chosenData.chatType === "string" ? chosenData.chatType : "Custom",
          durationMinutes,
          startedAt: toIso(startedAtMs),
          endsAt: toIso(endsAtMs),
          remainingSeconds,
        },
      });
    } catch (e) {
      console.error("chatSession GET error:", e);
      return res.status(500).json({ error: "Failed to load chat session" });
    }
  }

  if (req.method === "POST") {
    const body = (req.body || {}) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (action !== "end") return res.status(400).json({ error: "Unsupported action" });
    if (!sessionId) return res.status(400).json({ error: "sessionId is required" });

    try {
      const sessionRef = db.collection("chatSessions").doc(sessionId);
      const snap = await sessionRef.get();
      if (!snap.exists) return res.status(404).json({ error: "Session not found" });
      const d = snap.data() as ChatSessionDoc;
      const creatorId = typeof d.creatorId === "string" ? d.creatorId : "";
      const requesterEmail =
        typeof (decoded as { email?: string }).email === "string" ? (decoded as { email?: string }).email!.trim().toLowerCase() : null;
      if (!canAccessSession(d, decoded.uid, requesterEmail, creatorId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      await sessionRef.set(
        {
          status: "ended",
          endedAt: new Date().toISOString(),
          endedBy: decoded.uid,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return res.status(200).json({ success: true });
    } catch (e) {
      console.error("chatSession POST error:", e);
      return res.status(500).json({ error: "Failed to update chat session" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

