import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

type SessionAlertKind = "chat" | "video";

type SessionAlert = {
  id: string;
  kind: SessionAlertKind;
  title: string;
  ctaLabel: string;
  startsAt?: string;
  status: string;
};

function tsToIso(input: unknown): string | undefined {
  if (!input) return undefined;
  if (typeof input === "string") {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? undefined : input.toISOString();
  }
  if (typeof input === "object" && input !== null && typeof (input as { toDate?: () => Date }).toDate === "function") {
    const d = (input as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}

function withinWindow(startsAtIso: string | undefined, nowMs: number, minutesBefore = 5): boolean {
  if (!startsAtIso) return false;
  const startMs = new Date(startsAtIso).getTime();
  if (!Number.isFinite(startMs)) return false;
  return nowMs >= startMs - minutesBefore * 60 * 1000;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const creatorId = typeof req.query.creatorId === "string" ? req.query.creatorId.trim() : "";
  if (!creatorId) {
    return res.status(400).json({ error: "creatorId is required" });
  }

  const db = getAdminDb();
  if (!db) {
    return res.status(500).json({ error: "Database unavailable" });
  }

  try {
    const fanId = decoded.uid;
    const fanEmail =
      typeof (decoded as { email?: string }).email === "string"
        ? (decoded as { email?: string }).email!.trim().toLowerCase()
        : "";
    const nowMs = Date.now();

    const alerts: SessionAlert[] = [];

    // 1) Scheduled / active video sessions for this creator + fan.
    const videoSnap = await db
      .collection("creators")
      .doc(creatorId)
      .collection("liveVideoChats")
      .where("fanId", "==", fanId)
      .limit(60)
      .get();

    videoSnap.forEach((doc) => {
      const d = doc.data() as Record<string, unknown>;
      const status = typeof d.status === "string" ? d.status : "pending";
      if (!["accepted", "active"].includes(status)) return;
      const startsAt = tsToIso(d.scheduledFor) || tsToIso(d.acceptedAt);
      const isActive = status === "active";
      const show = isActive || withinWindow(startsAt, nowMs, 5);
      if (!show) return;
      alerts.push({
        id: doc.id,
        kind: "video",
        title: isActive ? "Video session is live" : "Video session starts soon",
        ctaLabel: isActive ? "Join video now" : "Open video session",
        startsAt,
        status,
      });
    });

    // 2) Scheduled / active chat sessions (creator side writes top-level chatSessions).
    // Match by fanId/memberId when available, otherwise by memberEmail.
    const chatSnap = await db
      .collection("chatSessions")
      .where("creatorId", "==", creatorId)
      .limit(120)
      .get();

    chatSnap.forEach((doc) => {
      const d = doc.data() as Record<string, unknown>;
      const status = typeof d.status === "string" ? d.status : "pending";
      if (["ended", "cancelled", "completed", "declined", "expired"].includes(status)) return;

      const fanMatch =
        (typeof d.fanId === "string" && d.fanId === fanId) ||
        (typeof d.memberId === "string" && d.memberId === fanId) ||
        (fanEmail &&
          ((typeof d.memberEmail === "string" && d.memberEmail.trim().toLowerCase() === fanEmail) ||
            (typeof d.fanEmail === "string" && d.fanEmail.trim().toLowerCase() === fanEmail)));
      if (!fanMatch) return;

      const startsAt = tsToIso(d.scheduledStart) || tsToIso(d.scheduledFor);
      const isActive = status === "active";
      const show = isActive || withinWindow(startsAt, nowMs, 5);
      if (!show) return;

      alerts.push({
        id: doc.id,
        kind: "chat",
        title: isActive ? "Chat session is live" : "Chat session starts soon",
        ctaLabel: isActive ? "Open chat now" : "Open chat session",
        startsAt,
        status,
      });
    });

    alerts.sort((a, b) => {
      const ta = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });

    return res.status(200).json({ alerts });
  } catch (error) {
    console.error("getFanSessionAlerts error:", error);
    return res.status(500).json({ error: "Failed to load session alerts" });
  }
}

