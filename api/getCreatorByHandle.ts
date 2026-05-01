import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { mergeFanHubStorefrontTheme } from "./_mergeFanHubStorefrontTheme.js";
import { normalizeHeroMediaForStorefront } from "./_storefrontHeroNormalize.js";
import { jsonSafeForApiResponse } from "./_jsonSafeForApiResponse.js";
import { verifyAuth } from "./verifyAuth.js";

type GeoAccessInviteCode = {
  code?: string;
  active?: boolean;
  expiresAt?: string;
};

type GeoAccessSettings = {
  enabled?: boolean;
  blockedCountries?: string[];
  blockedUsStates?: string[];
  exemptActivePaidMembers?: boolean;
  inviteBypassCodes?: GeoAccessInviteCode[];
};

type RequestGeo = {
  country: string;
  region: string;
};

function upperToken(v: unknown): string {
  return typeof v === "string" ? v.trim().toUpperCase() : "";
}

function lowerToken(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function parseGeoFromHeaders(req: VercelRequest): RequestGeo {
  const country = upperToken(
    req.headers["x-vercel-ip-country"] ||
    req.headers["cf-ipcountry"] ||
    req.headers["x-country-code"] ||
    ""
  );
  const region = upperToken(
    req.headers["x-vercel-ip-country-region"] ||
    req.headers["x-geo-region"] ||
    req.headers["x-region-code"] ||
    ""
  );
  return { country, region };
}

function normalizeGeoAccess(raw: unknown): GeoAccessSettings {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    blockedCountries: Array.isArray(o.blockedCountries)
      ? o.blockedCountries.map((v) => upperToken(v)).filter(Boolean)
      : [],
    blockedUsStates: Array.isArray(o.blockedUsStates)
      ? o.blockedUsStates.map((v) => upperToken(v)).filter(Boolean)
      : [],
    exemptActivePaidMembers: o.exemptActivePaidMembers === true,
    inviteBypassCodes: Array.isArray(o.inviteBypassCodes)
      ? o.inviteBypassCodes
        .filter((v) => !!v && typeof v === "object")
        .map((v) => v as GeoAccessInviteCode)
      : [],
  };
}

function isInviteBypassValid(geo: GeoAccessSettings, inviteParam: unknown): boolean {
  const invite = lowerToken(inviteParam);
  if (!invite) return false;
  const codes = Array.isArray(geo.inviteBypassCodes) ? geo.inviteBypassCodes : [];
  for (const c of codes) {
    const code = lowerToken(c?.code);
    if (!code || code !== invite) continue;
    if (c?.active === false) continue;
    if (typeof c?.expiresAt === "string" && c.expiresAt.trim()) {
      const t = new Date(c.expiresAt).getTime();
      if (!Number.isNaN(t) && Date.now() > t) continue;
    }
    return true;
  }
  return false;
}

async function isActivePaidMember(
  db: FirebaseFirestore.Firestore,
  creatorId: string,
  fanId: string
): Promise<boolean> {
  const snap = await db
    .collection("creatorSubscribers")
    .doc(creatorId)
    .collection("subscribers")
    .doc(fanId)
    .get();
  if (!snap.exists) return false;
  const status = lowerToken((snap.data() as { status?: unknown } | undefined)?.status);
  return status === "active" || status === "trialing";
}

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

    // If mapping is missing/stale, choose best candidate by storefront richness.
    // IMPORTANT: when creatorHandles mapping resolves to a valid creator doc, keep it authoritative
    // so live landing/theme/monetization match the creator's own page.
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
      const mappedDocIsValid = !!creatorId && !!creatorData && mappedHandle === cleanHandle;

      // Only fallback when mapping was missing or clearly invalid.
      if (!mappedDocIsValid) {
        creatorId = bestDoc.id;
        creatorData = bestData;
      }
    }

    if (!creatorId || !creatorData) {
      return res.status(404).json({ error: "Creator not found" });
    }

    const cd = creatorData as Record<string, unknown>;
    const geo = normalizeGeoAccess(cd.geoAccess);
    const reqGeo = parseGeoFromHeaders(req);

    let geoBypassed = false;
    const geoRulesApply =
      (Array.isArray(geo.blockedCountries) && geo.blockedCountries.length > 0) ||
      (Array.isArray(geo.blockedUsStates) && geo.blockedUsStates.length > 0);
    if (geoRulesApply) {
      // Direct-link invite bypass (`?invite=CODE`) for specific members.
      if (isInviteBypassValid(geo, req.query.invite)) {
        geoBypassed = true;
      } else if (geo.exemptActivePaidMembers) {
        // Existing paid members can bypass country/state block checks.
        const decoded = await verifyAuth(req);
        if (decoded?.uid) {
          try {
            geoBypassed = await isActivePaidMember(db, creatorId, decoded.uid);
          } catch {
            geoBypassed = false;
          }
        }
      }

      if (!geoBypassed) {
        const blockedCountries = new Set((geo.blockedCountries || []).map((v) => upperToken(v)));
        const blockedStates = new Set((geo.blockedUsStates || []).map((v) => upperToken(v)));
        const countryBlocked = !!reqGeo.country && blockedCountries.has(reqGeo.country);
        const stateBlocked = reqGeo.country === "US" && !!reqGeo.region && blockedStates.has(reqGeo.region);
        if (countryBlocked || stateBlocked) {
          return res.status(451).json({
            error: "This page is not available in your region.",
            code: "GEO_BLOCKED",
            blocked: { country: reqGeo.country || undefined, state: reqGeo.region || undefined },
          });
        }
      }
    }

    const theme = mergeFanHubStorefrontTheme(creatorData.theme as Record<string, unknown> | undefined);
    const sections = (creatorData.sections as Record<string, boolean> | undefined) || {};
    const rules = (creatorData.rules as Record<string, string> | undefined) || {};
    const socialLinks = creatorData.socialLinks || undefined;
    const landingContent = creatorData.landingContent || undefined;
    const legal = creatorData.legal || undefined;
    const monetization =
      (creatorData.monetization as Record<string, unknown> | undefined) ||
      (typeof cd?.freeAccessEnabled === "boolean" || typeof cd?.tipsEnabled === "boolean" || typeof cd?.monthlyPrice === "number"
        ? {
            freeAccessEnabled: cd?.freeAccessEnabled === true,
            tipsEnabled: cd?.tipsEnabled !== false,
            ...(typeof cd?.monthlyPrice === "number" ? { monthlyPrice: cd.monthlyPrice } : {}),
          }
        : undefined);
    const textStyles = creatorData.textStyles || undefined;
    const feedSettings = (
      creatorData.feedSettings as
        | { hideLikeCounts?: boolean; hideComments?: boolean; hideLikes?: boolean; hideTipButton?: boolean }
        | undefined
    ) || undefined;
    const publicTreatsOnLanding = creatorData.publicTreatsOnLanding === true;
    const fanAuthBranding = creatorData.fanAuthBranding || undefined;

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
      displayName: (creatorData.displayName as string) || cleanHandle,
      bio: (creatorData.bio as string) || undefined,
      avatar: (creatorData.avatar as string) || (creatorData.avatarUrl as string) || undefined,
      avatarObjectPosition: (creatorData.avatarObjectPosition as string) || undefined,
      logo: (creatorData.logo as string) || (creatorData.logoUrl as string) || undefined,
      showDisplayNameOnLanding: (creatorData.showDisplayNameOnLanding as boolean) !== false,
      heroImage: heroImageResolved,
      /** Raw legacy field (optional); prefer `heroImage` + `heroMedia` which are normalized above. */
      heroImageUrl:
        typeof cd?.heroImageUrl === "string" && (cd.heroImageUrl as string).trim()
          ? (cd.heroImageUrl as string).trim()
          : undefined,
      heroMedia: heroMediaNorm.length > 0 ? heroMediaNorm : undefined,
      heroTagline: (creatorData.heroTagline as string) || undefined,
      heroPromise: (creatorData.heroPromise as string) || undefined,
      heroSubline: (creatorData.heroSubline as string) || undefined,
      heroSubline2: (creatorData.heroSubline2 as string) || undefined,
      socialLinks,
      landingContent,
      legal,
      textStyles,
      theme: {
        primary: theme.primary || "#6366f1",
        background: theme.background || "#fafafa",
        text: theme.text || "#1f2937",
        textMuted: theme.textMuted,
        border: theme.border,
        accentHover: theme.accentHover,
        buttonStyle: theme.buttonStyle || "solid",
        fontFamily: theme.fontFamily,
        presetId: theme.presetId,
      },
      heroLayout: (creatorData.heroLayout as "default" | "centered" | "split" | "splitRight") || "default",
      sections: {
        feed: sections.feed !== false,
        treats: sections.treats !== false,
        tip: sections.tip !== false,
        messages: sections.messages !== false,
        about: false,
      },
      sectionsOrder: ((creatorData.sectionsOrder as string[] | undefined) || ["feed", "treats", "tip", "messages"]).filter(
        (key) => key !== "about",
      ),
      spicyMode: !!creatorData.spicyMode,
      rules: rules.boundariesText != null ? { boundariesText: rules.boundariesText } : undefined,
      monetization,
      feedSettings: feedSettings ? {
        hideLikeCounts: !!feedSettings.hideLikeCounts,
        hideComments: !!feedSettings.hideComments,
        hideLikes: !!feedSettings.hideLikes,
        hideTipButton: !!feedSettings.hideTipButton,
      } : undefined,
      publicTreatsOnLanding,
      fanAuthBranding,
    };

    return res.status(200).json(jsonSafeForApiResponse(payload));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("getCreatorByHandle error:", error);
    return res.status(500).json({
      error: "Failed to resolve creator",
      details:
        process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview"
          ? msg
          : undefined,
    });
  }
}
