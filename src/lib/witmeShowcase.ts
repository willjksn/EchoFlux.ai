/** Witme homepage / discover showcase rows — managed via Admin Witme Page control panel. */

export type WitmeShowcaseCreator = {
  name: string;
  /** Shown on cards, e.g. @stormijxo */
  handle: string;
  /** URL path when `linkLive` (e.g. stormijxo → /stormijxo). */
  pageSlug: string;
  /** Image or video URL (same field for both). */
  imageUrl: string;
  /** `video` = looped muted autoplay on the landing page; `image` = still image. */
  mediaKind: "image" | "video";
  /** CSS object-position for cover crop (e.g. `50% 25%`). Drag-adjust in Witme admin. */
  mediaObjectPosition: string;
  descriptor: string;
  tags: string[];
  /** Short line for the “featured now” carousel */
  spotlight: string;
  /** If true, “View page” links to /{pageSlug}. If false, decorative only (no storefront link). */
  linkLive: boolean;
};

/** Shipped default when Firestore has no `showcaseCreators` yet — one live creator + decorative fillers. */
export const DEFAULT_SHOWCASE_CREATORS: WitmeShowcaseCreator[] = [
  {
    name: "Stormi JXO",
    handle: "@stormijxo",
    pageSlug: "stormijxo",
    descriptor: "Premium creator page + direct fan access",
    tags: ["Memberships", "Paid Posts", "Messages"],
    imageUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80",
    mediaKind: "image",
    mediaObjectPosition: "50% 50%",
    spotlight: "New member-only drop is live now",
    linkLive: true,
  },
  {
    name: "Jalen Brooks",
    handle: "@jalenbuilds",
    pageSlug: "",
    descriptor: "Fitness + performance coaching",
    tags: ["Sessions", "Tips", "Exclusive Access"],
    imageUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80",
    mediaKind: "image",
    mediaObjectPosition: "50% 50%",
    spotlight: "Opened 8 new coaching session slots",
    linkLive: false,
  },
  {
    name: "Nia Sol",
    handle: "@niasolmusic",
    pageSlug: "",
    descriptor: "Music process + unreleased cuts",
    tags: ["Memberships", "Paid Posts", "Tips"],
    imageUrl: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80",
    mediaKind: "image",
    mediaObjectPosition: "50% 50%",
    spotlight: "Posted an unreleased demo for members",
    linkLive: false,
  },
  {
    name: "Evan Cole",
    handle: "@evancoach",
    pageSlug: "",
    descriptor: "Mindset + creator growth",
    tags: ["Sessions", "Messages", "Premium Access"],
    imageUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80",
    mediaKind: "image",
    mediaObjectPosition: "50% 50%",
    spotlight: "Direct Q&A messages enabled this week",
    linkLive: false,
  },
  {
    name: "Leah Park",
    handle: "@leahframes",
    pageSlug: "",
    descriptor: "Photography + behind-the-scenes",
    tags: ["Paid Posts", "Memberships", "Exclusive Access"],
    imageUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=80",
    mediaKind: "image",
    mediaObjectPosition: "50% 50%",
    spotlight: "New BTS set available for paid unlock",
    linkLive: false,
  },
  {
    name: "Kai Moreno",
    handle: "@kaifilms",
    pageSlug: "",
    descriptor: "Short films + creative breakdowns",
    tags: ["Messages", "Tips", "Sessions"],
    imageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=80",
    mediaKind: "image",
    mediaObjectPosition: "50% 50%",
    spotlight: "Hosting a creator breakdown session",
    linkLive: false,
  },
];

export function witmeCreatorPagePath(pageSlug: string): string {
  const s = pageSlug.trim().toLowerCase().replace(/^\/+/, "");
  return s ? `/${s}` : "";
}
