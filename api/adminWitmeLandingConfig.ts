import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { DEFAULT_SHOWCASE_CREATORS, sanitizeShowcaseCreators, type WitmeShowcaseCreator } from "./_witmeShowcase.js";

type FeatureCard = {
  title: string;
  description: string;
  icon: string;
};

type LegalLink = {
  label: string;
  url: string;
};

type WitmeLandingConfig = {
  heroBadge: string;
  heroTitle: string;
  heroDescription: string;
  heroTrustText: string;
  featureCards: FeatureCard[];
  trustItems: string[];
  liveMoments: string[];
  legalLinks: LegalLink[];
  showcaseCreators: WitmeShowcaseCreator[];
};

const DEFAULT_CONFIG: WitmeLandingConfig = {
  heroBadge: "witme.io",
  heroTitle: "Support the creators you love—in one place.",
  heroDescription:
    "Get closer with member drops, unlocks, tips, and DMs—all on their page. One link from their bio is all you need to back them for real.",
  heroTrustText: "One page. One link for fans.",
  featureCards: [
    { title: "Start memberships", description: "Join ongoing access when a creator opens member tiers.", icon: "👥" },
    { title: "Unlock store drops", description: "Get access to paid posts, drops, and off-feed content from Store.", icon: "🔓" },
    { title: "Send direct support", description: "Tip creators directly when support is enabled on their page.", icon: "💸" },
    {
      title: "Messages",
      description: "Chat with creators when they turn on messages—right from their page, no app hopping.",
      icon: "💬",
    },
    {
      title: "Catch every update",
      description:
        "Posts, store highlights, and shared links land on their page—keep up without digging through bios or scattered stories.",
      icon: "🔔",
    },
    { title: "Claim creator offers", description: "Access creator-specific offers, perks, and premium experiences.", icon: "✨" },
  ],
  trustItems: [
    "Creator pages on witme",
    "Secure checkout",
    "Creator-controlled access",
    "Built for fan safety",
  ],
  liveMoments: [
    "stormijxo posted a new private drop",
    "New posts went live on witme",
    "Fans unlocked a new drop",
    "Direct support was sent",
    "Creator pages updated today",
  ],
  legalLinks: [
    { label: "Terms", url: "/fan-terms-of-use.html" },
    { label: "Privacy", url: "/fan-privacy-policy.html" },
    { label: "Creator Terms", url: "/creator-terms-of-use.html" },
    { label: "Payments", url: "/payment-terms.html" },
    { label: "Guidelines", url: "/content-guidelines.html" },
    { label: "Support", url: "mailto:contact@echoflux.ai" },
  ],
  showcaseCreators: DEFAULT_SHOWCASE_CREATORS,
};

function sanitizeString(value: unknown, max = 300): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function sanitizeConfig(input: unknown): WitmeLandingConfig {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const hasShowcaseKey = Object.prototype.hasOwnProperty.call(src, "showcaseCreators");
  const showcaseCreators = sanitizeShowcaseCreators(src.showcaseCreators, hasShowcaseKey);

  const cardsRaw = Array.isArray(src.featureCards) ? src.featureCards : [];
  const featureCards: FeatureCard[] = cardsRaw
    .map((card) => {
      const c = (card && typeof card === "object" ? card : {}) as Record<string, unknown>;
      return {
        title: sanitizeString(c.title, 80),
        description: sanitizeString(c.description, 220),
        icon: sanitizeString(c.icon, 8),
      };
    })
    .filter((card) => card.title && card.description)
    .slice(0, 12);

  const trustItems = (Array.isArray(src.trustItems) ? src.trustItems : [])
    .map((v) => sanitizeString(v, 120))
    .filter(Boolean)
    .slice(0, 10);

  const liveMoments = (Array.isArray(src.liveMoments) ? src.liveMoments : [])
    .map((v) => sanitizeString(v, 120))
    .filter(Boolean)
    .slice(0, 20);

  const legalLinks = (Array.isArray(src.legalLinks) ? src.legalLinks : [])
    .map((row) => {
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        label: sanitizeString(r.label, 40),
        url: sanitizeString(r.url, 500),
      };
    })
    .filter((row) => row.label && row.url)
    .slice(0, 10);

  return {
    heroBadge: sanitizeString(src.heroBadge, 30) || DEFAULT_CONFIG.heroBadge,
    heroTitle: sanitizeString(src.heroTitle, 120) || DEFAULT_CONFIG.heroTitle,
    heroDescription: sanitizeString(src.heroDescription, 280) || DEFAULT_CONFIG.heroDescription,
    heroTrustText: sanitizeString(src.heroTrustText, 140) || DEFAULT_CONFIG.heroTrustText,
    featureCards: featureCards.length > 0 ? featureCards : DEFAULT_CONFIG.featureCards,
    trustItems: trustItems.length > 0 ? trustItems : DEFAULT_CONFIG.trustItems,
    liveMoments: liveMoments.length > 0 ? liveMoments : DEFAULT_CONFIG.liveMoments,
    legalLinks: legalLinks.length > 0 ? legalLinks : DEFAULT_CONFIG.legalLinks,
    showcaseCreators,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const authUser = await verifyAuth(req);
  if (!authUser?.uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const db = getAdminDb();
  const userSnap = await db.collection("users").doc(authUser.uid).get();
  const role = (userSnap.data() as { role?: string } | undefined)?.role;
  if (role !== "Admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  if (req.method === "GET") {
    const snap = await db.collection("siteConfig").doc("witmeLanding").get();
    const data =
      (snap.data() as {
        draft?: unknown;
        published?: unknown;
        updatedAt?: string;
        updatedBy?: string;
        publishedAt?: string;
        publishedBy?: string;
      } | undefined) || {};

    res.status(200).json({
      success: true,
      draft: sanitizeConfig(data.draft ?? data.published ?? DEFAULT_CONFIG),
      published: sanitizeConfig(data.published ?? DEFAULT_CONFIG),
      updatedAt: data.updatedAt || null,
      updatedBy: data.updatedBy || null,
      publishedAt: data.publishedAt || null,
      publishedBy: data.publishedBy || null,
    });
    return;
  }

  if (req.method !== "POST" && req.method !== "PUT") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let rawBody: Record<string, unknown> = {};
  const b = req.body;
  if (typeof b === "string") {
    try {
      rawBody = JSON.parse(b) as Record<string, unknown>;
    } catch {
      rawBody = {};
    }
  } else if (b && typeof b === "object" && !Array.isArray(b)) {
    rawBody = b as Record<string, unknown>;
  }

  const action = typeof rawBody.action === "string" ? rawBody.action : "saveDraft";
  const incomingConfig = sanitizeConfig(rawBody.config ?? DEFAULT_CONFIG);
  const now = new Date().toISOString();
  const ref = db.collection("siteConfig").doc("witmeLanding");
  const existing = await ref.get();
  const currentData =
    (existing.data() as { published?: unknown; draft?: unknown; publishedAt?: string; publishedBy?: string } | undefined) || {};

  if (action === "publish") {
    await ref.set(
      {
        draft: incomingConfig,
        published: incomingConfig,
        updatedAt: now,
        updatedBy: authUser.uid,
        publishedAt: now,
        publishedBy: authUser.uid,
      },
      { merge: true }
    );
    res.status(200).json({
      success: true,
      status: "published",
      publishedAt: now,
      updatedAt: now,
      draft: incomingConfig,
      published: incomingConfig,
    });
    return;
  }

  await ref.set(
    {
      draft: incomingConfig,
      // Keep stored published payload as-is on draft save (do not re-sanitize into Firestore — avoids clobbering legacy shapes).
      published: currentData.published ?? DEFAULT_CONFIG,
      updatedAt: now,
      updatedBy: authUser.uid,
      publishedAt: currentData.publishedAt ?? null,
      publishedBy: currentData.publishedBy ?? null,
    },
    { merge: true }
  );
  const publishedForResponse = sanitizeConfig(currentData.published ?? DEFAULT_CONFIG);
  res.status(200).json({
    success: true,
    status: "draft_saved",
    updatedAt: now,
    draft: incomingConfig,
    published: publishedForResponse,
  });
}
