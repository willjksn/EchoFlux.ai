import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { enforceRateLimit } from "./_rateLimit.js";

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

    // 2) Fallback: query creators by handle
    if (!creatorId) {
      const creatorsRef = db.collection("creators");
      let creatorsSnap;
      try {
        creatorsSnap = await creatorsRef.where("handle", "==", cleanHandle).limit(1).get();
      } catch (e) {
        creatorsSnap = { empty: true, docs: [] };
      }
      if (!creatorsSnap.empty) {
        const doc = creatorsSnap.docs[0];
        creatorId = doc.id;
        creatorData = doc.data() as Record<string, unknown>;
      }
    } else {
      // We have creatorId from creatorHandles; load creator doc
      const creatorDoc = await db.collection("creators").doc(creatorId).get();
      if (creatorDoc.exists) {
        creatorData = creatorDoc.data() as Record<string, unknown>;
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

    const payload = {
      creatorId,
      handle: cleanHandle,
      displayName: (creatorData?.displayName as string) || cleanHandle,
      bio: (creatorData?.bio as string) || undefined,
      avatar: (creatorData?.avatar as string) || (creatorData?.avatarUrl as string) || undefined,
      logo: (creatorData?.logo as string) || undefined,
      heroImage: (creatorData?.heroImage as string) || undefined,
      heroTagline: (creatorData?.heroTagline as string) || undefined,
      heroPromise: (creatorData?.heroPromise as string) || undefined,
      socialLinks,
      landingContent,
      legal,
      textStyles,
      theme: {
        primary: theme.primary || "#d4558b",
        background: theme.background || "#fff2f8",
        text: theme.text || "#2f1a24",
        buttonStyle: theme.buttonStyle || "solid",
      },
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
