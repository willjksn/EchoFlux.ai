import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { normalizeHeroMediaForStorefront } from "../src/lib/storefrontHeroNormalize.js";

/**
 * Resolve creator by handle for fan storefront (echoflux.ai/{handle}).
 * 1) Read Firestore creatorHandles/{handle} -> creatorId (O(1) lookup).
 * 2) If missing, query creators collection where handle == handle, use doc.id as creatorId.
 * Returns creatorId + creator doc (avatar, displayName, theme, sections, etc.) or 404.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    (req.headers["x-real-ip"] as string | undefined) ||
    "anonymous";

  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "getCreatorByHandle",
    limit: 120,
    windowMs: 60 * 1000,
    identifier: ip,
  });
  if (!ok) return;

  const { handle: handleParam } = req.query;
  if (!handleParam || typeof handleParam !== "string") {
    return res.status(400).json({ error: "handle is required" });
  }

  const cleanHandle = decodeURIComponent(handleParam).replace("@", "").toLowerCase().trim();
  if (!cleanHandle) {
    return res.status(400).json({ error: "handle cannot be empty" });
  }

  try {
    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    let creatorId: string | null = null;
    let creatorData: Record<string, unknown> | null = null;

    // 1) creatorHandles/{handle} -> creatorId
    const creatorHandlesRef = db.collection("creatorHandles").doc(cleanHandle);
    const handleDoc = await creatorHandlesRef.get();
    if (handleDoc.exists && handleDoc.data()) {
      creatorId = (handleDoc.data() as { creatorId?: string })?.creatorId ?? null;
    }

    // Helper: prefer richer storefront docs when duplicate handles exist (legacy migrations).
    const storefrontScore = (data: Record<string, unknown> | null | undefined): number => {
      if (!data) return -1;
      let score = 0;
      if (typeof data.logo === "string" && data.logo.trim()) score += 8;
      if (typeof data.logoUrl === "string" && data.logoUrl.trim()) score += 8;
      if (typeof data.avatar === "string" && data.avatar.trim()) score += 5;
      if (typeof data.avatarUrl === "string" && data.avatarUrl.trim()) score += 5;
      if (Array.isArray(data.heroMedia) && data.heroMedia.length > 0) score += 6;
      if (typeof data.heroImage === "string" && data.heroImage.trim()) score += 4;
      if (typeof data.heroImageUrl === "string" && data.heroImageUrl.trim()) score += 4;
      if (data.landingContent && typeof data.landingContent === "object") score += 3;
      if (data.theme && typeof data.theme === "object") score += 2;
      if (typeof data.displayName === "string" && data.displayName.trim()) score += 2;
      if (typeof data.updatedAt === "string" && data.updatedAt.trim()) score += 1;
      return score;
    };

    // 2) Query creators by handle (always), then choose best match.
    const creatorsRef = db.collection("creators");
    let creatorsSnap: { empty: boolean; docs: Array<{ id: string; data: () => FirebaseFirestore.DocumentData }> } = {
      empty: true,
      docs: [],
    };
    try {
      creatorsSnap = await creatorsRef.where("handle", "==", cleanHandle).limit(10).get();
    } catch {
      creatorsSnap = { empty: true, docs: [] };
    }

    if (creatorId) {
      // We have creatorId from creatorHandles; load that doc first.
      const creatorDoc = await db.collection("creators").doc(creatorId).get();
      if (creatorDoc.exists) {
        creatorData = creatorDoc.data() as Record<string, unknown>;
      }
    }

    // If mapping is missing/stale, or another doc clearly has richer storefront data, use that.
    if (!creatorsSnap.empty) {
      let bestDoc = creatorsSnap.docs[0];
      let bestData = bestDoc.data() as Record<string, unknown>;
      let bestScore = storefrontScore(bestData);

      for (const d of creatorsSnap.docs.slice(1)) {
        const data = d.data() as Record<string, unknown>;
        const s = storefrontScore(data);
        if (s > bestScore) {
          bestDoc = d;
          bestData = data;
          bestScore = s;
        }
      }

      const mappedHandle =
        typeof creatorData?.handle === "string" ? String(creatorData.handle).replace("@", "").toLowerCase().trim() : "";
      const mappedScore = storefrontScore(creatorData);
      const mappedLooksStale =
        !creatorData ||
        mappedHandle !== cleanHandle ||
        (bestDoc.id !== creatorId && bestScore > mappedScore);

      if (!creatorId || mappedLooksStale) {
        creatorId = bestDoc.id;
        creatorData = bestData;
      }
    }

    if (!creatorId) {
      return res.status(404).json({ error: "Creator not found" });
    }

    const theme = (creatorData?.theme as Record<string, string> | undefined) || {};
    const sections = (creatorData?.sections as Record<string, boolean> | undefined) || {};
    const rules = (creatorData?.rules as Record<string, string> | undefined) || {};
    const socialLinks = creatorData?.socialLinks || undefined;
    const landingContent = creatorData?.landingContent || undefined;
    const legal = creatorData?.legal || undefined;
    const monetization = creatorData?.monetization || undefined;
    const textStyles = creatorData?.textStyles || undefined;
    const feedSettings = (creatorData?.feedSettings as { hideLikeCounts?: boolean; hideComments?: boolean; hideLikes?: boolean } | undefined) || undefined;
    const publicTreatsOnLanding = creatorData?.publicTreatsOnLanding === true;
    const fanAuthBranding = creatorData?.fanAuthBranding || undefined;

    const cd = creatorData as Record<string, unknown>;
    const heroMediaNorm = normalizeHeroMediaForStorefront(
      cd?.heroMedia,
      cd?.heroImage,
      cd?.heroImageUrl
    );
    const heroImageResolved =
      (typeof cd?.heroImage === "string" && cd.heroImage.trim()) ||
      (typeof cd?.heroImageUrl === "string" && (cd.heroImageUrl as string).trim()) ||
      heroMediaNorm[0]?.url ||
      undefined;

    const payload = {
      creatorId,
      handle: cleanHandle,
      displayName: (creatorData?.displayName as string) || cleanHandle,
      bio: (creatorData?.bio as string) || undefined,
      avatar: (creatorData?.avatar as string) || (creatorData?.avatarUrl as string) || undefined,
      avatarObjectPosition: (creatorData?.avatarObjectPosition as string) || undefined,
      logo: (creatorData?.logo as string) || (creatorData?.logoUrl as string) || undefined,
      showDisplayNameOnLanding: (creatorData?.showDisplayNameOnLanding as boolean) !== false,
      heroImage: heroImageResolved,
      /** Raw legacy field (optional); prefer `heroImage` + `heroMedia` which are normalized above. */
      heroImageUrl:
        typeof cd.heroImageUrl === "string" && (cd.heroImageUrl as string).trim()
          ? (cd.heroImageUrl as string).trim()
          : undefined,
      heroMedia: heroMediaNorm.length > 0 ? heroMediaNorm : undefined,
      heroTagline: (creatorData?.heroTagline as string) || undefined,
      heroPromise: (creatorData?.heroPromise as string) || undefined,
      heroSubline: (creatorData?.heroSubline as string) || undefined,
      heroSubline2: (creatorData?.heroSubline2 as string) || undefined,
      socialLinks,
      landingContent,
      legal,
      textStyles,
      theme: {
        primary: theme.primary || "#6366f1",
        background: theme.background || "#fafafa",
        text: theme.text || "#1f2937",
        buttonStyle: theme.buttonStyle || "solid",
        fontFamily: (theme as { fontFamily?: string }).fontFamily,
        presetId: (theme as { presetId?: string }).presetId,
      },
      heroLayout: (creatorData?.heroLayout as "default" | "centered" | "split" | "splitRight") || "default",
      sections: {
        feed: sections.feed !== false,
        treats: sections.treats !== false,
        tip: sections.tip !== false,
        messages: sections.messages !== false,
        about: sections.about !== false,
      },
      sectionsOrder: (creatorData?.sectionsOrder as string[] | undefined) || ["feed", "treats", "tip", "messages", "about"],
      spicyMode: !!creatorData?.spicyMode,
      rules: rules.boundariesText != null ? { boundariesText: rules.boundariesText } : undefined,
      monetization,
      feedSettings: feedSettings ? {
        hideLikeCounts: !!feedSettings.hideLikeCounts,
        hideComments: !!feedSettings.hideComments,
        hideLikes: !!feedSettings.hideLikes,
      } : undefined,
      publicTreatsOnLanding,
      fanAuthBranding,
    };

    return res.status(200).json(payload);
  } catch (error: unknown) {
    console.error("getCreatorByHandle error:", error);
    return res.status(500).json({
      error: "Failed to resolve creator",
      details: process.env.NODE_ENV === "development" ? (error as Error)?.message : undefined,
    });
  }
}
