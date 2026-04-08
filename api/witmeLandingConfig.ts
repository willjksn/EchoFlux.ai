import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import {
  DEFAULT_SHOWCASE_CREATORS,
  sanitizeHomeVisualCreators,
  sanitizeShowcaseCreators,
  type WitmeShowcaseCreator,
} from "./_witmeShowcase.js";

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
  homeHeroVisuals: WitmeShowcaseCreator[];
  homeExperienceVisuals: WitmeShowcaseCreator[];
  /** When true, hide “What you’ll find” image strip (no Discover/Featured fallback). */
  hideWhatYouFindStripMedia: boolean;
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
  homeHeroVisuals: [],
  homeExperienceVisuals: [],
  hideWhatYouFindStripMedia: false,
};

function sanitizeString(value: unknown, max = 300): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function sanitizeConfig(input: unknown): WitmeLandingConfig {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const hasShowcaseKey = Object.prototype.hasOwnProperty.call(src, "showcaseCreators");
  const showcaseCreators = sanitizeShowcaseCreators(src.showcaseCreators, hasShowcaseKey);
  const homeHeroVisuals = sanitizeHomeVisualCreators(src.homeHeroVisuals, 3);
  const homeExperienceVisuals = sanitizeHomeVisualCreators(src.homeExperienceVisuals, 4);

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
    homeHeroVisuals,
    homeExperienceVisuals,
    hideWhatYouFindStripMedia: src.hideWhatYouFindStripMedia === true,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection("siteConfig").doc("witmeLanding").get();
    const data = (snap.data() as { published?: unknown; publishedAt?: string; updatedAt?: string } | undefined) || {};
    const config = sanitizeConfig(data.published ?? DEFAULT_CONFIG);
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=120");
    res.status(200).json({
      success: true,
      config,
      publishedAt: data.publishedAt || null,
      updatedAt: data.updatedAt || null,
    });
  } catch (error) {
    console.error("witmeLandingConfig", error);
    res.status(200).json({ success: true, config: DEFAULT_CONFIG, publishedAt: null, updatedAt: null });
  }
}
