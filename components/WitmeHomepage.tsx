import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SHOWCASE_CREATORS,
  type WitmeShowcaseCreator,
  witmeCreatorPagePath,
} from '../src/lib/witmeShowcase';

interface WitmeHomepageProps {
  onExploreCreators?: () => void;
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

const showcaseObjectStyle = (
  objectPosition?: string,
  fit: 'cover' | 'contain' = 'cover',
): React.CSSProperties => {
  const pos =
    objectPosition != null && String(objectPosition).trim() !== ''
      ? String(objectPosition).trim()
      : '50% 50%';
  return { objectFit: fit, objectPosition: pos };
};

const VIDEO_LOOP_FADE_MS = 380;

const ShowcaseMedia: React.FC<{
  url: string;
  mediaKind: WitmeShowcaseCreator['mediaKind'];
  alt: string;
  className: string;
  objectPosition?: string;
  /** `contain` shows the full frame (letterboxed); `cover` fills the box (may crop). */
  objectFit?: 'cover' | 'contain';
}> = ({ url, mediaKind, alt, className, objectPosition, objectFit = 'cover' }) => {
  const u = url.trim();
  const fitStyle = showcaseObjectStyle(objectPosition, objectFit);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || mediaKind !== 'video' || !u) return;

    let fadeTimer = 0;
    const handleEnded = () => {
      v.style.opacity = '0';
      fadeTimer = window.setTimeout(() => {
        const onSeeked = () => {
          v.style.opacity = '1';
        };
        v.addEventListener('seeked', onSeeked, { once: true });
        v.currentTime = 0;
        void v.play().catch(() => {
          v.removeEventListener('seeked', onSeeked);
          v.style.opacity = '1';
        });
      }, VIDEO_LOOP_FADE_MS);
    };

    v.addEventListener('ended', handleEnded);
    return () => {
      v.removeEventListener('ended', handleEnded);
      window.clearTimeout(fadeTimer);
      v.style.opacity = '1';
    };
  }, [mediaKind, u]);

  if (!u) {
    return <div className={`${className} bg-white/10`} aria-hidden />;
  }
  if (mediaKind === 'video') {
    return (
      <video
        ref={videoRef}
        src={u}
        className={`${className} transition-opacity ease-in-out`}
        style={{
          ...fitStyle,
          transitionDuration: `${VIDEO_LOOP_FADE_MS}ms`,
        }}
        muted
        playsInline
        autoPlay
        preload="metadata"
        aria-label={alt}
      />
    );
  }
  return <img src={u} alt={alt} className={className} style={fitStyle} loading="lazy" />;
};

interface ActionItem {
  title: string;
  description: string;
  icon: string;
}

interface OfferMode {
  id: string;
  title: string;
  hint: string;
  fanBenefit: string;
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
}

const fanActions: ActionItem[] = [
  { title: 'Start memberships', description: 'Join ongoing access when a creator opens member tiers.', icon: '👥' },
  { title: 'Unlock store drops', description: 'Get access to paid posts, drops, and off-feed content from Store.', icon: '🔓' },
  { title: 'Send direct support', description: 'Tip creators directly when support is enabled on their page.', icon: '💸' },
  {
    title: 'Messages',
    description: 'Chat with creators when they turn on messages—right from their page, no app hopping.',
    icon: '💬',
  },
  {
    title: 'Catch every update',
    description:
      'Posts, store highlights, and shared links land on their page—keep up without digging through bios or scattered stories.',
    icon: '🔔',
  },
  { title: 'Claim creator offers', description: 'Access creator-specific offers, perks, and premium experiences.', icon: '✨' },
];

const trustItems = [
  'Creator pages on witme',
  'Secure checkout',
  'Creator-controlled access',
  'Built for fan safety',
];

const liveMoments = [
  'stormijxo posted a new private drop',
  'New posts went live on witme',
  'Fans unlocked a new drop',
  'Direct support was sent',
  'Creator pages updated today',
];

const defaultLegalLinks: LegalLink[] = [
  { label: 'Terms', url: '/fan-terms-of-use.html' },
  { label: 'Privacy', url: '/fan-privacy-policy.html' },
  { label: 'Creator Terms', url: '/creator-terms-of-use.html' },
  { label: 'Payments', url: '/payment-terms.html' },
  { label: 'Guidelines', url: '/content-guidelines.html' },
  { label: 'Support', url: 'mailto:contact@echoflux.ai' },
];

const defaultWitmeConfig: WitmeLandingConfig = {
  heroBadge: 'witme.io',
  heroTitle: 'Support the creators you love—in one place.',
  heroDescription:
    'Get closer with member drops, unlocks, tips, and DMs—all on their page. One link from their bio is all you need to back them for real.',
  heroTrustText: 'One page. One link for fans.',
  featureCards: fanActions,
  trustItems,
  liveMoments,
  legalLinks: defaultLegalLinks,
  showcaseCreators: DEFAULT_SHOWCASE_CREATORS,
};

/** Map legacy saved Witme config cards to current titles/copy (Firestore may still have old strings). */
const normalizeLandingFeatureCards = (cards: ActionItem[]): ActionItem[] =>
  cards.map((c) => {
    const updatesCard = {
      title: 'Catch every update',
      description:
        'Posts, store highlights, and shared links land on their page—keep up without digging through bios or scattered stories.',
    };
    if (
      c.title === 'Book store sessions' ||
      c.title === 'Book sessions' ||
      c.title === 'Private sessions'
    ) {
      return { ...c, ...updatesCard, icon: '🔔' };
    }
    if (c.title === 'Open direct chat') {
      return {
        ...c,
        title: 'Messages',
        description: 'Chat with creators when they turn on messages—right from their page, no app hopping.',
      };
    }
    return c;
  });

const normalizeLandingCopy = (config: WitmeLandingConfig): WitmeLandingConfig => {
  let { heroTitle, heroDescription, heroTrustText } = config;
  if (heroTitle.trim() === 'Find the real creator page first.') {
    heroTitle = defaultWitmeConfig.heroTitle;
  }
  if (heroTitle.trim() === 'Discover creators. Support them in one place.') {
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

const offerModes: OfferMode[] = [
  {
    id: 'memberships',
    title: 'Memberships',
    hint: 'Recurring access',
    fanBenefit: 'Join for ongoing content, updates, and closer creator access.',
  },
  {
    id: 'messages',
    title: 'Messages',
    hint: 'Direct connection',
    fanBenefit: 'Send direct messages when creators choose to open conversations.',
  },
  {
    id: 'sessions',
    title: 'Sessions',
    hint: 'Booked experiences',
    fanBenefit: 'Reserve focused 1:1 time, consults, or premium sessions.',
  },
  {
    id: 'paid-content',
    title: 'Paid content',
    hint: 'Unlock-only access',
    fanBenefit: 'Unlock content that stays off the public feed.',
  },
];

const sectionClass = 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8';
const WITME_VISITOR_KEY = 'witmeVisitorId';

const shouldUseWitmeApi = (): boolean => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('witmeApi') === '1') return true;
  const host = (window.location.hostname || '').toLowerCase();
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  return !isLocalHost;
};

const getWitmeVisitorId = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    const current = window.localStorage.getItem(WITME_VISITOR_KEY);
    if (current) return current;
    const next = `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(WITME_VISITOR_KEY, next);
    return next;
  } catch {
    return '';
  }
};

const trackWitmeEvent = (eventName: string, meta?: Record<string, unknown>) => {
  if (typeof window === 'undefined') return;
  if (!shouldUseWitmeApi()) return;
  const payload = {
    eventName,
    path: window.location.pathname || '/',
    referrer: document.referrer || '',
    visitorId: getWitmeVisitorId(),
    meta: meta || {},
  };

  try {
    fetch('/api/witmeTrackEvent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {}
};

const useWitmeLandingConfig = (enabled = true): WitmeLandingConfig => {
  const [config, setConfig] = useState<WitmeLandingConfig>(defaultWitmeConfig);

  useEffect(() => {
    if (!enabled) return;
    if (!shouldUseWitmeApi()) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/witmeLandingConfig');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.config) return;
        setConfig((prev) => {
          const nextBase = { ...prev, ...data.config } as WitmeLandingConfig;
          const merged: WitmeLandingConfig = {
            ...nextBase,
            featureCards: Array.isArray(data.config.featureCards)
              ? normalizeLandingFeatureCards(data.config.featureCards as ActionItem[])
              : nextBase.featureCards,
            showcaseCreators: Array.isArray(data.config.showcaseCreators)
              ? data.config.showcaseCreators.map((c: WitmeShowcaseCreator) => ({
                  ...c,
                  mediaKind: c.mediaKind === 'video' ? 'video' : 'image',
                  mediaObjectPosition:
                    typeof c.mediaObjectPosition === 'string' && c.mediaObjectPosition.trim() !== ''
                      ? c.mediaObjectPosition.trim()
                      : '50% 50%',
                }))
              : nextBase.showcaseCreators,
          };
          return normalizeLandingCopy(merged);
        });
      } catch {}
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return config;
};

const witmePreviewSuffix = (): string => {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('witmePreview') === '1' ? '?witmePreview=1' : '';
};

const upsertMetaTag = (selector: string, attrs: Record<string, string>, content: string) => {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
};

const upsertLinkTag = (selector: string, attrs: Record<string, string>, href: string) => {
  let el = document.head.querySelector(selector) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
};

const useWitmeSeo = (opts: { title: string; description: string; path: string; imageUrl?: string; enabled?: boolean }) => {
  useEffect(() => {
    if (opts.enabled === false) return;
    if (typeof document === 'undefined') return;
    const absoluteUrl = `https://witme.io${opts.path}`;
    const ogImage = opts.imageUrl || 'https://witme.io/witme-og.png';

    document.title = opts.title;
    upsertMetaTag('meta[name="description"]', { name: 'description' }, opts.description);
    upsertMetaTag('meta[property="og:title"]', { property: 'og:title' }, opts.title);
    upsertMetaTag('meta[property="og:description"]', { property: 'og:description' }, opts.description);
    upsertMetaTag('meta[property="og:type"]', { property: 'og:type' }, 'website');
    upsertMetaTag('meta[property="og:url"]', { property: 'og:url' }, absoluteUrl);
    upsertMetaTag('meta[property="og:image"]', { property: 'og:image' }, ogImage);
    upsertMetaTag('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary_large_image');
    upsertMetaTag('meta[name="twitter:title"]', { name: 'twitter:title' }, opts.title);
    upsertMetaTag('meta[name="twitter:description"]', { name: 'twitter:description' }, opts.description);
    upsertMetaTag('meta[name="twitter:image"]', { name: 'twitter:image' }, ogImage);
    upsertLinkTag('link[rel="icon"][type="image/png"][sizes="32x32"]', { rel: 'icon', type: 'image/png', sizes: '32x32' }, '/witme-favicon.png');
    upsertLinkTag('link[rel="icon"][type="image/png"][sizes="192x192"]', { rel: 'icon', type: 'image/png', sizes: '192x192' }, '/witme-favicon.png');
    upsertLinkTag('link[rel="apple-touch-icon"]', { rel: 'apple-touch-icon' }, '/witme-favicon.png');

    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', absoluteUrl);
  }, [opts.description, opts.enabled, opts.imageUrl, opts.path, opts.title]);
};

const HeroSection: React.FC<{
  onExploreCreators: () => void;
  title: string;
  description: string;
  trustText: string;
  showcaseCreators: WitmeShowcaseCreator[];
  enableTracking?: boolean;
}> = ({ onExploreCreators, title, description, trustText, showcaseCreators, enableTracking = true }) => {
  const heroTiles = showcaseCreators.slice(0, 4);
  return (
    <section className={`${sectionClass} pt-12 pb-10 sm:pt-16 sm:pb-14`}>
      <div className="relative grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <img
            src="/witme-wordmark.svg"
            alt="witme"
            className="h-12 w-auto sm:h-16"
            loading="lazy"
          />
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-xl text-base text-gray-300 sm:text-lg">
            {description}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => {
                if (enableTracking) trackWitmeEvent('explore_click', { location: 'hero' });
                onExploreCreators();
              }}
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-200 to-white px-6 py-3 text-sm font-semibold text-gray-900 transition hover:from-white hover:to-indigo-100"
            >
              Explore creators
            </button>
            <p className="inline-flex items-center justify-center rounded-full border border-white/25 bg-white/[0.08] px-6 py-3 text-sm font-medium text-gray-100">
              {trustText}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {heroTiles.map((creator, idx) => (
            <article
              key={`${creator.handle}-${idx}`}
              className="overflow-hidden rounded-2xl border border-white/15 bg-white/10 backdrop-blur"
            >
              <ShowcaseMedia
                url={creator.imageUrl}
                mediaKind={creator.mediaKind}
                alt={creator.name}
                className="h-28 w-full sm:h-32"
                objectPosition={creator.mediaObjectPosition}
              />
              <div className="p-3 sm:p-4">
                <p className="text-sm font-semibold text-white">{creator.name}</p>
                <p className="mt-0.5 text-xs text-gray-400">{creator.handle}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

const TrustStrip: React.FC<{ items: string[] }> = ({ items }) => (
  <section className="border-y border-white/15 bg-white/[0.08]">
    <div className={`${sectionClass} py-3`}>
      <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-300 sm:text-sm">
        {items.map((item) => (
          <li key={item} className="relative after:ml-6 after:text-gray-600 after:content-['•'] last:after:content-['']">
            {item}
          </li>
        ))}
      </ul>
    </div>
  </section>
);

const FeaturedNowSection: React.FC<{ showcaseCreators: WitmeShowcaseCreator[]; enableTracking?: boolean }> = ({
  showcaseCreators,
  enableTracking = true,
}) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (showcaseCreators.length === 0) return;
    if (paused) return;
    const timer = window.setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % showcaseCreators.length);
    }, 3800);
    return () => window.clearInterval(timer);
  }, [paused, showcaseCreators.length]);

  useEffect(() => {
    if (activeIdx >= showcaseCreators.length) setActiveIdx(0);
  }, [activeIdx, showcaseCreators.length]);

  if (showcaseCreators.length === 0) return null;

  const active = showcaseCreators[activeIdx];
  const viewHref = liveStorefrontHref(active);

  return (
    <section className={`${sectionClass} py-10 sm:py-12`}>
      <div
        className="relative overflow-hidden rounded-3xl border border-white/20 bg-white/12 p-4 sm:p-6"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-sky-300/10 via-transparent to-fuchsia-300/10" />
        <div className="relative grid gap-5 sm:grid-cols-[220px_1fr] sm:items-center">
          <ShowcaseMedia
            url={active.imageUrl}
            mediaKind={active.mediaKind}
            alt={active.name}
            className="h-44 w-full rounded-2xl sm:h-40 sm:w-[220px]"
            objectPosition={active.mediaObjectPosition}
          />
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-gray-300">Live on witme</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">{active.name}</h3>
            <p className="mt-1 text-sm text-gray-300">{active.handle} · {active.descriptor}</p>
            <p className="mt-4 text-base text-gray-100">{active.spotlight}</p>
            {viewHref ? (
              <a
                href={viewHref}
                className="mt-5 inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-gray-200"
                onClick={() => {
                  if (enableTracking) trackWitmeEvent('creator_card_click', { handle: active.handle, location: 'featured_now' });
                }}
              >
                View page
              </a>
            ) : (
              <p className="mt-5 text-sm text-gray-400">More pages coming soon</p>
            )}
          </div>
        </div>
        <div className="relative mt-5 flex items-center gap-2">
          {showcaseCreators.map((creator, idx) => (
            <button
              key={`${creator.handle}-dot-${idx}`}
              type="button"
              onClick={() => setActiveIdx(idx)}
              aria-label={`Show ${creator.name}`}
              className={`h-2.5 rounded-full transition ${
                idx === activeIdx ? 'w-9 bg-white' : 'w-2.5 bg-white/35 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

const FeaturedCreatorsGrid: React.FC<{ showcaseCreators: WitmeShowcaseCreator[]; enableTracking?: boolean }> = ({
  showcaseCreators,
  enableTracking = true,
}) => (
  <section id="featured-creators" className={`${sectionClass} py-12 sm:py-16`}>
    <div className="mb-7 sm:mb-9">
      <h2 className="text-2xl font-semibold text-white sm:text-3xl">Featured creator pages</h2>
      <p className="mt-2 text-sm text-gray-300 sm:text-base">Browse creator pages in one destination.</p>
    </div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {showcaseCreators.map((creator, idx) => {
        const href = liveStorefrontHref(creator);
        return (
          <article
            key={`${creator.handle}-grid-${idx}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/10 transition hover:border-white/30 hover:bg-white/15"
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
                  <span key={tag} className="rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-xs text-gray-200">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-4">
                {href ? (
                  <a
                    href={href}
                    className="inline-flex items-center rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-gray-900 transition hover:bg-white"
                    onClick={() => {
                      if (enableTracking) trackWitmeEvent('creator_card_click', { handle: creator.handle, location: 'featured_grid' });
                    }}
                  >
                    View page
                  </a>
                ) : (
                  <span className="text-xs text-gray-500">Preview style — page coming soon</span>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  </section>
);

const CreatorsJoinSection: React.FC<{ echofluxUrl: string; enableTracking?: boolean }> = ({
  echofluxUrl,
  enableTracking = true,
}) => {
  const base = echofluxUrl.replace(/\/$/, '');
  return (
    <section className={`${sectionClass} pb-12 sm:pb-16`}>
      <div className="rounded-3xl border border-white/15 bg-gradient-to-br from-indigo-500/15 via-white/[0.08] to-fuchsia-500/10 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">Creators</p>
        <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Join witme—your link fans actually use</h2>
        <p className="mt-3 max-w-3xl text-sm text-gray-100 sm:text-base">
          Give your audience one memorable place to subscribe, shop, tip, book time, and slide into your DMs. No more
          buried links or “which page is real?”—just you, front and center.
        </p>
        <p className="mt-4 max-w-3xl text-sm text-gray-300 sm:text-base">
          <span className="font-semibold text-white">Powered by EchoFlux</span>—the creator studio behind memberships,
          store, sessions, and fan chat. witme is where fans land; EchoFlux is where you run the business.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={base}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              if (enableTracking) trackWitmeEvent('creator_join_click', { location: 'creators_join', href: base });
            }}
            className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-100"
          >
            Get Started
          </a>
          <a
            href="mailto:contact@echoflux.ai?subject=witme%20creator%20inquiry"
            className="inline-flex items-center justify-center rounded-full border border-white/25 bg-white/[0.08] px-6 py-3 text-sm font-medium text-white transition hover:bg-white/15"
            onClick={() => {
              if (enableTracking) trackWitmeEvent('creator_join_email_click', { location: 'creators_join' });
            }}
          >
            Questions? Contact us
          </a>
        </div>
      </div>
    </section>
  );
};

const FanActionsSection: React.FC<{ actions: ActionItem[] }> = ({ actions }) => (
  <section className={`${sectionClass} pb-12 sm:pb-16`}>
    <h2 className="text-2xl font-semibold text-white sm:text-3xl">What fans can do</h2>
    <p className="mt-2 max-w-3xl text-sm text-gray-200 sm:text-base">
      Offerings vary by page. Creators choose what is enabled across Feed, Store, Tip, Messages, and About.
    </p>
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {actions.map((action) => (
        <article key={action.title} className="rounded-2xl border border-white/15 bg-white/10 p-5 transition hover:bg-white/15">
          <div className="text-xl">{action.icon}</div>
          <h3 className="mt-3 text-base font-semibold text-white">{action.title}</h3>
          <p className="mt-2 text-sm text-gray-300">{action.description}</p>
        </article>
      ))}
    </div>
  </section>
);

const CreatorExperienceSection: React.FC = () => {
  const [activeMode, setActiveMode] = useState<OfferMode>(offerModes[0]);

  return (
  <section className={`${sectionClass} pb-12 sm:pb-16`}>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-3xl border border-white/15 bg-white/10 p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.18em] text-gray-300">Offerings vary by page</p>
        <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">What you might find on a creator page</h2>
        <p className="mt-3 text-sm text-gray-200 sm:text-base">
          Not every page is the same. Pick an option below to preview how access works.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {offerModes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setActiveMode(mode)}
              className={`rounded-xl border px-3 py-2 text-left transition ${
                activeMode.id === mode.id
                  ? 'border-white/40 bg-white/20 text-white'
                  : 'border-white/15 bg-white/5 text-gray-200 hover:bg-white/10'
              }`}
            >
              <p className="text-sm font-semibold">{mode.title}</p>
              <p className="mt-0.5 text-xs opacity-80">{mode.hint}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-white/15 bg-gradient-to-br from-white/15 to-white/5 p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.18em] text-gray-300">Fan experience preview</p>
        <h3 className="mt-3 text-xl font-semibold text-white sm:text-2xl">{activeMode.title}</h3>
        <p className="mt-3 text-sm text-gray-100 sm:text-base">{activeMode.fanBenefit}</p>
        <div className="mt-6 space-y-2">
          <div className="rounded-xl border border-white/15 bg-black/15 px-3 py-2 text-sm text-gray-100">Availability can differ by creator page</div>
          <div className="rounded-xl border border-white/15 bg-black/15 px-3 py-2 text-sm text-gray-100">Fans get clean checkout + instant unlock</div>
          <div className="rounded-xl border border-white/15 bg-black/15 px-3 py-2 text-sm text-gray-100">Everything stays on one trusted creator page</div>
        </div>
      </div>
    </div>
  </section>
  );
};

const FanConfidenceSection: React.FC = () => (
  <section className={`${sectionClass} pb-14 sm:pb-20`}>
    <div className="rounded-3xl border border-white/15 bg-white/[0.08] p-6 sm:p-8">
      <p className="text-xs uppercase tracking-[0.2em] text-gray-300">Why fans use witme</p>
      <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">One place for creator pages</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
          <p className="text-sm font-semibold text-white">Secure checkout</p>
          <p className="mt-2 text-xs text-gray-200">Fast, protected payments for memberships, unlocks, and support.</p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
          <p className="text-sm font-semibold text-white">Creator-controlled access</p>
          <p className="mt-2 text-xs text-gray-200">Creators decide offers, access levels, and fan experience.</p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
          <p className="text-sm font-semibold text-white">Clean fan flow</p>
          <p className="mt-2 text-xs text-gray-200">Discover, support, and stay connected without bouncing between apps.</p>
        </div>
      </div>
    </div>
  </section>
);

const FanHowItWorksSection: React.FC = () => (
  <section className={`${sectionClass} pb-12 sm:pb-16`}>
    <div className="rounded-3xl border border-white/15 bg-white/[0.07] p-6 sm:p-8">
      <p className="text-xs uppercase tracking-[0.18em] text-gray-300">How it works</p>
      <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Your link to everything they offer</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
          <p className="text-sm font-semibold text-white">One link from them</p>
          <p className="mt-2 text-xs text-gray-200">
            Creators share a single witme URL—save or bookmark it so you always land on the page they run.
          </p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
          <p className="text-sm font-semibold text-white">Choose how you show up</p>
          <p className="mt-2 text-xs text-gray-200">
            Memberships, unlocks, tips, and messages appear when a creator turns them on—see what’s live on their page.
          </p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
          <p className="text-sm font-semibold text-white">Need a hand?</p>
          <p className="mt-2 text-xs text-gray-200">
            Questions about a purchase or your account? Email{' '}
            <a
              className="underline decoration-white/30 underline-offset-2 hover:decoration-white"
              href="mailto:contact@echoflux.ai?subject=witme%20help"
            >
              support
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  </section>
);

const Footer: React.FC<{
  echofluxUrl: string;
  onExploreCreators: () => void;
  legalLinks: LegalLink[];
  enableTracking?: boolean;
}> = ({ echofluxUrl, onExploreCreators, legalLinks, enableTracking = true }) => (
  <footer className="border-t border-white/15 bg-white/[0.06]">
    <div className={`${sectionClass} flex flex-col gap-4 py-8 text-sm text-gray-200 sm:flex-row sm:items-center sm:justify-between`}>
      <img src="/witme-wordmark.svg" alt="witme" className="h-9 w-auto sm:h-10" loading="lazy" />
      <div className="flex flex-wrap items-center gap-5">
        <button
          onClick={() => {
            if (enableTracking) trackWitmeEvent('explore_click', { location: 'footer' });
            onExploreCreators();
          }}
          className="transition hover:text-white"
        >
          Explore creators
        </button>
        {legalLinks.map((link) => (
          <a
            key={`${link.label}-${link.url}`}
            href={link.url}
            className="transition hover:text-white"
            onClick={() => {
              if (enableTracking) trackWitmeEvent('legal_link_click', { label: link.label, url: link.url });
            }}
          >
            {link.label}
          </a>
        ))}
        <a href={echofluxUrl} target="_blank" rel="noopener noreferrer" className="text-xs opacity-70 transition hover:text-white hover:opacity-100">
          Creator Login
        </a>
      </div>
    </div>
  </footer>
);

export const WitmeHomepage: React.FC<WitmeHomepageProps> = ({
  onExploreCreators,
  echofluxUrl = 'https://echoflux.ai',
  previewConfig,
  disableSeo = false,
  disableTracking = false,
  disableRemoteConfig = false,
}) => {
  const remoteConfig = useWitmeLandingConfig(!disableRemoteConfig);
  const landingConfig = useMemo(() => {
    const raw = previewConfig || remoteConfig;
    return normalizeLandingCopy({
      ...raw,
      featureCards: normalizeLandingFeatureCards(raw.featureCards),
    });
  }, [previewConfig, remoteConfig]);

  useWitmeSeo({
    title: 'witme.io - Creator pages for fans',
    description: landingConfig.heroDescription,
    path: '/',
    imageUrl: 'https://witme.io/witme-og.png',
    enabled: !disableSeo,
  });

  useEffect(() => {
    if (!disableTracking) trackWitmeEvent('page_view', { surface: 'home' });
  }, [disableTracking]);

  const handleExplore = () => {
    const previewSuffix = witmePreviewSuffix();
    if (onExploreCreators) {
      onExploreCreators();
      return;
    }

    window.location.assign(`/discover${previewSuffix}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#26324a] via-[#202b3f] to-[#182031] text-white">
      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-sky-300/30 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="absolute bottom-0 left-10 h-64 w-64 rounded-full bg-fuchsia-300/15 blur-3xl" />
      </div>
      <div className="relative z-10">
        <HeroSection
          onExploreCreators={handleExplore}
          title={landingConfig.heroTitle}
          description={landingConfig.heroDescription}
          trustText={landingConfig.heroTrustText}
          showcaseCreators={landingConfig.showcaseCreators}
          enableTracking={!disableTracking}
        />
        <TrustStrip items={landingConfig.trustItems} />
        <FeaturedNowSection showcaseCreators={landingConfig.showcaseCreators} enableTracking={!disableTracking} />
        <FeaturedCreatorsGrid showcaseCreators={landingConfig.showcaseCreators} enableTracking={!disableTracking} />
        <CreatorsJoinSection echofluxUrl={echofluxUrl} enableTracking={!disableTracking} />
        <FanActionsSection actions={landingConfig.featureCards} />
        <CreatorExperienceSection />
        <FanConfidenceSection />
        <FanHowItWorksSection />
        <Footer echofluxUrl={echofluxUrl} onExploreCreators={handleExplore} legalLinks={landingConfig.legalLinks} enableTracking={!disableTracking} />
      </div>
    </div>
  );
};

export const WitmeDiscoverPage: React.FC<{ echofluxUrl?: string }> = ({ echofluxUrl = 'https://echoflux.ai' }) => {
  const landingConfig = useWitmeLandingConfig();

  useWitmeSeo({
    title: 'Browse creators | witme.io',
    description: 'Find creator pages by name, handle, and offering type on witme.io.',
    path: '/discover',
    imageUrl: 'https://witme.io/witme-og-discover.png',
  });

  useEffect(() => {
    trackWitmeEvent('page_view', { surface: 'discover' });
  }, []);

  const [query, setQuery] = useState('');
  const previewSuffix = witmePreviewSuffix();
  const backHref = previewSuffix ? `/${previewSuffix}` : '/';
  const discoverHref = `/discover${previewSuffix}`;

  const showcase = landingConfig.showcaseCreators;

  const filteredCreators = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return showcase;

    return showcase.filter((creator) => {
      const haystack = [
        creator.name,
        creator.handle,
        creator.descriptor,
        creator.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [query, showcase]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#26324a] via-[#202b3f] to-[#182031] text-white">
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-sky-300/30 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="absolute bottom-0 left-10 h-64 w-64 rounded-full bg-fuchsia-300/15 blur-3xl" />
      </div>
      <div className="relative z-10">
        <section className={`${sectionClass} pt-12 pb-8 sm:pt-16 sm:pb-10`}>
          <a href={backHref} className="inline-flex items-center gap-2 text-sm text-gray-300 transition hover:text-white">
            <span aria-hidden>←</span>
            <span>Back to</span>
            <img src="/witme-wordmark.svg" alt="witme" className="h-7 w-auto sm:h-8" loading="lazy" />
          </a>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Browse creators</h1>
          <p className="mt-3 max-w-2xl text-sm text-gray-300 sm:text-base">
            Find creator pages before you subscribe, unlock, message, or send support.
          </p>
          <div className="mt-6">
            <label htmlFor="creator-search" className="sr-only">
              Search creators
            </label>
            <input
              id="creator-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, handle, or offering"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-gray-400 focus:border-white/30 focus:outline-none"
            />
          </div>
        </section>

        <section className={`${sectionClass} pb-16 sm:pb-20`}>
          {filteredCreators.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-gray-300">
              No creators match that search yet.
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
                          <span key={tag} className="rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-xs text-gray-200">
                            {tag}
                          </span>
                        ))}
                      </div>
                      {href ? (
                        <a
                          href={href}
                          className="mt-5 inline-flex items-center rounded-full bg-white px-4 py-2 text-xs font-semibold text-gray-900 transition hover:bg-gray-200"
                          onClick={() => trackWitmeEvent('creator_card_click', { handle: creator.handle, location: 'discover_grid' })}
                        >
                          View page
                        </a>
                      ) : (
                        <p className="mt-5 text-xs text-gray-500">Page coming soon</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <Footer
          echofluxUrl={echofluxUrl}
          onExploreCreators={() => window.location.assign(discoverHref)}
          legalLinks={landingConfig.legalLinks}
        />
      </div>
    </div>
  );
};

export default WitmeHomepage;
