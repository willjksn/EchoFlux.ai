import React, { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SHOWCASE_CREATORS,
  WITME_DEFAULT_FEATURED_CREATOR,
  type WitmeShowcaseCreator,
  witmeCreatorPagePath,
} from "../src/lib/witmeShowcase";
import { WITME_DISCOVER_OG_IMAGE_PATH, WITME_OG_IMAGE_PATH } from "../src/lib/witmePublicAssets";
import { WITME_FIRST_CREATOR_SLUG, witmePublicHref } from "../src/lib/witmeFirstCreator";
import { shouldUseWitmeApi, trackWitmeEvent } from "../src/lib/witmeTrackEvent";
import { ShowcaseMedia } from "./witme-home/ShowcaseMedia";
import { useWitmeSeo } from "./witme-home/useWitmeSeo";
import {
  pickFeaturedShowcaseCreators,
  WitmeCreatorStudioSection,
  WitmeEarlySection,
  WitmeExperienceTypesSection,
  WitmeFeaturedCreatorsSection,
  WitmeHeroSection,
  WitmeMarketingFooter,
  WitmeWhySection,
} from "./witme-home/WitmeLandingSections";
import { WITME_LANDING_SECTION_CLASS, WitmePublicPageShell } from "./witme-home/WitmePublicPageShell";

interface WitmeHomepageProps {
  echofluxUrl?: string;
  previewConfig?: WitmeLandingConfig;
  disableSeo?: boolean;
  disableTracking?: boolean;
  disableRemoteConfig?: boolean;
}

const liveStorefrontHref = (c: WitmeShowcaseCreator): string | null => {
  if (!c.linkLive) return null;
  const path = witmeCreatorPagePath(c.pageSlug);
  return path || null;
};

interface ActionItem {
  title: string;
  description: string;
  icon: string;
}

interface LegalLink {
  label: string;
  url: string;
}

export interface WitmeLandingConfig {
  heroBadge: string;
  heroTitle: string;
  heroDescription: string;
  heroTrustText: string;
  featureCards: ActionItem[];
  trustItems: string[];
  liveMoments: string[];
  legalLinks: LegalLink[];
  showcaseCreators: WitmeShowcaseCreator[];
  /** When non-empty, hero collage uses these (max 3) instead of Discover/Featured media. */
  homeHeroVisuals: WitmeShowcaseCreator[];
  /** When non-empty, “What you’ll find” strip uses these (max 4) instead of Discover/Featured. */
  homeExperienceVisuals: WitmeShowcaseCreator[];
  /** When true, hide the right-column image strip on witme.io (no fallback to Discover/Featured). */
  hideWhatYouFindStripMedia?: boolean;
}

const fanActions: ActionItem[] = [
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
];

const trustItems = ["Creator pages on witme", "Secure checkout", "Creator-controlled access", "Built for fan safety"];

const liveMoments = [
  "stormijxo posted a new private drop",
  "New posts went live on witme",
  "Fans unlocked a new drop",
  "Direct support was sent",
  "Creator pages updated today",
];

const defaultLegalLinks: LegalLink[] = [
  { label: "Terms", url: "/fan-terms-of-use.html" },
  { label: "Privacy", url: "/fan-privacy-policy.html" },
  { label: "Creator Terms", url: "/creator-terms-of-use.html" },
  { label: "Payments", url: "/payment-terms.html" },
  { label: "Guidelines", url: "/content-guidelines.html" },
  { label: "Support", url: "mailto:contact@echoflux.ai" },
];

const defaultWitmeConfig: WitmeLandingConfig = {
  heroBadge: "witme.io",
  heroTitle: "Support the creators you love—in one place.",
  heroDescription:
    "Get closer with member drops, unlocks, tips, and DMs—all on their page. One link from their bio is all you need to back them for real.",
  heroTrustText: "One page. One link for fans.",
  featureCards: fanActions,
  trustItems,
  liveMoments,
  legalLinks: defaultLegalLinks,
  showcaseCreators: DEFAULT_SHOWCASE_CREATORS,
  homeHeroVisuals: [],
  homeExperienceVisuals: [],
};

const normalizeLandingFeatureCards = (cards: ActionItem[]): ActionItem[] =>
  cards.map((c) => {
    const updatesCard = {
      title: "Catch every update",
      description:
        "Posts, store highlights, and shared links land on their page—keep up without digging through bios or scattered stories.",
    };
    if (c.title === "Book store sessions" || c.title === "Book sessions" || c.title === "Private sessions") {
      return { ...c, ...updatesCard, icon: "🔔" };
    }
    if (c.title === "Open direct chat") {
      return {
        ...c,
        title: "Messages",
        description: "Chat with creators when they turn on messages—right from their page, no app hopping.",
      };
    }
    return c;
  });

const normalizeLandingCopy = (config: WitmeLandingConfig): WitmeLandingConfig => {
  let { heroTitle, heroDescription, heroTrustText } = config;
  if (heroTitle.trim() === "Find the real creator page first.") {
    heroTitle = defaultWitmeConfig.heroTitle;
  }
  if (heroTitle.trim() === "Discover creators. Support them in one place.") {
    heroTitle = defaultWitmeConfig.heroTitle;
  }
  if (/powered by echoflux/i.test(heroDescription)) {
    heroDescription = defaultWitmeConfig.heroDescription;
  }
  if (/verify creator pages/i.test(heroDescription)) {
    heroDescription = defaultWitmeConfig.heroDescription;
  }
  if (/without extra apps or hunting for the right link/i.test(heroDescription)) {
    heroDescription = defaultWitmeConfig.heroDescription;
  }
  if (/echoflux/i.test(heroTrustText)) {
    heroTrustText = defaultWitmeConfig.heroTrustText;
  }
  return { ...config, heroTitle, heroDescription, heroTrustText };
};

const useWitmeLandingConfig = (enabled = true): WitmeLandingConfig => {
  const [config, setConfig] = useState<WitmeLandingConfig>(defaultWitmeConfig);

  useEffect(() => {
    if (!enabled) return;
    if (!shouldUseWitmeApi()) return;
    const ac = new AbortController();
    const load = async () => {
      try {
        const res = await fetch("/api/witmeLandingConfig", { signal: ac.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (!data?.config) return;
        setConfig((prev) => {
          const nextBase = { ...prev, ...data.config } as WitmeLandingConfig;
          const mapShowcase = (c: WitmeShowcaseCreator) => ({
            ...c,
            mediaKind: c.mediaKind === "video" ? "video" : "image",
            mediaObjectPosition:
              typeof c.mediaObjectPosition === "string" && c.mediaObjectPosition.trim() !== ""
                ? c.mediaObjectPosition.trim()
                : "50% 50%",
            mediaScale:
              typeof c.mediaScale === "number" && Number.isFinite(c.mediaScale)
                ? Math.max(0.5, Math.min(2.5, c.mediaScale))
                : 1,
            isFeatured: c.isFeatured === true,
            featuredMediaFit: c.featuredMediaFit === "contain" ? "contain" : "cover",
          });
          const merged: WitmeLandingConfig = {
            ...nextBase,
            featureCards: Array.isArray(data.config.featureCards)
              ? normalizeLandingFeatureCards(data.config.featureCards as ActionItem[])
              : nextBase.featureCards,
            showcaseCreators: Array.isArray(data.config.showcaseCreators)
              ? data.config.showcaseCreators.map((c: WitmeShowcaseCreator) => mapShowcase(c))
              : nextBase.showcaseCreators,
            homeHeroVisuals: Array.isArray(data.config.homeHeroVisuals)
              ? data.config.homeHeroVisuals.map((c: WitmeShowcaseCreator) => mapShowcase(c))
              : nextBase.homeHeroVisuals,
            homeExperienceVisuals: Array.isArray(data.config.homeExperienceVisuals)
              ? data.config.homeExperienceVisuals.map((c: WitmeShowcaseCreator) => mapShowcase(c))
              : nextBase.homeExperienceVisuals,
            hideWhatYouFindStripMedia: data.config.hideWhatYouFindStripMedia === true,
          };
          return normalizeLandingCopy(merged);
        });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    };
    void load();
    return () => ac.abort();
  }, [enabled]);

  return config;
};

const WITME_HOME_SEO_DESCRIPTION =
  "WitMe is a growing platform where creators build their own pages — their own experience, their own rules. No forced format. No one-size-fits-all feed.";

export const WitmeHomepage: React.FC<WitmeHomepageProps> = ({
  echofluxUrl = "https://echoflux.ai",
  previewConfig,
  disableSeo = false,
  disableTracking = false,
  disableRemoteConfig = false,
}) => {
  const remoteConfig = useWitmeLandingConfig(!disableRemoteConfig);
  const landingConfig = useMemo(() => {
    const raw = previewConfig || remoteConfig;
    const base = normalizeLandingCopy({
      ...raw,
      featureCards: normalizeLandingFeatureCards(raw.featureCards),
    });
    return {
      ...base,
      homeHeroVisuals: base.homeHeroVisuals ?? [],
      homeExperienceVisuals: base.homeExperienceVisuals ?? [],
      hideWhatYouFindStripMedia: base.hideWhatYouFindStripMedia === true,
    };
  }, [previewConfig, remoteConfig]);

  useWitmeSeo({
    title: "witme.io — Different creators. Different worlds. One place.",
    description: WITME_HOME_SEO_DESCRIPTION,
    path: "/",
    imageUrl: WITME_OG_IMAGE_PATH,
    enabled: !disableSeo,
  });

  useEffect(() => {
    if (!disableTracking) trackWitmeEvent("page_view", { surface: "home" });
  }, [disableTracking]);

  const firstCreatorPath = witmeCreatorPagePath(WITME_FIRST_CREATOR_SLUG);
  const featuredCreators = useMemo(() => {
    const list = pickFeaturedShowcaseCreators(landingConfig.showcaseCreators);
    return list.length > 0 ? list : [WITME_DEFAULT_FEATURED_CREATOR];
  }, [landingConfig.showcaseCreators]);

  /** When hero / experience CMS lists are empty, derive visuals from Discover + Featured (legacy behavior). */
  const derivedLandingVisuals = useMemo(() => {
    const withMedia = landingConfig.showcaseCreators.filter((c) => c.imageUrl.trim());
    const sorted = [...withMedia].sort((a, b) => {
      if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
      if (a.linkLive !== b.linkLive) return a.linkLive ? -1 : 1;
      return 0;
    });
    return sorted.length > 0 ? sorted : [WITME_DEFAULT_FEATURED_CREATOR];
  }, [landingConfig.showcaseCreators]);

  const heroVisualCreators = useMemo(() => {
    const dedicated = landingConfig.homeHeroVisuals.filter((c) => c.imageUrl.trim()).slice(0, 3);
    if (dedicated.length > 0) return dedicated;
    return derivedLandingVisuals.slice(0, 3);
  }, [landingConfig.homeHeroVisuals, derivedLandingVisuals]);

  const experienceVisualCreators = useMemo(() => {
    if (landingConfig.hideWhatYouFindStripMedia) return [];
    const dedicated = landingConfig.homeExperienceVisuals.filter((c) => c.imageUrl.trim()).slice(0, 4);
    if (dedicated.length > 0) return dedicated;
    return derivedLandingVisuals.slice(0, 4);
  }, [landingConfig.hideWhatYouFindStripMedia, landingConfig.homeExperienceVisuals, derivedLandingVisuals]);

  const creatorStudioUrl = echofluxUrl.replace(/\/$/, "");

  return (
    <WitmePublicPageShell>
      <WitmeHeroSection
        firstCreatorPath={firstCreatorPath}
        creatorStudioUrl={creatorStudioUrl}
        visualCreators={heroVisualCreators}
        enableTracking={!disableTracking}
      />
      <WitmeExperienceTypesSection
        visualCreators={experienceVisualCreators}
        enableTracking={!disableTracking}
      />
      <WitmeWhySection />
      <WitmeEarlySection />
      <WitmeFeaturedCreatorsSection creators={featuredCreators} enableTracking={!disableTracking} />
      <WitmeCreatorStudioSection creatorStudioUrl={creatorStudioUrl} enableTracking={!disableTracking} />
      <WitmeMarketingFooter echofluxUrl={echofluxUrl} legalLinks={landingConfig.legalLinks} enableTracking={!disableTracking} />
    </WitmePublicPageShell>
  );
};

export const WitmeDiscoverPage: React.FC<{ echofluxUrl?: string }> = ({ echofluxUrl = "https://echoflux.ai" }) => {
  const landingConfig = useWitmeLandingConfig();

  useWitmeSeo({
    title: "Creators on witme.io",
    description:
      "Explore live creator pages on WitMe. Each page is different — start with who is live on the platform now.",
    path: "/discover",
    imageUrl: WITME_DISCOVER_OG_IMAGE_PATH,
  });

  useEffect(() => {
    trackWitmeEvent("page_view", { surface: "discover" });
  }, []);

  const [query, setQuery] = useState("");
  const homeHref = witmePublicHref("/");

  const showcase = landingConfig.showcaseCreators;

  const filteredCreators = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return showcase;

    return showcase.filter((creator) => {
      const haystack = [creator.name, creator.handle, creator.descriptor, creator.tags.join(" ")]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [query, showcase]);

  const sectionClass = WITME_LANDING_SECTION_CLASS;

  return (
    <WitmePublicPageShell>
      <div className={`${sectionClass} pt-12 pb-8 sm:pt-16 sm:pb-10`}>
        <a href={homeHref} className="inline-flex items-center gap-2 text-sm text-gray-300 transition hover:text-white">
          <span aria-hidden>←</span>
          <span>Back to</span>
          <img src="/witme-wordmark.svg" alt="witme" className="h-7 w-auto sm:h-8" loading="lazy" />
        </a>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Creators on WitMe</h1>
        <p className="mt-3 max-w-2xl text-sm text-gray-300 sm:text-base">
          Every page is built differently. See who is live now — more voices will join over time.
        </p>
        <div className="mt-6">
          <label htmlFor="creator-search" className="sr-only">
            Search creators
          </label>
          <input
            id="creator-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or handle"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-gray-400 focus:border-white/30 focus:outline-none"
          />
        </div>
      </div>

      <section className={`${sectionClass} pb-16 sm:pb-20`} aria-label="Creator list">
        {filteredCreators.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-gray-300">
            No creators match that search.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCreators.map((creator, idx) => {
              const href = liveStorefrontHref(creator);
              return (
                <article
                  key={`${creator.handle}-discover-${idx}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition hover:border-white/20 hover:bg-white/10"
                >
                  <div className="relative h-56 w-full shrink-0 overflow-hidden bg-gradient-to-b from-black/50 to-black/25 sm:h-64 lg:h-72">
                    <ShowcaseMedia
                      url={creator.imageUrl}
                      mediaKind={creator.mediaKind}
                      alt={creator.name}
                      className="absolute inset-0 h-full w-full"
                      objectPosition={creator.mediaObjectPosition}
                      objectFit="contain"
                    />
                  </div>
                  <div className="p-4">
                    <p className="text-base font-semibold text-white">{creator.name}</p>
                    <p className="mt-0.5 text-sm text-gray-400">{creator.handle}</p>
                    <p className="mt-3 text-sm text-gray-300">{creator.descriptor}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {creator.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-xs text-gray-200"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    {href ? (
                      <a
                        href={witmePublicHref(href)}
                        className="mt-5 inline-flex items-center rounded-full bg-white px-4 py-2 text-xs font-semibold text-gray-900 transition hover:bg-gray-200"
                        onClick={() =>
                          trackWitmeEvent("creator_card_click", { handle: creator.handle, location: "discover_grid" })
                        }
                      >
                        View page
                      </a>
                    ) : (
                      <p className="mt-5 text-xs text-gray-500">Link not live</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <WitmeMarketingFooter echofluxUrl={echofluxUrl} legalLinks={landingConfig.legalLinks} />
    </WitmePublicPageShell>
  );
};

export default WitmeHomepage;
