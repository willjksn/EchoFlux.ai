export type WitmeShowcaseCreator = {
  name: string;
  handle: string;
  pageSlug: string;
  imageUrl: string;
  mediaKind: "image" | "video";
  mediaObjectPosition: string;
  descriptor: string;
  tags: string[];
  spotlight: string;
  linkLive: boolean;
};

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

function sanitizeString(value: unknown, max = 300): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

/** Showcase media must be https; blocks javascript:/data: and credential URLs. */
function sanitizeShowcaseImageUrl(value: unknown, max = 4096): string {
  const s = typeof value === "string" ? value.trim().slice(0, max) : "";
  if (!s) return "";
  const head = s.slice(0, 48).toLowerCase();
  if (head.includes("javascript:") || head.startsWith("data:") || head.includes("vbscript:")) {
    return "";
  }
  if (!s.startsWith("https://")) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return "";
    if (u.username !== "" || u.password !== "") return "";
    return s;
  } catch {
    return "";
  }
}

function normalizePageSlug(value: unknown): string {
  const s = sanitizeString(value, 80).toLowerCase().replace(/^@+/, "");
  return s.replace(/[^a-z0-9_-]/g, "").slice(0, 40);
}

function slugFromHandleDisplay(handle: unknown): string {
  return normalizePageSlug(handle);
}

function sanitizeMediaObjectPosition(value: unknown): string {
  const s = sanitizeString(value, 48).trim();
  if (!s) return "50% 50%";
  if (s === "center") return "50% 50%";
  if (/^[\d.]+%\s+[\d.]+%$/.test(s)) return s;
  if (/^(top|bottom|left|right|center)(\s+(top|bottom|left|right|center))?$/i.test(s)) {
    return s.replace(/\s+/g, " ").toLowerCase();
  }
  return "50% 50%";
}

/**
 * @param hasShowcaseKey - false when `showcaseCreators` was absent on the stored document (migrate old Witme config).
 */
export function sanitizeShowcaseCreators(input: unknown, hasShowcaseKey: boolean): WitmeShowcaseCreator[] {
  const raw = Array.isArray(input) ? input : [];
  const rows: WitmeShowcaseCreator[] = raw
    .map((row) => {
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      const name = sanitizeString(r.name, 80);
      const handle = sanitizeString(r.handle, 80);
      let pageSlug = normalizePageSlug(r.pageSlug);
      if (!pageSlug) pageSlug = slugFromHandleDisplay(handle);
      // Firebase download URLs with tokens are often 400–2000+ chars; truncating breaks the link.
      const imageUrl = sanitizeShowcaseImageUrl(r.imageUrl, 4096);
      const mediaKind: "image" | "video" = r.mediaKind === "video" ? "video" : "image";
      const mediaObjectPosition = sanitizeMediaObjectPosition(r.mediaObjectPosition);
      const descriptor = sanitizeString(r.descriptor, 220);
      const spotlight = sanitizeString(r.spotlight, 220);
      const tags = (Array.isArray(r.tags) ? r.tags : [])
        .map((t) => sanitizeString(t, 40))
        .filter(Boolean)
        .slice(0, 8);
      let linkLive = r.linkLive === true;
      if (linkLive && !pageSlug) linkLive = false;
      return { name, handle, pageSlug, imageUrl, mediaKind, mediaObjectPosition, descriptor, tags, spotlight, linkLive };
    })
    .filter((c) => c.name && c.imageUrl)
    .slice(0, 24);

  if (!hasShowcaseKey && rows.length === 0) return [...DEFAULT_SHOWCASE_CREATORS];
  return rows;
}
