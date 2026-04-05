import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import type { TreatProduct, TreatProductType } from "../types";
import { creatorIdFirestoreQueryVariants, normalizeCreatorId } from "../src/lib/creatorIdNormalize.js";

const COLLECTION = "products";

/** Firestore may store dates as Timestamp objects; JSON responses and Date parsing need ISO strings. */
function firestoreFieldToIsoString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v).toISOString();
  if (typeof v === "object") {
    const o = v as { toDate?: () => Date; _seconds?: number; _nanoseconds?: number };
    if (typeof o.toDate === "function") {
      try {
        const d = o.toDate();
        if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
      } catch {
        /* ignore */
      }
    }
    if (typeof o._seconds === "number") {
      const ns = typeof o._nanoseconds === "number" ? o._nanoseconds : 0;
      return new Date(o._seconds * 1000 + ns / 1e6).toISOString();
    }
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function toOptionalNonNegativeInt(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return undefined;
}

function toProduct(doc: FirebaseFirestore.DocumentSnapshot): TreatProduct {
  const d = doc.data() as Record<string, unknown>;
  const q = toOptionalNonNegativeInt(d.quantityLimit);
  const s = toOptionalNonNegativeInt(d.soldCount);
  const rawCreator = String(d.creatorId ?? "");
  const createdAt = firestoreFieldToIsoString(d.createdAt) || new Date(0).toISOString();
  const updatedAt = firestoreFieldToIsoString(d.updatedAt) || createdAt;
  return {
    id: doc.id,
    creatorId: normalizeCreatorId(rawCreator) || rawCreator,
    type: ((d.type as TreatProductType) || "custom") as TreatProductType,
    title: d.title as string,
    description: d.description as string | undefined,
    priceCents: (d.priceCents as number) ?? 0,
    mediaUrl: d.mediaUrl as string | undefined,
    imageUrl: d.imageUrl as string | undefined,
    archived: !!(d.archived as boolean),
    visible: d.visible !== false,
    showOnLandingPage: d.showOnLandingPage !== false,
    showInMemberStore: d.showInMemberStore !== false,
    sortOrder: d.sortOrder as number | undefined,
    quantityLimit: q,
    soldCount: s,
    createdAt,
    updatedAt,
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
    const creatorIdParam = req.query.creatorId as string | undefined;
    if (!creatorIdParam?.trim()) {
      return res.status(400).json({ error: "creatorId is required" });
    }
    const includeArchived = req.query.includeArchived === "true";
    const decoded = await verifyAuth(req);
    const normParam = normalizeCreatorId(creatorIdParam);
    const isCreator = Boolean(decoded?.uid && normalizeCreatorId(decoded.uid) === normParam);

    try {
      const db = getAdminDb();
      if (!db) return res.status(500).json({ error: "Database unavailable" });

      /**
       * Product docs may use legacy `creatorId` strings (e.g. `uid--collection=members`) while
       * storefront APIs pass the canonical Auth uid — a single equality query would return zero rows.
       */
      const variants = creatorIdFirestoreQueryVariants(creatorIdParam);
      const seenDocIds = new Set<string>();
      let products: TreatProduct[] = [];
      const skipArchived = !isCreator || !includeArchived;
      for (const cid of variants) {
        try {
          // Single-field query only: compound (creatorId + archived) often lacks a Firestore index and
          // fails for anonymous landing requests; filter archived in memory instead.
          const query = db.collection(COLLECTION).where("creatorId", "==", cid);
          const snap = await query.limit(500).get();
          for (const doc of snap.docs) {
            if (seenDocIds.has(doc.id)) continue;
            seenDocIds.add(doc.id);
            try {
              const p = toProduct(doc);
              if (skipArchived && p.archived) continue;
              products.push(p);
            } catch (docErr) {
              console.warn("products GET: skip corrupt product doc", doc.id, docErr);
            }
          }
        } catch (variantErr) {
          console.warn("products GET: variant query failed", { creatorIdVariant: cid, variantErr });
        }
      }
      if (!isCreator) {
        products = products.filter((p) => p.visible);
        const ctx = typeof req.query.context === "string" ? req.query.context : "";
        if (ctx === "landing") {
          products = products.filter((p) => p.showOnLandingPage !== false);
        } else if (ctx === "member") {
          products = products.filter((p) => p.showInMemberStore !== false);
        }
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
    const rawBodyCreator = String(body.creatorId ?? "").trim();
    const fromBody = normalizeCreatorId(rawBodyCreator) || rawBodyCreator;
    const authUid = normalizeCreatorId(decoded.uid) || decoded.uid;
    if (!fromBody || fromBody !== authUid) {
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
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : undefined;
    const visible = body.visible !== false;
    const showOnLandingPage = body.showOnLandingPage !== false;
    const showInMemberStore = body.showInMemberStore !== false;
    const quantityLimit =
      typeof body.quantityLimit === "number" && body.quantityLimit >= 0
        ? Math.floor(body.quantityLimit)
        : undefined;
    const now = new Date().toISOString();

    try {
      const db = getAdminDb();
      if (!db) return res.status(500).json({ error: "Database unavailable" });

      const ref = db.collection(COLLECTION).doc();
      const doc: Record<string, unknown> = {
        creatorId: decoded.uid,
        type,
        title,
        description: description || null,
        priceCents,
        mediaUrl: mediaUrl || null,
        imageUrl: imageUrl || null,
        archived: false,
        visible,
        showOnLandingPage,
        showInMemberStore,
        sortOrder: 0,
        soldCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      if (quantityLimit !== undefined) doc.quantityLimit = quantityLimit;
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
      const storedCreator = String(data.creatorId ?? "");
      const authUid = normalizeCreatorId(decoded.uid) || decoded.uid;
      if (normalizeCreatorId(storedCreator) !== authUid) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (typeof body.title === "string") updates.title = body.title.trim();
      if (body.description !== undefined) updates.description = body.description === "" ? null : body.description;
      if (typeof body.priceCents === "number") updates.priceCents = Math.max(0, body.priceCents);
      if (body.mediaUrl !== undefined) updates.mediaUrl = body.mediaUrl === "" ? null : body.mediaUrl;
      if (typeof body.archived === "boolean") updates.archived = body.archived;
      if (typeof body.visible === "boolean") updates.visible = body.visible;
      if (typeof body.showOnLandingPage === "boolean") updates.showOnLandingPage = body.showOnLandingPage;
      if (typeof body.showInMemberStore === "boolean") updates.showInMemberStore = body.showInMemberStore;
      if (typeof body.sortOrder === "number") updates.sortOrder = body.sortOrder;
      if (typeof body.type === "string") updates.type = body.type;
      if (body.quantityLimit !== undefined) {
        updates.quantityLimit =
          body.quantityLimit === null || body.quantityLimit === ""
            ? null
            : Math.max(0, Math.floor(Number(body.quantityLimit)));
      }
      if (typeof body.imageUrl === "string") updates.imageUrl = body.imageUrl.trim() || null;

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
      const storedCreator = String(data.creatorId ?? "");
      const authUid = normalizeCreatorId(decoded.uid) || decoded.uid;
      if (normalizeCreatorId(storedCreator) !== authUid) {
        return res.status(403).json({ error: "Forbidden" });
      }
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
