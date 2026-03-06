import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import type { TreatProduct, TreatProductType } from "../../types";

const COLLECTION = "products";

function toProduct(doc: FirebaseFirestore.DocumentSnapshot): TreatProduct {
  const d = doc.data() as Record<string, unknown>;
  return {
    id: doc.id,
    creatorId: d.creatorId as string,
    type: d.type as TreatProductType,
    title: d.title as string,
    description: d.description as string | undefined,
    priceCents: (d.priceCents as number) ?? 0,
    mediaUrl: d.mediaUrl as string | undefined,
    archived: !!(d.archived as boolean),
    visible: d.visible !== false,
    sortOrder: d.sortOrder as number | undefined,
    createdAt: d.createdAt as string,
    updatedAt: d.updatedAt as string,
  };
}

/**
 * GET: List products by creatorId. Public for storefront (visible only); creator auth can pass includeArchived=true.
 * POST: Create product (creator auth; creatorId must match uid).
 * PATCH: Update product (query id=; body: title, description, priceCents, mediaUrl, archived, visible, sortOrder).
 * DELETE: Delete product (query id=; creator auth).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const creatorId = req.query.creatorId as string | undefined;
    if (!creatorId) {
      return res.status(400).json({ error: "creatorId is required" });
    }
    const includeArchived = req.query.includeArchived === "true";
    const decoded = await verifyAuth(req);
    const isCreator = decoded?.uid === creatorId;

    try {
      const db = getAdminDb();
      if (!db) return res.status(500).json({ error: "Database unavailable" });

      let query = db.collection(COLLECTION).where("creatorId", "==", creatorId);
      // Creator with includeArchived: get all. Otherwise only non-archived.
      if (!includeArchived || !isCreator) {
        query = query.where("archived", "==", false) as FirebaseFirestore.Query;
      }
      // Simple query - sort client-side to avoid complex composite index requirements
      const snap = await query.limit(500).get();

      let products = snap.docs.map((doc) => toProduct(doc));
      if (!isCreator) {
        products = products.filter((p) => p.visible);
      }
      // Sort client-side: by sortOrder (ascending), then createdAt (descending)
      products.sort((a, b) => {
        const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (orderDiff !== 0) return orderDiff;
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime; // descending
      });
      return res.status(200).json({ products });
    } catch (e: unknown) {
      console.error("products list error:", e);
      return res.status(500).json({
        error: "Failed to list products",
        details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
      });
    }
  }

  if (req.method === "POST") {
    const decoded = await verifyAuth(req);
    if (!decoded?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const body = req.body as Record<string, unknown>;
    const creatorId = body.creatorId as string;
    if (creatorId !== decoded.uid) {
      return res.status(403).json({ error: "creatorId must match authenticated user" });
    }
    const type = (body.type as TreatProductType) || "custom";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }
    const priceCents = Math.max(0, Number(body.priceCents) || 0);
    const description = typeof body.description === "string" ? body.description.trim() : undefined;
    const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl.trim() : undefined;
    const visible = body.visible !== false;
    const now = new Date().toISOString();

    try {
      const db = getAdminDb();
      if (!db) return res.status(500).json({ error: "Database unavailable" });

      const ref = db.collection(COLLECTION).doc();
      const doc = {
        creatorId,
        type,
        title,
        description: description || null,
        priceCents,
        mediaUrl: mediaUrl || null,
        archived: false,
        visible,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      };
      await ref.set(doc);
      const product = toProduct(await ref.get());
      return res.status(201).json({ product });
    } catch (e: unknown) {
      console.error("products create error:", e);
      return res.status(500).json({
        error: "Failed to create product",
        details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
      });
    }
  }

  if (req.method === "PATCH") {
    const decoded = await verifyAuth(req);
    if (!decoded?.uid) return res.status(401).json({ error: "Unauthorized" });
    const productId = (req.query.id as string) || (req.body as Record<string, unknown>)?.id as string;
    if (!productId) return res.status(400).json({ error: "id is required" });
    const body = (req.body || {}) as Record<string, unknown>;

    try {
      const db = getAdminDb();
      if (!db) return res.status(500).json({ error: "Database unavailable" });
      const ref = db.collection(COLLECTION).doc(productId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: "Product not found" });
      const data = snap.data() as Record<string, unknown>;
      if (data.creatorId !== decoded.uid) return res.status(403).json({ error: "Forbidden" });

      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (typeof body.title === "string") updates.title = body.title.trim();
      if (body.description !== undefined) updates.description = body.description === "" ? null : body.description;
      if (typeof body.priceCents === "number") updates.priceCents = Math.max(0, body.priceCents);
      if (body.mediaUrl !== undefined) updates.mediaUrl = body.mediaUrl === "" ? null : body.mediaUrl;
      if (typeof body.archived === "boolean") updates.archived = body.archived;
      if (typeof body.visible === "boolean") updates.visible = body.visible;
      if (typeof body.sortOrder === "number") updates.sortOrder = body.sortOrder;
      if (typeof body.type === "string") updates.type = body.type;

      await ref.update(updates);
      const product = toProduct(await ref.get());
      return res.status(200).json({ product });
    } catch (e: unknown) {
      console.error("products update error:", e);
      return res.status(500).json({
        error: "Failed to update product",
        details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
      });
    }
  }

  if (req.method === "DELETE") {
    const decoded = await verifyAuth(req);
    if (!decoded?.uid) return res.status(401).json({ error: "Unauthorized" });
    const productId = (req.query.id as string) || (req.body as Record<string, unknown>)?.id as string;
    if (!productId) return res.status(400).json({ error: "id is required" });

    try {
      const db = getAdminDb();
      if (!db) return res.status(500).json({ error: "Database unavailable" });
      const ref = db.collection(COLLECTION).doc(productId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: "Product not found" });
      const data = snap.data() as Record<string, unknown>;
      if (data.creatorId !== decoded.uid) return res.status(403).json({ error: "Forbidden" });
      await ref.delete();
      return res.status(200).json({ success: true });
    } catch (e: unknown) {
      console.error("products delete error:", e);
      return res.status(500).json({
        error: "Failed to delete product",
        details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
      });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
