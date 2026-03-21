import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

const HANDLE_REGEX = /^[a-z0-9_]{3,20}$/;

/**
 * POST: Update creator storefront settings. Only the authenticated creator can update their own doc.
 * If handle changed: in a transaction, delete creatorHandles/{oldHandle} (if exists and belongs to this creator),
 * set creatorHandles/{newHandle} = { creatorId }, update creators/{creatorId}.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const creatorId = decoded.uid;
  const body = (req.body || {}) as Record<string, unknown>;

  const handle = typeof body.handle === "string" ? body.handle.replace("@", "").toLowerCase().trim() : "";
  if (handle && !HANDLE_REGEX.test(handle)) {
    return res.status(400).json({
      error: "Invalid handle",
      message: "Handle must be 3–20 characters, letters, numbers and underscores only",
    });
  }

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const creatorRef = db.collection("creators").doc(creatorId);
    const creatorSnap = await creatorRef.get();
    const existing = (creatorSnap.exists ? creatorSnap.data() : null) as { handle?: string } | null;
    const oldHandle = existing?.handle ? String(existing.handle).replace("@", "").toLowerCase().trim() : "";
    const handleChanged = handle && oldHandle !== handle;

    const existingData = existing as Record<string, unknown> | null;
    
    const payload: Record<string, unknown> = {
      handle: body.handle ?? existing?.handle ?? "",
      displayName: body.displayName !== undefined ? body.displayName : existingData?.displayName,
      bio: body.bio !== undefined ? body.bio : existingData?.bio,
      avatar: body.avatar !== undefined ? body.avatar : existingData?.avatar,
      avatarObjectPosition:
        body.avatarObjectPosition !== undefined ? body.avatarObjectPosition : existingData?.avatarObjectPosition,
      logo: body.logo !== undefined ? body.logo : existingData?.logo,
      showDisplayNameOnLanding: body.showDisplayNameOnLanding !== undefined ? body.showDisplayNameOnLanding : existingData?.showDisplayNameOnLanding,
      
      // Hero Section
      heroImage: body.heroImage !== undefined ? body.heroImage : existingData?.heroImage,
      heroMedia: body.heroMedia !== undefined ? body.heroMedia : existingData?.heroMedia,
      heroTagline: body.heroTagline !== undefined ? body.heroTagline : existingData?.heroTagline,
      heroPromise: body.heroPromise !== undefined ? body.heroPromise : existingData?.heroPromise,
      heroSubline: body.heroSubline !== undefined ? body.heroSubline : existingData?.heroSubline,
      heroSubline2: body.heroSubline2 !== undefined ? body.heroSubline2 : existingData?.heroSubline2,

      textStyles: body.textStyles !== undefined ? body.textStyles : existingData?.textStyles,

      // Social Links
      socialLinks: body.socialLinks !== undefined ? body.socialLinks : existingData?.socialLinks,
      
      // Landing Page Content
      landingContent: body.landingContent !== undefined ? body.landingContent : existingData?.landingContent,
      
      // Legal
      legal: body.legal !== undefined ? body.legal : existingData?.legal,
      
      theme: body.theme !== undefined ? body.theme : existingData?.theme,
      heroLayout: body.heroLayout !== undefined ? body.heroLayout : existingData?.heroLayout,
      sections: body.sections !== undefined ? body.sections : existingData?.sections,
      sectionsOrder: body.sectionsOrder !== undefined ? body.sectionsOrder : existingData?.sectionsOrder,
      spicyMode: body.spicyMode !== undefined ? body.spicyMode : existingData?.spicyMode,
      rules: body.rules !== undefined ? body.rules : existingData?.rules,
      monetization: body.monetization !== undefined ? body.monetization : existingData?.monetization,
      onboardingStatus: body.onboardingStatus !== undefined ? body.onboardingStatus : existingData?.onboardingStatus,
      updatedAt: new Date().toISOString(),
    };

    if (handleChanged) {
      await db.runTransaction(async (tx) => {
        if (oldHandle && HANDLE_REGEX.test(oldHandle)) {
          const oldHandleRef = db.collection("creatorHandles").doc(oldHandle);
          const oldSnap = await tx.get(oldHandleRef);
          if (oldSnap.exists) {
            const data = oldSnap.data() as { creatorId?: string };
            if (data?.creatorId === creatorId) tx.delete(oldHandleRef);
          }
        }
        if (handle) {
          tx.set(db.collection("creatorHandles").doc(handle), { creatorId });
        }
        tx.set(creatorRef, payload, { merge: true });
      });
    } else {
      await creatorRef.set(payload, { merge: true });
    }

    return res.status(200).json({ success: true, handle: payload.handle });
  } catch (e: unknown) {
    console.error("updateCreatorStorefront error:", e);
    const msg = e instanceof Error ? e.message : "Update failed";
    return res.status(500).json({ error: "Update failed", message: msg });
  }
}
