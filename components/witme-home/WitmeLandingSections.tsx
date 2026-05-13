import React, { useEffect, useState } from "react";
import { WITME_FIRST_CREATOR_SLUG, witmePublicHref } from "../../src/lib/witmeFirstCreator";
import { trackWitmeEvent } from "../../src/lib/witmeTrackEvent";
import { witmeCreatorPagePath, type WitmeShowcaseCreator } from "../../src/lib/witmeShowcase";
import { ShowcaseMedia } from "./ShowcaseMedia";
import { WITME_LANDING_SECTION_CLASS } from "./WitmePublicPageShell";

const sectionClass = WITME_LANDING_SECTION_CLASS;

const cardSurface = "rounded-2xl border border-white/15 bg-white/[0.06] p-6 sm:p-7";

export function pickFeaturedShowcaseCreator(showcase: WitmeShowcaseCreator[]): WitmeShowcaseCreator | null {
  const withPath = showcase.filter((c) => c.linkLive && witmeCreatorPagePath(c.pageSlug));
  return (
    withPath.find((c) => c.pageSlug.trim().toLowerCase() === WITME_FIRST_CREATOR_SLUG) || withPath[0] || null
  );
}

/** Homepage Featured block: rows marked featured + live + media; else first live creator fallback. */
export function pickFeaturedShowcaseCreators(showcase: WitmeShowcaseCreator[]): WitmeShowcaseCreator[] {
  const hasPathAndMedia = (c: WitmeShowcaseCreator) =>
    Boolean(witmeCreatorPagePath(c.pageSlug) && c.imageUrl.trim());
  const flagged = showcase.filter((c) => c.isFeatured && c.linkLive && hasPathAndMedia(c));
  if (flagged.length > 0) return flagged;
  const one = pickFeaturedShowcaseCreator(showcase);
  if (one && hasPathAndMedia(one)) return [one];
  return [];
}

export type WitmeLegalLink = { label: string; url: string };

/** Hero mid-stop (`via-[#202b3f]`): tile reads as continuous background, not an empty “card”. */
const HERO_TILE_BLEND = "border-[#202b3f] bg-[#202b3f]";

/** Single hero collage tile: hero-matched fill until media paints; no contrasting outline flash. */
function WitmeHeroCollageCell({
  creator,
  idx,
  className,
  imgLoading,
  enableTracking,
  coverRelax = 1,
}: {
  creator: WitmeShowcaseCreator;
  idx: number;
  className: string;
  imgLoading: "eager" | "lazy";
  enableTracking: boolean;
  /** Multiplies configured `mediaScale`; values below 1 zoom out cover slightly (more of asset visible). */
  coverRelax?: number;
}) {
  const [mediaReady, setMediaReady] = useState(false);
  const path = witmeCreatorPagePath(creator.pageSlug);
  const href = creator.linkLive && path ? witmePublicHref(path) : null;
  const alt = `${creator.name || "Creator"} on WitMe`;

  useEffect(() => {
    setMediaReady(false);
  }, [creator.imageUrl, creator.mediaKind]);

  const frameClass =
    "relative aspect-[5/7] overflow-hidden rounded-2xl transition-[border-color,box-shadow,background-color] duration-300 ease-out " +
    (mediaReady
      ? "border border-white/20 bg-transparent shadow-2xl shadow-black/40 ring-1 ring-white/10"
      : `border shadow-none ring-0 ${HERO_TILE_BLEND}`);

  const inner = (
    <div className={frameClass}>
      <ShowcaseMedia
        url={creator.imageUrl}
        mediaKind={creator.mediaKind}
        alt={alt}
        className="relative z-[1] h-full w-full"
        objectPosition={creator.mediaObjectPosition}
        mediaScale={(creator.mediaScale ?? 1) * coverRelax}
        objectFit="cover"
        layout="fill"
        imgLoading={imgLoading}
        onReady={() => setMediaReady(true)}
      />
    </div>
  );
  const tracked =
    href != null ? (
      <a
        href={href}
        className="block rounded-2xl transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#26324a]"
        onClick={() => {
          if (enableTracking) trackWitmeEvent("cta_hero_visual_creator", { handle: creator.handle, slot: idx });
        }}
      >
        {inner}
      </a>
    ) : (
      inner
    );
  return <div className={className}>{tracked}</div>;
}

/** Stacked / offset frames so the hero shows real creator imagery beside “Different worlds” copy. */
function WitmeHeroVisualCollage({
  creators,
  enableTracking = true,
}: {
  creators: WitmeShowcaseCreator[];
  enableTracking?: boolean;
}) {
  const items = creators.filter((c) => c.imageUrl.trim()).slice(0, 3);

  const heroImagePreloadKey = items
    .slice(0, 2)
    .filter((c) => c.mediaKind !== "video" && c.imageUrl.trim())
    .map((c) => c.imageUrl.trim())
    .join("\u0001");

  useEffect(() => {
    if (!heroImagePreloadKey) return;
    const hrefs = heroImagePreloadKey.split("\u0001").filter(Boolean);
    const links: HTMLLinkElement[] = [];
    for (const href of hrefs) {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = href;
      link.setAttribute("fetchpriority", "high");
      document.head.appendChild(link);
      links.push(link);
    }
    return () => {
      links.forEach((el) => el.remove());
    };
  }, [heroImagePreloadKey]);

  if (items.length === 0) return null;

  const wrapFrame = (
    creator: WitmeShowcaseCreator,
    idx: number,
    className: string,
    imgLoading: "eager" | "lazy",
    coverRelax = 1
  ) => (
    <WitmeHeroCollageCell
      key={`${creator.pageSlug}-${idx}-${creator.imageUrl.trim()}`}
      creator={creator}
      idx={idx}
      className={className}
      imgLoading={imgLoading}
      enableTracking={enableTracking}
      coverRelax={coverRelax}
    />
  );

  const collageShell = (inner: React.ReactNode, shellClass = "") => (
    <div
      className={`mt-10 flex justify-center sm:mt-12 lg:mt-0 lg:justify-end lg:self-start ${shellClass}`.trim()}
    >
      {inner}
    </div>
  );

  if (items.length === 1) {
    return collageShell(
      <div className="w-full max-w-[14rem] sm:max-w-[16rem]">{wrapFrame(items[0], 0, "", "eager")}</div>
    );
  }

  if (items.length === 2) {
    return collageShell(
      <div className="flex justify-center gap-4 lg:justify-end lg:pt-4">
        <div className="w-[42%] max-w-[9.5rem] translate-y-6 rotate-[-4deg] sm:max-w-[11rem]">{wrapFrame(items[0], 0, "", "eager")}</div>
        <div className="w-[42%] max-w-[9.5rem] -translate-y-2 rotate-[3deg] sm:max-w-[11rem]">{wrapFrame(items[1], 1, "", "lazy")}</div>
      </div>
    );
  }

  return collageShell(
    <div className="relative h-[min(25rem,max(16rem,78vw))] w-full max-w-[19rem] overflow-visible sm:h-[26rem] sm:max-w-[21rem] lg:h-[29rem] lg:max-w-[24rem]">
      {wrapFrame(items[0], 0, "absolute right-0 top-0 z-30 w-[58%] rotate-[2deg]", "eager")}
      {wrapFrame(items[1], 1, "absolute left-0 top-[16%] z-20 w-[55%] -rotate-[2deg]", "lazy")}
      {wrapFrame(
        items[2],
        2,
        "absolute right-[8%] z-10 w-[52%] rotate-[1deg] bottom-[-2.85rem] sm:bottom-[-2.35rem] lg:bottom-[-2.95rem]",
        "lazy",
        0.9
      )}
    </div>,
    "max-sm:pb-20 sm:pb-14 lg:pb-12 lg:pt-5"
  );
}

/** Hero — witme wordmark + positioning + CTAs (spec copy). */
export const WitmeHeroSection: React.FC<{
  firstCreatorPath: string;
  /** EchoFlux / creator studio base URL (fans explore witme; creators open this). */
  creatorStudioUrl: string;
  /** Showcase rows with media — shown as a collage to the right of headline (desktop). */
  visualCreators?: WitmeShowcaseCreator[];
  enableTracking?: boolean;
}> = ({ firstCreatorPath, creatorStudioUrl, visualCreators = [], enableTracking = true }) => {
  const exploreHref = witmePublicHref(firstCreatorPath);
  const studioBase = creatorStudioUrl.replace(/\/$/, "");

  return (
    <section className={`${sectionClass} pt-12 pb-16 sm:pt-20 sm:pb-20`} aria-labelledby="witme-hero-heading">
      <div className="grid grid-cols-1 items-start gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,26rem)] lg:gap-12 xl:gap-16">
        <div className="max-w-3xl lg:max-w-none">
          <img src="/witme-wordmark.svg" alt="witme" className="h-12 w-auto sm:h-16" loading="eager" />
          <p className="mt-3 text-xs text-gray-400 sm:text-sm">
            Powered by{" "}
            <a
              href={studioBase}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-gray-300 underline decoration-white/20 underline-offset-2 transition hover:text-white hover:decoration-white/40"
              onClick={() => {
                if (enableTracking) trackWitmeEvent("powered_by_echoflux_click", { location: "hero" });
              }}
            >
              EchoFlux
            </a>
          </p>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200/90">Early access platform</p>
          <h1 id="witme-hero-heading" className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl sm:leading-[1.08]">
            Different creators. Different worlds. One place.
          </h1>
          <p className="mt-6 text-base leading-relaxed text-gray-300 sm:text-lg sm:leading-relaxed">
            WitMe is a growing platform where creators build their own pages — their own experience, their own rules. No
            forced format. No one-size-fits-all feed. Just direct access, however they choose to create it.
          </p>
          <div className="mt-10">
            <a
              href={exploreHref}
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-200 to-white px-8 py-3.5 text-sm font-semibold text-gray-900 transition hover:from-white hover:to-indigo-100"
              onClick={() => {
                if (enableTracking) trackWitmeEvent("cta_explore_first_creator", { location: "hero" });
              }}
            >
              Explore the first creator
            </a>
          </div>
        </div>
        <WitmeHeroVisualCollage creators={visualCreators} enableTracking={enableTracking} />
      </div>
    </section>
  );
};

const EXPERIENCE_TYPES: { title: string; body: string }[] = [
  {
    title: "Closer Access",
    body: "More personal, behind-the-scenes, direct connection.",
  },
  {
    title: "Lifestyle & Daily Life",
    body: "Personality-driven content, routines, environments, and everyday moments.",
  },
  {
    title: "Passion-Based Pages",
    body: "Cars, horses, fitness, hobbies, skills, and niche interests.",
  },
  {
    title: "Unfiltered Personality",
    body: "Humor, opinions, chaos, confidence, and whatever makes a creator feel real.",
  },
];

function WitmeExperienceVisualStrip({
  creators,
  enableTracking = true,
}: {
  creators: WitmeShowcaseCreator[];
  enableTracking?: boolean;
}) {
  const items = creators.filter((c) => c.imageUrl.trim()).slice(0, 4);
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4" aria-label="Creator pages preview">
      {items.map((creator, idx) => {
        const path = witmeCreatorPagePath(creator.pageSlug);
        const href = creator.linkLive && path ? witmePublicHref(path) : null;
        const alt = `${creator.name || "Creator"} — preview`;
        const tile = (
          <div className="aspect-[4/5] overflow-hidden rounded-xl border border-white/20 bg-black/30 shadow-lg shadow-black/30">
            <ShowcaseMedia
              url={creator.imageUrl}
              mediaKind={creator.mediaKind}
              alt={alt}
              className="h-full w-full"
              objectPosition={creator.mediaObjectPosition}
              mediaScale={creator.mediaScale ?? 1}
              objectFit="cover"
              layout="fill"
              imgLoading={idx === 0 ? "eager" : "lazy"}
            />
          </div>
        );
        return (
          <div key={`${creator.pageSlug}-exp-${idx}`}>
            {href ? (
              <a
                href={href}
                className="block transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-xl"
                onClick={() => {
                  if (enableTracking) trackWitmeEvent("cta_experience_strip_creator", { handle: creator.handle });
                }}
              >
                {tile}
              </a>
            ) : (
              tile
            )}
          </div>
        );
      })}
    </div>
  );
}

export const WitmeExperienceTypesSection: React.FC<{
  visualCreators?: WitmeShowcaseCreator[];
  enableTracking?: boolean;
}> = ({ visualCreators = [], enableTracking = true }) => {
  const hasStripMedia = visualCreators.some((c) => c.imageUrl.trim());
  const gridClass = hasStripMedia
    ? "grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] lg:items-start lg:gap-x-10 lg:gap-y-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]"
    : "grid grid-cols-1 gap-8 lg:gap-y-6";

  return (
    <section className={`${sectionClass} pb-16 sm:pb-20`} aria-labelledby="witme-experience-heading">
      <div className={gridClass}>
        <div className={hasStripMedia ? "lg:col-start-1 lg:row-start-1" : undefined}>
          <h2 id="witme-experience-heading" className="text-2xl font-semibold text-white sm:text-3xl">
            What you&apos;ll find here
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-gray-300 sm:text-base">
            Types of experiences WitMe is built for — each creator shapes their own version.
          </p>
        </div>
        {hasStripMedia ? (
          <div className="lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:self-start lg:sticky lg:top-28">
            <WitmeExperienceVisualStrip creators={visualCreators} enableTracking={enableTracking} />
          </div>
        ) : null}
        <ul
          className={
            hasStripMedia
              ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-start-1 lg:row-start-2 lg:mt-0 lg:gap-6"
              : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-6"
          }
        >
          {EXPERIENCE_TYPES.map((item) => (
            <li key={item.title}>
              <article className={`${cardSurface} h-full transition hover:border-white/25 hover:bg-white/[0.09]`}>
                <div className="mb-4 h-px w-8 bg-gradient-to-r from-sky-300/80 to-transparent" aria-hidden />
                <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-300">{item.body}</p>
              </article>
            </li>
          ))}
        </ul>
        <p
          className={
            hasStripMedia
              ? "text-center text-sm font-medium text-gray-200 sm:text-base lg:col-start-1 lg:row-start-3 lg:text-left"
              : "text-center text-sm font-medium text-gray-200 sm:text-base lg:text-left"
          }
        >
          Every page is different. That&apos;s the point.
        </p>
      </div>
    </section>
  );
};

const WHY_POINTS: { title: string; body: string }[] = [
  {
    title: "Creators control their page",
    body: "Layout, offers, and access live with the creator — not a template police.",
  },
  {
    title: "No forced content style",
    body: "Your page can feel editorial, casual, cinematic, or chaotic. It's yours.",
  },
  {
    title: "No algorithm deciding the experience",
    body: "Fans land where the creator points them. What they see is intentional.",
  },
  {
    title: "Direct, intentional access",
    body: "Memberships, store, tips, messages — whatever they turn on, in one place.",
  },
];

export const WitmeWhySection: React.FC = () => (
  <section className={`${sectionClass} pb-16 sm:pb-20`} aria-labelledby="witme-why-heading">
    <h2 id="witme-why-heading" className="text-2xl font-semibold text-white sm:text-3xl">
      Why WitMe is different
    </h2>
    <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
      {WHY_POINTS.map((item) => (
        <article key={item.title} className={`${cardSurface} border-white/12`}>
          <h3 className="text-base font-semibold text-white">{item.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-300">{item.body}</p>
        </article>
      ))}
    </div>
    <p className="mt-10 max-w-xl text-lg font-medium leading-snug text-white sm:text-xl">This isn&apos;t a feed. It&apos;s a space.</p>
  </section>
);

export const WitmeEarlySection: React.FC = () => (
  <section className="border-y border-white/10 bg-white/[0.04]" aria-labelledby="witme-early-heading">
    <div className={`${sectionClass} py-16 sm:py-20`}>
      <div className="mx-auto max-w-2xl text-center">
        <h2 id="witme-early-heading" className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          You&apos;re early.
        </h2>
        <p className="mt-6 text-base leading-relaxed text-gray-300 sm:text-lg">
          WitMe is just getting started. New creators will be added over time, and each one will bring a completely
          different kind of page and experience. Right now, you&apos;re seeing the first one.
        </p>
      </div>
    </div>
  </section>
);

function featuredFit(c: WitmeShowcaseCreator): "cover" | "contain" {
  return c.featuredMediaFit === "contain" ? "contain" : "cover";
}

/** One large spotlight (image + copy side by side on large screens). */
const FeaturedSpotlightCard: React.FC<{
  creator: WitmeShowcaseCreator;
  enableTracking?: boolean;
}> = ({ creator, enableTracking = true }) => {
  const path = witmeCreatorPagePath(creator.pageSlug);
  const href = witmePublicHref(path);
  const alt = `${creator.name || "Creator"} — featured on WitMe`;
  return (
    <div className="overflow-hidden rounded-3xl border border-white/18 bg-gradient-to-br from-white/[0.12] via-white/[0.06] to-white/[0.03]">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center lg:gap-8">
        <div className="flex min-h-0 items-center justify-center bg-gradient-to-br from-black/35 to-black/18 px-3 py-4 sm:px-5 sm:py-6">
          <ShowcaseMedia
            url={creator.imageUrl}
            mediaKind={creator.mediaKind}
            alt={alt}
            className=""
            layout="intrinsic"
            objectPosition={creator.mediaObjectPosition}
            objectFit="contain"
          />
        </div>
        <div className="flex flex-col justify-center px-5 py-7 sm:px-7 sm:py-9 lg:max-w-[26rem] lg:justify-self-start lg:pl-4 lg:pr-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-300">Featured creator</p>
          <h2 className="mt-2 text-2xl font-semibold text-white sm:mt-3 sm:text-3xl lg:text-[1.65rem] lg:leading-tight xl:text-3xl">
            {creator.name || "Creator"}
          </h2>
          {creator.descriptor.trim() ? (
            <p className="mt-2 text-sm leading-relaxed text-gray-200 sm:mt-3 sm:text-base">{creator.descriptor}</p>
          ) : null}
          {creator.handle.trim() ? <p className="mt-2 text-xs text-gray-400 sm:text-sm">{creator.handle}</p> : null}
          <div className="mt-6 sm:mt-7">
            <a
              href={href}
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-100 sm:px-7"
              onClick={() => {
                if (enableTracking) trackWitmeEvent("cta_enter_featured_page", { handle: creator.handle });
              }}
            >
              View page
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Compact cards when multiple creators are featured. */
const FeaturedCreatorsGrid: React.FC<{
  creators: WitmeShowcaseCreator[];
  enableTracking?: boolean;
}> = ({ creators, enableTracking = true }) => (
  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
    {creators.map((creator) => {
      const path = witmeCreatorPagePath(creator.pageSlug);
      const href = witmePublicHref(path);
      const fit = featuredFit(creator);
      const alt = `${creator.name || "Creator"} — featured on WitMe`;
      return (
        <article
          key={`${creator.pageSlug}-${creator.handle}`}
          className="flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] transition hover:border-white/25 hover:bg-white/[0.09]"
        >
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/30">
            <ShowcaseMedia
              url={creator.imageUrl}
              mediaKind={creator.mediaKind}
              alt={alt}
              className="absolute inset-0 h-full w-full"
              objectPosition={creator.mediaObjectPosition}
              objectFit={fit}
            />
          </div>
          <div className="flex flex-1 flex-col p-5">
            <h3 className="text-lg font-semibold text-white">{creator.name || "Creator"}</h3>
            {creator.descriptor.trim() ? (
              <p className="mt-2 line-clamp-3 text-sm text-gray-300">{creator.descriptor}</p>
            ) : null}
            {creator.handle.trim() ? <p className="mt-1 text-xs text-gray-500">{creator.handle}</p> : null}
            <div className="mt-4 flex flex-1 flex-col justify-end">
              <a
                href={href}
                className="inline-flex w-fit items-center rounded-full bg-white px-4 py-2 text-xs font-semibold text-gray-900 transition hover:bg-gray-100"
                onClick={() => {
                  if (enableTracking) trackWitmeEvent("cta_enter_featured_page", { handle: creator.handle });
                }}
              >
                View page
              </a>
            </div>
          </div>
        </article>
      );
    })}
  </div>
);

export const WitmeFeaturedCreatorsSection: React.FC<{
  creators: WitmeShowcaseCreator[];
  enableTracking?: boolean;
}> = ({ creators, enableTracking = true }) => {
  if (creators.length === 0) return null;

  const multi = creators.length > 1;
  const headingId = "witme-featured-heading";

  return (
    <section className={`${sectionClass} py-16 sm:py-20`} aria-labelledby={headingId}>
      <div className="mb-8 sm:mb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Featured</p>
        <h2 id={headingId} className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
          {multi ? "Featured creators" : "Featured creator"}
        </h2>
        {multi ? (
          <p className="mt-2 max-w-2xl text-sm text-gray-300">
            Each page is different — open anyone below to see their world on WitMe.
          </p>
        ) : null}
      </div>
      {multi ? (
        <FeaturedCreatorsGrid creators={creators} enableTracking={enableTracking} />
      ) : (
        <FeaturedSpotlightCard creator={creators[0]} enableTracking={enableTracking} />
      )}
    </section>
  );
};

export const WitmeCreatorStudioSection: React.FC<{
  creatorStudioUrl: string;
  enableTracking?: boolean;
}> = ({ creatorStudioUrl, enableTracking = true }) => {
  const studioBase = creatorStudioUrl.replace(/\/$/, "");
  return (
    <section className={`${sectionClass} pb-20 sm:pb-24`} aria-labelledby="witme-creator-studio-heading">
      <div className="rounded-3xl border border-white/15 bg-white/[0.05] px-6 py-10 sm:px-10 sm:py-12">
        <h2 id="witme-creator-studio-heading" className="text-2xl font-semibold text-white sm:text-3xl">
          Creators run their page from EchoFlux
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-gray-300 sm:text-base">
          If you&apos;re a creator, WitMe is where fans land — EchoFlux is where you build memberships, store, messages,
          and the rest. Use the link below to open the studio (sign in or get started there).
        </p>
        <a
          href={studioBase}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-200 to-white px-8 py-3.5 text-sm font-semibold text-gray-900 transition hover:from-white hover:to-indigo-100"
          onClick={() => {
            if (enableTracking) trackWitmeEvent("cta_creator_studio", { location: "creator_section" });
          }}
        >
          Open EchoFlux
        </a>
      </div>
    </section>
  );
};

export const WitmeMarketingFooter: React.FC<{
  echofluxUrl: string;
  legalLinks: WitmeLegalLink[];
  enableTracking?: boolean;
}> = ({ echofluxUrl, legalLinks, enableTracking = true }) => {
  return (
    <footer className="border-t border-white/15 bg-white/[0.06]">
      <div className={`${sectionClass} flex flex-col gap-6 py-10 text-sm text-gray-200 sm:flex-row sm:items-center sm:justify-between`}>
        <img src="/witme-wordmark.svg" alt="witme" className="h-9 w-auto sm:h-10" loading="lazy" />
        <nav className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2" aria-label="Footer">
          {legalLinks.map((link) => (
            <a
              key={`${link.label}-${link.url}`}
              href={link.url}
              className="transition hover:text-white"
              onClick={() => {
                if (enableTracking) trackWitmeEvent("legal_link_click", { label: link.label, url: link.url });
              }}
            >
              {link.label}
            </a>
          ))}
          <a href={echofluxUrl} target="_blank" rel="noopener noreferrer" className="text-xs opacity-70 transition hover:text-white hover:opacity-100">
            Creator Login
          </a>
        </nav>
      </div>
    </footer>
  );
};
