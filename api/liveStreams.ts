import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { applyBrowserApiCors } from "./_browserApiCors.js";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import type { LiveStreamEventStatus } from "../types";

/**
 * Creator live stream events (schedule + ticket metadata).
 * Firestore: `creators/{creatorId}/liveStreams/{streamId}`
 *
 * POST body:
 * - { action: "create", title, scheduledStart, ticketCents?, freeForSubscribers?, description?, creatorTestOnly? }
 * - { action: "update", streamId, ...partial fields }
 *
 * GET: list recent streams for the authenticated creator (no query params).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyBrowserApiCors(req, res)) return;

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const creatorId = decoded.uid;
  const db = getAdminDb();
  const col = db.collection("creators").doc(creatorId).collection("liveStreams");

  if (req.method === "GET") {
    try {
      const snap = await col.orderBy("createdAt", "desc").limit(30).get();
      const streams = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
      return res.status(200).json({ streams });
    } catch (e) {
      console.error("liveStreams GET:", e);
      return res.status(500).json({ error: "Failed to list streams" });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}) as {
    action?: string;
    streamId?: string;
    title?: string;
    description?: string;
    scheduledStart?: string;
    ticketCents?: number;
    freeForSubscribers?: boolean;
    status?: LiveStreamEventStatus;
    promoPostId?: string;
    creatorTestOnly?: boolean;
  };

  try {
    if (body.action === "create") {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) {
        return res.status(400).json({ error: "title is required" });
      }
      const scheduledStart = typeof body.scheduledStart === "string" ? body.scheduledStart.trim() : "";
      if (!scheduledStart) {
        return res.status(400).json({ error: "scheduledStart (ISO) is required" });
      }
      const t = Date.parse(scheduledStart);
      if (!Number.isFinite(t)) {
        return res.status(400).json({ error: "scheduledStart must be a valid ISO date" });
      }
      const ticketCents =
        typeof body.ticketCents === "number" && Number.isFinite(body.ticketCents)
          ? Math.max(0, Math.floor(body.ticketCents))
          : 0;
      const freeForSubscribers = !!body.freeForSubscribers;
      const creatorTestOnly = body.creatorTestOnly === true;
      const description =
        typeof body.description === "string" && body.description.trim() ? body.description.trim() : undefined;

      const doc = {
        creatorId,
        title,
        status: "scheduled" as const,
        scheduledStart: new Date(t).toISOString(),
        ticketCents,
        freeForSubscribers,
        creatorTestOnly,
        ...(description ? { description } : {}),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      const ref = await col.add(doc);
      return res.status(201).json({ streamId: ref.id, ok: true });
    }

    if (body.action === "update") {
      const streamId = typeof body.streamId === "string" ? body.streamId.trim() : "";
      if (!streamId) {
        return res.status(400).json({ error: "streamId is required" });
      }
      const ref = col.doc(streamId);
      const existing = await ref.get();
      if (!existing.exists) {
        return res.status(404).json({ error: "Stream not found" });
      }

      const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
      if (typeof body.description === "string") patch.description = body.description.trim() || FieldValue.delete();
      if (typeof body.scheduledStart === "string" && body.scheduledStart.trim()) {
        const t = Date.parse(body.scheduledStart);
        if (Number.isFinite(t)) patch.scheduledStart = new Date(t).toISOString();
      }
      if (typeof body.ticketCents === "number" && Number.isFinite(body.ticketCents)) {
        patch.ticketCents = Math.max(0, Math.floor(body.ticketCents));
      }
      if (typeof body.freeForSubscribers === "boolean") patch.freeForSubscribers = body.freeForSubscribers;
      if (typeof body.status === "string") {
        const allowed: LiveStreamEventStatus[] = ["draft", "scheduled", "live", "ended", "cancelled"];
        if (allowed.includes(body.status as LiveStreamEventStatus)) {
          patch.status = body.status;
        }
      }
      if (typeof body.promoPostId === "string" && body.promoPostId.trim()) {
        patch.promoPostId = body.promoPostId.trim();
      }
      if (typeof body.creatorTestOnly === "boolean") {
        patch.creatorTestOnly = body.creatorTestOnly;
      }

      await ref.update(patch);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    console.error("liveStreams POST:", e);
    return res.status(500).json({ error: "Stream operation failed" });
  }
}
