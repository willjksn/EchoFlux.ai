import React, { useState, useEffect, useCallback, useRef, Fragment, useMemo } from "react";
import { auth } from "../firebaseConfig";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, setDoc, where } from "firebase/firestore";
import { storage } from "../firebaseConfig";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import type {
  TreatProduct,
  FanDmThread,
  FanDmMessage,
  StorefrontSocialLinks,
  StorefrontLandingContent,
  StorefrontLegal,
  CreatorMonetization,
  TextStyle,
  FanAuthBranding,
  LandingSectionListMarker,
} from "../types";
import { FanLandingPage } from "./FanLandingPage";
import { FanAuthModal } from "./FanAuthModal";
import { FanMemberFeed, FanMemberSaved, fetchFanMemberPostForPurchases } from "./FanMemberFeed";
import { MemberUsernameGateModal } from "./MemberUsernameGateModal";
import { DEFAULT_PRIVACY_POLICY, DEFAULT_TERMS_OF_SERVICE, KNOWN_APP_ROUTES } from "../constants";
import { useAutosizeTextarea } from "../src/hooks/useAutosizeTextarea";
import {
  useUnreadNewMessageNotificationCount,
  clearNewMessageNotificationBadge,
} from "./useUnreadNewMessageNotifications";
import {
  formatDmShortTime,
  formatDmDayCalendarKey,
  formatDmDateDividerLabel,
  formatDmBubbleAuthorLine,
  formatCreatorDmBubblePrimaryLine,
  formatCreatorDmBubbleSecondaryLine,
} from "../src/lib/fanHubDisplay";
import { uploadFanDmAttachment, type DmAttachmentKind } from "../src/lib/dmMediaUpload";
import {
  AUDIO_RECORDER_TIMESLICE_MS,
  createAudioMediaRecorder,
  effectiveBlobType,
  fileExtensionForAudioMime,
  normalizeVoiceRecordingFileType,
  stopMediaRecorderSafe,
} from "../src/lib/browserMediaRecording";
import { AudioLevelMeter } from "./AudioLevelMeter";
import { RecordingDurationLabel } from "./RecordingDurationLabel";
import { DmAudioPlayer } from "./DmAudioPlayer";
import { inferIsAudioFromUrl, inferIsVideoFromUrl } from "../src/lib/mediaUrlInfer";
import { FanHubNotificationBell, type FanHubNotificationNavigatePayload } from "./FanHubNotificationBell";
import { getAvatarCropStyle } from "../src/lib/avatarCrop";
import { resolveStoreCopy } from "../src/lib/storefrontStoreCopy";
import { resolveTipSectionCopy } from "../src/lib/tipSectionCopy";
import { normalizeMemberUsername, validateMemberUsernameFormat } from "../src/lib/memberUsername";
import { mergeFanHubStorefrontTheme } from "../src/lib/mergeFanHubStorefrontTheme";
import { normalizeHeroMediaForStorefront } from "../src/lib/storefrontHeroNormalize";
import { useAppContext } from "./AppContext";
import { isConfiguredCustomStorefrontHost } from "../src/lib/storefrontCustomDomain";
import { usePathname } from "../src/hooks/usePathname";
import { db } from "../firebaseConfig";
import { ReportProblemModal } from "./ReportProblemModal";
import { Toast } from "./Toast";
import VideoCallRoom from "./VideoCallRoom";
import { readFanCheckoutFetchResult, FAN_TIP_CHECKOUT_SUCCESS_QS } from "../src/lib/fanCheckoutResponse";
import { WitmeHeaderLogo } from "./WitmeHeaderLogo";
import { formatFanStorefrontDocumentTitle, getFanFacingSiteTitle } from "../src/lib/fanFacingSiteTitle";
import { creatorIdFirestoreQueryVariants, normalizeCreatorId } from "../src/lib/creatorIdNormalize";

/** Ensure member-store products have usable Firestore ids (avoids every row showing “Processing…” when id is missing or duplicated). */
function toOptionalNonNegativeInt(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.floor(n));
}

function normalizeMemberTreatProducts(raw: unknown): TreatProduct[] {
  if (!Array.isArray(raw)) return [];
  const out: TreatProduct[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Partial<TreatProduct> & { id?: unknown };
    const sid =
      typeof p.id === "string"
        ? p.id.trim()
        : p.id != null && String(p.id).trim() !== ""
          ? String(p.id).trim()
          : "";
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    const quantityLimit = toOptionalNonNegativeInt((p as { quantityLimit?: unknown }).quantityLimit);
    const soldCount = toOptionalNonNegativeInt((p as { soldCount?: unknown }).soldCount);
    out.push({
      ...(p as TreatProduct),
      id: sid,
      quantityLimit,
      soldCount,
    });
  }
  return out;
}

async function loadTreatProductsViaFirestore(
  creatorId: string,
  context: "landing" | "member"
): Promise<TreatProduct[]> {
  const variants = creatorIdFirestoreQueryVariants(creatorId);
  const canReadOwnerScope =
    !!auth.currentUser?.uid &&
    normalizeCreatorId(auth.currentUser.uid) === normalizeCreatorId(creatorId);
  const out: TreatProduct[] = [];
  const seen = new Set<string>();
  for (const cid of variants) {
    let snap;
    try {
      /**
       * For public/guest storefront reads, Firestore rules require visibility/archive predicates to be
       * part of the query. Creator-owner reads can use creatorId-only query for manage/member parity.
       */
      snap = canReadOwnerScope
        ? await getDocs(query(collection(db, "products"), where("creatorId", "==", cid)))
        : await getDocs(
            query(
              collection(db, "products"),
              where("creatorId", "==", cid),
              where("visible", "==", true),
              where("archived", "==", false)
            )
          );
    } catch (e) {
      console.warn("Landing/member Firestore treats fallback query failed", {
        creatorIdVariant: cid,
        context,
        canReadOwnerScope,
        error: e,
      });
      continue;
    }
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const x = d.data() as Record<string, unknown>;
      if (x.archived === true || x.visible === false) continue;
      if (context === "landing" && x.showOnLandingPage === false) continue;
      if (context === "member" && x.showInMemberStore === false) continue;
      out.push({
        id: d.id,
        creatorId: normalizeCreatorId(String(x.creatorId ?? "")) || String(x.creatorId ?? ""),
        type: ((x.type as TreatProduct["type"]) || "custom") as TreatProduct["type"],
        title: String(x.title ?? ""),
        description: typeof x.description === "string" ? x.description : undefined,
        priceCents: Number(x.priceCents) || 0,
        mediaUrl: typeof x.mediaUrl === "string" ? x.mediaUrl : undefined,
        imageUrl: typeof x.imageUrl === "string" ? x.imageUrl : undefined,
        archived: x.archived === true,
        visible: x.visible !== false,
        showOnLandingPage: x.showOnLandingPage !== false,
        showInMemberStore: x.showInMemberStore !== false,
        sortOrder: typeof x.sortOrder === "number" ? x.sortOrder : undefined,
        quantityLimit: toOptionalNonNegativeInt(x.quantityLimit),
        soldCount: toOptionalNonNegativeInt(x.soldCount),
        createdAt: String(x.createdAt ?? ""),
        updatedAt: String(x.updatedAt ?? ""),
      });
    }
  }
  out.sort((a, b) => {
    const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
  return out;
}

/** Default bio set at fan signup; hide platform-branded defaults on creator hubs. */
function isEchoFluxDefaultFanBio(bio: string): boolean {
  const s = bio.trim().toLowerCase();
  return (
    s === "welcome to echoflux.ai!" ||
    s === "welcome to echoflux.ai" ||
    s === "welcome to engagesuite.ai!" ||
    s === "welcome to engagesuite.ai" ||
    s === "welcome to engagesuite!" ||
    s === "welcome to engagesuite"
  );
}

/** Parse `users/{uid}` for fan member profile tab (Firestore + Auth fallbacks). */
function parseFanMemberProfileFromUserDoc(
  d: Record<string, unknown>,
  authDisplayName: string | null | undefined,
  authPhotoURL: string | null | undefined
): {
  firstName: string;
  lastName: string;
  bio: string;
  photoURL: string;
  username: string;
} {
  const displayNameRaw =
    (typeof d.displayName === "string" && d.displayName.trim()) ||
    authDisplayName ||
    "";
  const firstName =
    (typeof d.firstName === "string" && d.firstName.trim()) ||
    (displayNameRaw ? displayNameRaw.split(/\s+/)[0] : "");
  const lastName =
    (typeof d.lastName === "string" && d.lastName.trim()) ||
    (displayNameRaw.includes(" ") ? displayNameRaw.split(/\s+/).slice(1).join(" ") : "");
  const bioRaw =
    (typeof d.bio === "string" && d.bio.trim()) ||
    (typeof d.memberBio === "string" && d.memberBio.trim()) ||
    "";
  const bio = isEchoFluxDefaultFanBio(bioRaw) ? "" : bioRaw;
  const photoURL =
    (typeof d.photoURL === "string" && d.photoURL.trim()) ||
    (typeof d.avatar === "string" && d.avatar.trim()) ||
    authPhotoURL ||
    "";
  const username =
    (typeof d.username === "string" && d.username.trim())
      ? normalizeMemberUsername(d.username)
      : "";
  return { firstName, lastName, bio, photoURL, username };
}

export type StorefrontCreator = {
  creatorId: string;
  handle: string;
  displayName: string;
  bio?: string;
  avatar?: string;
  avatarUrl?: string;
  avatarObjectPosition?: string;
  logo?: string;
  logoUrl?: string;
  heroImage?: string;
  heroImageUrl?: string;
  heroTagline?: string;
  heroPromise?: string;
  heroSubline?: string;
  heroSubline2?: string;
  socialLinks?: StorefrontSocialLinks;
  landingContent?: StorefrontLandingContent;
  legal?: StorefrontLegal;
  theme: {
    primary: string;
    background: string;
    text?: string;
    textMuted?: string;
    presetId?: string;
    buttonStyle?: string;
    fontFamily?: string;
    accentHover?: string;
    /** Optional; used for themed borders on member UI */
    border?: string;
  };
  heroLayout?: "default" | "centered" | "split" | "splitRight";
  sections: { feed: boolean; treats: boolean; tip?: boolean; messages: boolean; about?: boolean };
  sectionsOrder?: string[];
  /** Guest-visible treats on public landing (no sign-in). */
  publicTreatsOnLanding?: boolean;
  rules?: { boundariesText?: string };
  spicyMode?: boolean;
  monetization?: CreatorMonetization;
  feedSettings?: { hideLikeCounts?: boolean; hideComments?: boolean; hideLikes?: boolean; hideTipButton?: boolean };
  heroMedia?: {
    url: string;
    size?: "small" | "medium" | "large" | "fullBackground";
    backgroundPosition?: string;
    objectPosition?: string;
    landingAvatarLeft?: string;
    landingAvatarBottom?: string;
  }[];
  textStyles?: {
    displayName?: TextStyle;
    bio?: TextStyle;
    heroTagline?: TextStyle;
    heroPromise?: TextStyle;
    perksTitle?: TextStyle;
    perksText?: TextStyle;
    previewTitle?: TextStyle;
    previewText?: TextStyle;
    energyTitle?: TextStyle;
    boundaryTitle?: TextStyle;
    boundaryText?: TextStyle;
  };
  fanAuthBranding?: FanAuthBranding;
};

type HeaderSessionAlert = {
  id: string;
  kind: "chat" | "video";
  title: string;
  ctaLabel: string;
  startsAt?: string;
  status: string;
};

type SupportThread = {
  id: string;
  title: string;
  status: "open" | "closed";
  createdAt?: string;
  updatedAt?: string;
  lastMessage?: string;
};

type SupportMessage = {
  id: string;
  senderType: "fan" | "support";
  content: string;
  createdAt?: string;
};

type FanDeliveryPurchaseType = "product" | "post_unlock" | "unlock" | "tip" | "subscription";

type FanDeliveryPurchase = {
  id: string;
  creatorId: string;
  fanId: string;
  fanEmail?: string;
  type: FanDeliveryPurchaseType;
  productId: string | null;
  /** Feed post id for paid feed unlocks (`post_unlock`). */
  postId?: string | null;
  productTitle?: string;
  amountCents: number;
  status: string;
  createdAt: string;
  deliveryStatus?: "pending" | "delivered";
  deliveryType?: "video" | "image" | "audio" | "text" | "link" | null;
  deliveryText?: string | null;
  deliveryUrl?: string | null;
  deliveredAt?: string | null;
};

type DmLiveSession = {
  id: string;
  status: string;
  chatType: string;
  durationMinutes: number;
  startedAt: string | null;
  endsAt: string | null;
  remainingSeconds: number;
};

function normalizeFanPurchaseType(raw: Record<string, unknown>): FanDeliveryPurchaseType {
  const type = typeof raw.type === "string" ? raw.type.trim().toLowerCase() : "";
  const productType = typeof raw.productType === "string" ? raw.productType.trim().toLowerCase() : "";
  if (type === "tip" || productType === "tip") return "tip";
  if (type === "subscription" || productType === "subscription") return "subscription";
  if (typeof raw.tipHandle === "string" && raw.tipHandle.trim()) return "tip";
  if (type === "post_unlock" || productType === "post_unlock") return "post_unlock";
  if (type === "unlock" || productType === "unlock") return "unlock";
  return "product";
}

function toIsoFromUnknownDate(v: unknown): string {
  if (v == null) return new Date(0).toISOString();
  if (typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v < 1e12 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  if (typeof v === "string") {
    const ms = Date.parse(v);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  }
  return new Date(0).toISOString();
}

function FanPurchaseUnlockedPostBlock({
  creatorId,
  postId,
  primary,
  onOpenInFeed,
}: {
  creatorId: string;
  postId: string;
  primary: string;
  onOpenInFeed: () => void;
}) {
  const [row, setRow] = useState<Awaited<ReturnType<typeof fetchFanMemberPostForPurchases>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRow(null);
    void fetchFanMemberPostForPurchases(creatorId, postId).then((r) => {
      if (!cancelled) {
        setRow(r);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [creatorId, postId]);

  if (loading) {
    return <p className="fan-member-loading" style={{ marginTop: "0.5rem" }}>Loading…</p>;
  }
  if (!row) {
    return (
      <p className="fan-member-about-text" style={{ marginTop: "0.5rem" }}>
        This post isn&apos;t available. You can still open it from Home if it appears there.
      </p>
    );
  }

  return (
    <>
      {row.body ? (
        <div className="fan-profile-panel" style={{ marginTop: "0.6rem" }}>
          <p className="fan-member-about-text" style={{ whiteSpace: "pre-wrap" }}>
            {row.body}
          </p>
        </div>
      ) : null}
      {row.mediaUrls.map((url, i) => {
        const declared = row.mediaTypes[i] === "video" ? "video" : "image";
        const isVideo = declared === "video" || inferIsVideoFromUrl(url);
        if (isVideo) {
          return (
            <video
              key={`${url}-${i}`}
              src={url}
              controls
              controlsList="nodownload noplaybackrate noremoteplayback"
              disablePictureInPicture
              playsInline
              preload="metadata"
              style={{ width: "100%", marginTop: "0.6rem", borderRadius: 10 }}
            />
          );
        }
        return (
          <img
            key={`${url}-${i}`}
            src={url}
            alt=""
            loading="lazy"
            style={{ width: "100%", marginTop: "0.6rem", borderRadius: 10 }}
          />
        );
      })}
      {row.audioUrls.map((url) => (
        <audio
          key={url}
          src={url}
          controls
          controlsList="nodownload noplaybackrate noremoteplayback"
          preload="metadata"
          style={{ width: "100%", marginTop: "0.6rem" }}
        />
      ))}
      <button
        type="button"
        className="fan-member-treat-buy"
        style={{ marginTop: "0.65rem", backgroundColor: primary }}
        onClick={onOpenInFeed}
      >
        Open in Home
      </button>
    </>
  );
}

function fanPurchaseTypeLabel(o: FanDeliveryPurchase): string {
  return o.type === "post_unlock" ? "Feed unlock" : (o.type || "product").replace(/_/g, " ");
}

function fanPurchaseRowStatus(o: FanDeliveryPurchase): string {
  if (o.type === "tip") return "Tip paid";
  if (o.type === "subscription") return "Membership active";
  if (o.type === "post_unlock") return "Unlocked";
  if (o.deliveryStatus === "delivered") return "Delivered";
  return "Pending";
}

/** Shared media / actions for one purchase (full cards and compact expanded rows). */
function FanMemberPurchaseItemBody({
  o,
  creatorId,
  primary,
  onOpenFeed,
}: {
  o: FanDeliveryPurchase;
  creatorId: string | undefined;
  primary: string;
  onOpenFeed: () => void;
}) {
  return (
    <div className="fan-member-treat-action" style={{ display: "block" }}>
      {o.type === "tip" ? (
        <span className="fan-member-treat-owned">Tip paid</span>
      ) : o.type === "subscription" ? (
        <span className="fan-member-treat-owned">Membership active</span>
      ) : o.type === "post_unlock" ? (
        <>
          <span className="fan-member-treat-owned">Unlocked</span>
          {o.postId && creatorId ? (
            <FanPurchaseUnlockedPostBlock
              creatorId={creatorId}
              postId={o.postId}
              primary={primary}
              onOpenInFeed={onOpenFeed}
            />
          ) : (
            <button
              type="button"
              className="fan-member-treat-buy"
              style={{ marginTop: "0.65rem", backgroundColor: primary }}
              onClick={onOpenFeed}
            >
              Open in Home
            </button>
          )}
        </>
      ) : o.deliveryStatus === "delivered" ? (
        <>
          <span className="fan-member-treat-owned">Delivered</span>
          {o.deliveryType === "text" && o.deliveryText ? (
            <div className="fan-profile-panel" style={{ marginTop: "0.6rem" }}>
              <p className="fan-member-about-text" style={{ whiteSpace: "pre-wrap" }}>
                {o.deliveryText}
              </p>
            </div>
          ) : null}
          {o.deliveryType === "video" && o.deliveryUrl ? (
            <video
              src={o.deliveryUrl}
              controls
              controlsList="nodownload noplaybackrate noremoteplayback"
              disablePictureInPicture
              playsInline
              preload="metadata"
              style={{ width: "100%", marginTop: "0.6rem", borderRadius: 10 }}
            />
          ) : null}
          {o.deliveryType === "image" && o.deliveryUrl ? (
            <img
              src={o.deliveryUrl}
              alt="Delivered purchase media"
              loading="lazy"
              style={{ width: "100%", marginTop: "0.6rem", borderRadius: 10 }}
            />
          ) : null}
          {o.deliveryType === "audio" && o.deliveryUrl ? (
            <audio
              src={o.deliveryUrl}
              controls
              controlsList="nodownload noplaybackrate noremoteplayback"
              preload="metadata"
              style={{ width: "100%", marginTop: "0.6rem" }}
            />
          ) : null}
          {o.deliveryType === "link" && o.deliveryUrl ? (
            <a
              href={o.deliveryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="fan-member-treat-buy"
              style={{
                marginTop: "0.6rem",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                backgroundColor: primary,
              }}
            >
              Open link
            </a>
          ) : null}
        </>
      ) : (
        <span className="fan-member-treat-owned">Pending delivery</span>
      )}
    </div>
  );
}

/** Member hub URL segments (path-based tabs). Keep in sync with App.tsx storefront path checks. */
const MEMBER_PATH_SLUGS = new Set([
  "home",
  "feed",
  "store",
  "treats",
  "purchases",
  "tip",
  "messages",
  "profile",
  "saved",
  "about",
]);

type FanStorefrontMemberTab =
  | "feed"
  | "treats"
  | "messages"
  | "tip"
  | "saved"
  | "about"
  | "profile"
  | "purchases";

function isMemberPathSlug(seg: string): boolean {
  return MEMBER_PATH_SLUGS.has(seg.toLowerCase());
}

function memberPathSlugToTab(slug: string): FanStorefrontMemberTab | null {
  const s = slug.trim().toLowerCase();
  if (s === "home" || s === "feed") return "feed";
  if (s === "store" || s === "treats") return "treats";
  if (s === "purchases") return "purchases";
  if (s === "tip") return "tip";
  if (s === "messages") return "messages";
  if (s === "profile") return "profile";
  if (s === "saved") return "saved";
  if (s === "about") return "about";
  return null;
}

function memberTabToPathSlug(tab: FanStorefrontMemberTab): string | null {
  switch (tab) {
    case "feed":
      return null;
    case "treats":
      return "store";
    case "purchases":
      return "purchases";
    case "tip":
      return "tip";
    case "messages":
      return "messages";
    case "profile":
      return "profile";
    case "saved":
      return "saved";
    case "about":
      return "about";
    default:
      return null;
  }
}

function decodeHandleSegment(raw: string): string {
  try {
    return decodeURIComponent(raw).replace("@", "").toLowerCase().trim();
  } catch {
    return raw.replace("@", "").toLowerCase().trim();
  }
}

/**
 * On custom domains, paths like `/dashboard` can be injected by stale app navigation/history.
 * Treat these as reserved app routes instead of creator handles.
 */
const CUSTOM_DOMAIN_RESERVED_APP_ROUTE_SEGMENTS = new Set(
  (KNOWN_APP_ROUTES as readonly string[])
    .map((p) => p.replace(/^\/+/, "").trim().toLowerCase())
    .filter(Boolean)
);

function buildFanStorefrontMemberPath(tab: FanStorefrontMemberTab, creatorHandle: string): string {
  if (typeof window === "undefined") return `/${creatorHandle}`;
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  const slug = memberTabToPathSlug(tab);
  const legacy = pathname.match(/^\/(?:u|link)\/([^/]+)/);
  if (legacy) {
    const seg = legacy[1];
    if (!slug) return `/u/${seg}`;
    return `/u/${seg}/${slug}`;
  }
  if (isConfiguredCustomStorefrontHost(window.location.hostname)) {
    const parts = pathname.slice(1).split("/").filter(Boolean);
    const atRootHub = parts.length === 0 || (parts.length === 1 && isMemberPathSlug(parts[0]));
    if (atRootHub) {
      if (!slug) return `/`;
      return `/${slug}`;
    }
  }
  if (!slug) return `/${creatorHandle}`;
  return `/${creatorHandle}/${slug}`;
}

/** Update pathname for member hub tab; drops legacy `?tab=` while preserving other query params. */
function applyFanStorefrontMemberUrl(
  tab: FanStorefrontMemberTab,
  ctx: {
    showLanding: boolean;
    creatorHandle: string | null | undefined;
    stripSearchKeys?: string[];
  }
): void {
  if (typeof window === "undefined" || ctx.showLanding || !ctx.creatorHandle?.trim()) return;
  const path = buildFanStorefrontMemberPath(tab, ctx.creatorHandle.trim());
  const p = new URLSearchParams(window.location.search);
  p.delete("tab");
  for (const k of ctx.stripSearchKeys || []) {
    if (k) p.delete(k);
  }
  const qs = p.toString();
  const hash = window.location.hash || "";
  window.history.replaceState(null, "", path + (qs ? `?${qs}` : "") + hash);
}

/** Second path segment: public landing (members signed in see hub at /{handle}; this forces the marketing page). Shorter than `?landing=1`. */
const FAN_STOREFRONT_PUBLIC_LANDING_SLUG = "p";

/**
 * Path → handle + legal subpage + optional member nav segment (path-based tabs).
 * - Default domain: /{handle}, /{handle}/p (public landing), /{handle}/terms|privacy|{nav}, legacy /u|link/{handle}/...
 * - Custom domain: /, /p (public landing when member), /terms|privacy, /{nav} at root hub, /{handle}, /{handle}/{nav}
 */
function parseHandleFromPath(): {
  handle: string | null;
  subpage: "terms" | "privacy" | null;
  memberNavSlug: string | null;
  /** `/{handle}/p` or custom `/p` — same effect as `?landing=1` */
  publicLandingPath: boolean;
} {
  if (typeof window === "undefined") {
    return { handle: null, subpage: null, memberNavSlug: null, publicLandingPath: false };
  }
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const parts = path.slice(1).split("/").filter(Boolean);
  const host = window.location.hostname;
  const custom = isConfiguredCustomStorefrontHost(host);
  const pubSlug = FAN_STOREFRONT_PUBLIC_LANDING_SLUG;

  if (custom) {
    if (parts.length === 0) {
      return { handle: null, subpage: null, memberNavSlug: null, publicLandingPath: false };
    }
    if (parts.length === 1 && parts[0] === pubSlug) {
      return { handle: null, subpage: null, memberNavSlug: null, publicLandingPath: true };
    }
    if (parts.length === 1 && (parts[0] === "terms" || parts[0] === "privacy")) {
      return { handle: null, subpage: parts[0] as "terms" | "privacy", memberNavSlug: null, publicLandingPath: false };
    }
    if (parts.length === 1 && isMemberPathSlug(parts[0])) {
      return { handle: null, subpage: null, memberNavSlug: parts[0].toLowerCase(), publicLandingPath: false };
    }
    if (parts.length === 1 && CUSTOM_DOMAIN_RESERVED_APP_ROUTE_SEGMENTS.has(parts[0].toLowerCase())) {
      return { handle: null, subpage: null, memberNavSlug: null, publicLandingPath: false };
    }
    if (parts.length === 1 && /^[a-z0-9_]+$/i.test(parts[0])) {
      return { handle: decodeHandleSegment(parts[0]), subpage: null, memberNavSlug: null, publicLandingPath: false };
    }
    if (parts.length === 2) {
      const a = parts[0];
      const b = parts[1].toLowerCase();
      if (b === pubSlug && /^[a-z0-9_]+$/i.test(a)) {
        return { handle: decodeHandleSegment(a), subpage: null, memberNavSlug: null, publicLandingPath: true };
      }
      if (b === "terms" || b === "privacy") {
        return { handle: decodeHandleSegment(a), subpage: b as "terms" | "privacy", memberNavSlug: null, publicLandingPath: false };
      }
      if (/^[a-z0-9_]+$/i.test(a) && isMemberPathSlug(b)) {
        return { handle: decodeHandleSegment(a), subpage: null, memberNavSlug: b, publicLandingPath: false };
      }
    }
    return { handle: null, subpage: null, memberNavSlug: null, publicLandingPath: false };
  }

  const legacyFull = path.match(/^\/(?:u|link)\/([^/]+)(?:\/([^/]+))?$/);
  if (legacyFull) {
    const h = decodeHandleSegment(legacyFull[1]);
    const rest = (legacyFull[2] || "").toLowerCase();
    if (rest === "terms" || rest === "privacy") {
      return { handle: h, subpage: rest as "terms" | "privacy", memberNavSlug: null, publicLandingPath: false };
    }
    if (rest === pubSlug) {
      return { handle: h, subpage: null, memberNavSlug: null, publicLandingPath: true };
    }
    if (rest && isMemberPathSlug(rest)) {
      return { handle: h, subpage: null, memberNavSlug: rest, publicLandingPath: false };
    }
    return { handle: h, subpage: null, memberNavSlug: null, publicLandingPath: false };
  }

  const handleSeg = parts[0];
  if (!handleSeg) return { handle: null, subpage: null, memberNavSlug: null, publicLandingPath: false };
  const seg1 = (parts[1] || "").toLowerCase();
  if (seg1 === "terms" || seg1 === "privacy") {
    return { handle: decodeHandleSegment(handleSeg), subpage: seg1 as "terms" | "privacy", memberNavSlug: null, publicLandingPath: false };
  }
  if (seg1 === pubSlug) {
    return { handle: decodeHandleSegment(handleSeg), subpage: null, memberNavSlug: null, publicLandingPath: true };
  }
  if (seg1 && isMemberPathSlug(seg1)) {
    return { handle: decodeHandleSegment(handleSeg), subpage: null, memberNavSlug: seg1, publicLandingPath: false };
  }
  return { handle: decodeHandleSegment(handleSeg), subpage: null, memberNavSlug: null, publicLandingPath: false };
}

function normalizeHandleKey(input: string | null | undefined): string {
  return String(input || "")
    .replace("@", "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeFirebaseStorageObjectPath(url: string): string {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("firebasestorage.googleapis.com")) return url;
    const marker = "/o/";
    const idx = u.pathname.indexOf(marker);
    if (idx < 0) return url;
    const head = u.pathname.slice(0, idx + marker.length);
    const rawObject = u.pathname.slice(idx + marker.length);
    const decoded = decodeURIComponent(rawObject);
    const reencoded = encodeURIComponent(decoded);
    if (reencoded === rawObject) return url;
    return `${u.origin}${head}${reencoded}${u.search}`;
  } catch {
    return url;
  }
}

function isLocalCheckoutHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
}

function buildPublicCheckoutUrl(pathname: string, search = "", hash = ""): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (isLocalCheckoutHost(window.location.hostname)) {
    // Local dev proxies /api to Vercel; Stripe rejects localhost return URLs on live checkout.
    return `https://echoflux.ai${pathname}${search}${hash}`;
  }
  return `${window.location.origin}${pathname}${search}${hash}`;
}

/** Merge query params then append Stripe's literal `{CHECKOUT_SESSION_ID}` (URLSearchParams encodes `{}` and breaks substitution). */
function buildMemberCheckoutSuccessSearch(currentSearch: string) {
  const p = new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch);
  p.set("purchase_sync", "1");
  const enc = p.toString();
  return enc ? `${enc}&session_id={CHECKOUT_SESSION_ID}` : `purchase_sync=1&session_id={CHECKOUT_SESSION_ID}`;
}

const TIP_PRESET_AMOUNTS = [5, 10, 25, 50, 100, 250];
const DM_LIVE_REFRESH_MS = 3000;

const DmPhotoIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const DmMicIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

interface TipSectionProps {
  creatorId: string;
  displayName: string;
  primary: string;
  /** From My Page landing content — same heading as public landing; member-only subline (no “no subscription” default). */
  tipHeading: string;
  tipSubline: string;
  tipSelectedPreset: number | null;
  setTipSelectedPreset: (v: number | null) => void;
  tipCustomAmount: string;
  setTipCustomAmount: (v: string) => void;
  tipLoading: boolean;
  setTipLoading: (v: boolean) => void;
  showToast: (message: string, type: "success" | "error" | "info") => void;
}

function TipSection({
  creatorId,
  displayName,
  primary,
  tipHeading,
  tipSubline,
  tipSelectedPreset,
  setTipSelectedPreset,
  tipCustomAmount,
  setTipCustomAmount,
  tipLoading,
  setTipLoading,
  showToast,
}: TipSectionProps) {
  const parsedCustomAmount = tipCustomAmount.trim()
    ? Number.parseFloat(tipCustomAmount)
    : NaN;
  const customAmountCents = Number.isFinite(parsedCustomAmount)
    ? Math.round(parsedCustomAmount * 100)
    : 0;
  const amountCents =
    tipSelectedPreset != null
      ? tipSelectedPreset * 100
      : customAmountCents;

  const startTipCheckout = async (cents: number) => {
    if (cents < 100 || cents > 100000) {
      showToast("Choose an amount between $1 and $1,000.", "error");
      return;
    }
    setTipLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const successUrl = buildPublicCheckoutUrl(window.location.pathname, `?${FAN_TIP_CHECKOUT_SUCCESS_QS}`);
      const cancelUrl = buildPublicCheckoutUrl(window.location.pathname, "?tip=cancel");
      const res = await fetch("/api/createFanCheckoutSession", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          creatorId,
          type: "tip",
          amountCents: cents,
          ...(successUrl ? { successUrl } : {}),
          ...(cancelUrl ? { cancelUrl } : {}),
        }),
      });
      const { ok, url, error } = await readFanCheckoutFetchResult(res);
      if (!ok || !url) throw new Error(error || "Checkout failed. Please try again.");
      window.location.href = url;
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Something went wrong. Please try again.", "error");
    } finally {
      setTipLoading(false);
    }
  };

  const handleTip = async () => {
    await startTipCheckout(amountCents);
  };

  return (
    <div className="tip-section-wrap">
      {/* Hero */}
      <div className="tip-hero-section">
        <h2 className="tip-hero-title">{tipHeading}</h2>
        <p className="tip-hero-subtitle">{tipSubline}</p>
      </div>

      {/* Amount Selection */}
      <div className="tip-amounts-section">
        <h3 className="tip-amounts-heading">Choose an amount</h3>
        <div className="tip-presets-grid">
          {TIP_PRESET_AMOUNTS.map((dollars) => (
            <button
              key={dollars}
              type="button"
              className={`tip-preset-btn ${tipSelectedPreset === dollars ? "active" : ""}`}
              onClick={() => {
                setTipSelectedPreset(dollars);
                setTipCustomAmount("");
              }}
              style={
                tipSelectedPreset === dollars
                  ? { backgroundColor: primary, borderColor: primary, color: "#fff" }
                  : {}
              }
            >
              ${dollars}
            </button>
          ))}
        </div>

        <div className="tip-custom-section">
          <label className="tip-custom-label">Or enter custom amount ($)</label>
          <input
            type="number"
            min="1"
            max="1000"
            step="0.01"
            value={tipCustomAmount}
            onChange={(e) => {
              setTipCustomAmount(e.target.value);
              setTipSelectedPreset(null);
            }}
            placeholder="e.g. 15"
            className="tip-custom-input"
          />
        </div>

        <button
          type="button"
          className="tip-cta-btn"
          onClick={handleTip}
          disabled={amountCents < 100 || amountCents > 100000 || tipLoading}
          style={{ backgroundColor: primary }}
        >
          {tipLoading ? "Taking you to checkout…" : `Tip $${(amountCents / 100).toFixed(2)}`}
        </button>
      </div>

      {/* Footer */}
      <div className="tip-footer-section">
        <p className="tip-thanks-text">Thank You!</p>
        <span className="tip-heart-icon">💖</span>
      </div>
    </div>
  );
}

export const FanStorefrontView: React.FC = () => {
  const { showToast, activePage, toast, isDarkMode } = useAppContext();
  const pathname = usePathname();
  const [handle, setHandle] = useState<string | null>(() => parseHandleFromPath().handle);
  const [legalSubpage, setLegalSubpage] = useState<"terms" | "privacy" | null>(() => parseHandleFromPath().subpage);
  /** False on custom domain until /api/resolveStorefrontDomain returns */
  const [handleResolveComplete, setHandleResolveComplete] = useState(() => {
    if (typeof window === "undefined") return true;
    const p = parseHandleFromPath();
    return !!p.handle || !isConfiguredCustomStorefrontHost(window.location.hostname);
  });
  const [creator, setCreator] = useState<StorefrontCreator | null>(null);
  const [subscribed, setSubscribed] = useState<boolean>(false);
  const [memberUsernameRequired, setMemberUsernameRequired] = useState(false);
  const [cancelMembershipLoading, setCancelMembershipLoading] = useState(false);
  const [cancelMembershipMessage, setCancelMembershipMessage] = useState<string | null>(null);
  const [membershipType, setMembershipType] = useState<"free" | "paid" | null>(null);
  const [billedSubscriptionPriceCents, setBilledSubscriptionPriceCents] = useState<number | null>(null);
  const [limitedMemberAccess, setLimitedMemberAccess] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [entitlementLoading, setEntitlementLoading] = useState(false);
  const [entitlementBootstrapResolved, setEntitlementBootstrapResolved] = useState(false);
  /** Bumps when entitlement effect re-runs so stale async completions don't leave loading stuck. */
  const entitlementFetchGen = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"feed" | "treats" | "messages" | "tip" | "saved" | "about" | "profile" | "purchases">("feed");
  const [tipSelectedPreset, setTipSelectedPreset] = useState<number | null>(null);
  const [tipCustomAmount, setTipCustomAmount] = useState("");
  const [tipLoading, setTipLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(!!auth.currentUser);
  const [authResolved, setAuthResolved] = useState(!!auth.currentUser);
  /** Keeps member feed/saved `fanId` in sync with auth (avoid stale undefined from render-only auth reads). */
  const [fanAuthUid, setFanAuthUid] = useState<string | undefined>(() => auth.currentUser?.uid);
  const [unlockedProductIds, setUnlockedProductIds] = useState<string[]>([]);
  const [unlockedFanPostIds, setUnlockedFanPostIds] = useState<string[]>([]);
  /** Synthetic member access from server (env-listed admins on selected storefronts). */
  const [fanPageAdminBypass, setFanPageAdminBypass] = useState(false);
  const [treatsProducts, setTreatsProducts] = useState<TreatProduct[]>([]);
  const [treatsLoading, setTreatsLoading] = useState(false);
  const [fanPurchases, setFanPurchases] = useState<FanDeliveryPurchase[]>([]);
  const [fanPurchasesLoading, setFanPurchasesLoading] = useState(false);
  const memberPurchasesCompactStorageKey = useMemo(() => {
    const uid = fanAuthUid;
    const cid = creator?.creatorId;
    if (!uid || !cid) return null;
    return `fanMemberPurchasesCompact:${uid}:${cid}`;
  }, [fanAuthUid, creator?.creatorId]);
  const [memberPurchasesListCompact, setMemberPurchasesListCompact] = useState(false);
  const setMemberPurchasesListCompactPersisted = useCallback(
    (compact: boolean) => {
      setMemberPurchasesListCompact(compact);
      if (!memberPurchasesCompactStorageKey || typeof window === "undefined") return;
      try {
        if (compact) localStorage.setItem(memberPurchasesCompactStorageKey, "1");
        else localStorage.removeItem(memberPurchasesCompactStorageKey);
      } catch {
        /* ignore */
      }
    },
    [memberPurchasesCompactStorageKey]
  );
  useEffect(() => {
    if (!memberPurchasesCompactStorageKey || typeof window === "undefined") return;
    try {
      setMemberPurchasesListCompact(localStorage.getItem(memberPurchasesCompactStorageKey) === "1");
    } catch {
      setMemberPurchasesListCompact(false);
    }
  }, [memberPurchasesCompactStorageKey]);
  /** Visible treats on public landing when creator enables guest checkout */
  const [landingTreatsProducts, setLandingTreatsProducts] = useState<TreatProduct[]>([]);
  const [landingTreatsLoading, setLandingTreatsLoading] = useState(false);
  const [guestTreatPurchasingId, setGuestTreatPurchasingId] = useState<string | null>(null);
  const [treatLinkMessage, setTreatLinkMessage] = useState<string | null>(null);
  const pendingGuestLinkBannerShown = useRef(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [joiningFree, setJoiningFree] = useState(false);
  const [fanAuthOpen, setFanAuthOpen] = useState(false);
  const [fanAuthView, setFanAuthView] = useState<"login" | "signup">("login");
  const [dmThread, setDmThread] = useState<FanDmThread | null>(null);
  const [dmMessages, setDmMessages] = useState<FanDmMessage[]>([]);
  const [dmLabels, setDmLabels] = useState<{ fan: string; creator: string } | null>(null);
  const [dmLoading, setDmLoading] = useState(false);
  const [dmSending, setDmSending] = useState(false);
  const [dmInput, setDmInput] = useState("");
  /** Staged media: send only when the user clicks Send (not immediately after upload/record). */
  const [dmPendingAttachmentUrl, setDmPendingAttachmentUrl] = useState<string | null>(null);
  const [dmPendingAttachmentType, setDmPendingAttachmentType] = useState<DmAttachmentKind | null>(null);
  const [dmPendingAttachmentUploading, setDmPendingAttachmentUploading] = useState(false);
  const [dmPreferredThreadId, setDmPreferredThreadId] = useState<string | null>(null);
  const [dmPreferredSessionId, setDmPreferredSessionId] = useState<string | null>(null);
  const [dmLiveSession, setDmLiveSession] = useState<DmLiveSession | null>(null);
  const dmPremiumSessionLive = useMemo(
    () =>
      dmLiveSession != null &&
      (dmLiveSession.status === "active" || dmLiveSession.status === "paused"),
    [dmLiveSession]
  );
  const dmMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const dmMessagesListRef = useRef<HTMLDivElement | null>(null);
  const dmAutoStickToBottomRef = useRef(true);
  const dmComposerFocusedRef = useRef(false);
  const { ref: dmTextareaRef } = useAutosizeTextarea(dmInput);
  const dmFileInputRef = useRef<HTMLInputElement | null>(null);
  const profileAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const dmThreadFetchGen = useRef(0);
  const dmMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const dmMediaChunksRef = useRef<Blob[]>([]);
  const [dmRecordingVoice, setDmRecordingVoice] = useState(false);
  const [dmVoiceMeterStream, setDmVoiceMeterStream] = useState<MediaStream | null>(null);
  const [dmVoiceMeterKey, setDmVoiceMeterKey] = useState(0);
  const [fanBanned, setFanBanned] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const [profileDraft, setProfileDraft] = useState<{
    firstName: string;
    lastName: string;
    bio: string;
    photoURL: string;
  }>({ firstName: "", lastName: "", bio: "", photoURL: "" });
  const [profileInitial, setProfileInitial] = useState<{
    firstName: string;
    lastName: string;
    bio: string;
    photoURL: string;
  }>({ firstName: "", lastName: "", bio: "", photoURL: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameInitial, setUsernameInitial] = useState("");
  const [usernameState, setUsernameState] = useState<"idle" | "checking" | "available" | "taken" | "current" | "invalid">("idle");
  const [usernameMsg, setUsernameMsg] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  /** When URL is set but the image fails in prod (expired token, 403, etc.), show initials until URL changes. */
  const [memberProfilePhotoLoadFailed, setMemberProfilePhotoLoadFailed] = useState(false);
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNext, setPasswordNext] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [fanDeleteModalOpen, setFanDeleteModalOpen] = useState(false);
  const [fanDeleteConfirmInput, setFanDeleteConfirmInput] = useState("");
  const [fanDeletePassword, setFanDeletePassword] = useState("");
  const [fanDeleteAccountLoading, setFanDeleteAccountLoading] = useState(false);

  const dmIsNearBottom = useCallback((el: HTMLElement | null): boolean => {
    if (!el) return true;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom <= 72;
  }, []);

  const isProfileDirty =
    profileDraft.firstName.trim() !== profileInitial.firstName.trim() ||
    profileDraft.lastName.trim() !== profileInitial.lastName.trim() ||
    profileDraft.bio.trim() !== profileInitial.bio.trim() ||
    (profileDraft.photoURL || "") !== (profileInitial.photoURL || "") ||
    normalizeMemberUsername(usernameDraft || "") !== normalizeMemberUsername(usernameInitial || "");

  const profileUserDocSyncRef = useRef({
    isDirty: false,
    usernameDraft: "",
    usernameInitial: "",
  });
  profileUserDocSyncRef.current = {
    isDirty: isProfileDirty,
    usernameDraft,
    usernameInitial,
  };

  const autoSubscribeRedirectingRef = useRef(false);
  const entitlementHydratingRef = useRef(false);
  const [sessionAlerts, setSessionAlerts] = useState<HeaderSessionAlert[]>([]);
  const sessionAlertIdsRef = useRef<Set<string> | null>(null);
  const [activeVideoSession, setActiveVideoSession] = useState<{ sessionId: string; creatorId: string } | null>(null);
  const [reportProblemOpen, setReportProblemOpen] = useState(false);
  const [supportThreads, setSupportThreads] = useState<SupportThread[]>([]);
  const [supportThreadId, setSupportThreadId] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [supportReplyDraft, setSupportReplyDraft] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const customDomainHandleCacheRef = useRef<{ host: string; handle: string | null } | null>(null);

  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const previewMember = urlParams?.get("preview") === "member";
  /** Logged-in members normally skip landing; `/{handle}/p` or `?landing=1` forces the public marketing page. */
  const forcePublicLanding =
    urlParams?.get("landing") === "1" ||
    (typeof window !== "undefined" && parseHandleFromPath().publicLandingPath);

  const unreadMessageTabCount = useUnreadNewMessageNotificationCount(
    isLoggedIn && creator ? creator.creatorId : false
  );
  /** Live premium chat: hide bell + tab badge even if session poll lags (use session alerts / deep-link session id). */
  const fanLiveChatSessionForThisCreator = sessionAlerts.some((a) => a.kind === "chat");
  const memberSuppressDmNotifications =
    activeTab === "messages" &&
    (dmPremiumSessionLive ||
      fanLiveChatSessionForThisCreator ||
      Boolean(dmPreferredSessionId?.trim()));
  const memberMessagesTabBadgeCount = memberSuppressDmNotifications ? 0 : unreadMessageTabCount;

  const storefrontVisualScore = useCallback((data: Record<string, unknown> | null | undefined): number => {
    if (!data) return -1;
    let score = 0;
    if (typeof data.logo === "string" && data.logo.trim()) score += 8;
    if (typeof data.logoUrl === "string" && data.logoUrl.trim()) score += 8;
    if (typeof data.avatar === "string" && data.avatar.trim()) score += 5;
    if (typeof data.avatarUrl === "string" && data.avatarUrl.trim()) score += 5;
    if (Array.isArray(data.heroMedia) && data.heroMedia.length > 0) score += 6;
    if (typeof data.heroImage === "string" && data.heroImage.trim()) score += 4;
    if (typeof data.heroImageUrl === "string" && data.heroImageUrl.trim()) score += 4;
    if (typeof data.heroTagline === "string" && data.heroTagline.trim()) score += 2;
    if (typeof data.heroPromise === "string" && data.heroPromise.trim()) score += 2;
    if (data.landingContent && typeof data.landingContent === "object") score += 8;
    if (data.textStyles && typeof data.textStyles === "object") score += 8;
    if (data.rules && typeof data.rules === "object") score += 4;
    if (data.theme && typeof data.theme === "object") score += 3;
    if (typeof data.displayName === "string" && data.displayName.trim()) score += 2;
    return score;
  }, []);

  const hasVisibleSocialLinks = useCallback((socialLinks: StorefrontSocialLinks | undefined): boolean => {
    if (!socialLinks || typeof socialLinks !== "object") return false;
    const hasUrl = (url?: string) => typeof url === "string" && url.trim().length > 0;
    if (hasUrl(socialLinks.instagram?.url) && socialLinks.instagram?.show !== false) return true;
    if (hasUrl(socialLinks.x?.url) && socialLinks.x?.show !== false) return true;
    if (hasUrl(socialLinks.tiktok?.url) && socialLinks.tiktok?.show !== false) return true;
    if (hasUrl(socialLinks.youtube?.url) && socialLinks.youtube?.show !== false) return true;
    if (hasUrl(socialLinks.facebook?.url) && socialLinks.facebook?.show !== false) return true;
    const legacyTwitter = (socialLinks as StorefrontSocialLinks & { twitter?: { url?: string; show?: boolean } }).twitter;
    if (hasUrl(legacyTwitter?.url) && legacyTwitter?.show !== false) return true;
    if (Array.isArray(socialLinks.custom)) {
      return socialLinks.custom.some((c) => hasUrl(c?.url) && c?.show !== false);
    }
    return false;
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.title;
    const brand = getFanFacingSiteTitle();
    const label =
      (creator?.displayName && creator.displayName.trim()) ||
      (creator?.handle && creator.handle.trim()) ||
      (handle && handle.trim()) ||
      "";

    let next: string;
    if (legalSubpage === "terms") {
      next = label ? `Terms · ${label} · ${brand}` : `Terms · ${brand}`;
    } else if (legalSubpage === "privacy") {
      next = label ? `Privacy · ${label} · ${brand}` : `Privacy · ${brand}`;
    } else if (creator) {
      next = formatFanStorefrontDocumentTitle(creator.displayName, creator.handle);
    } else if (error) {
      next = `Page not found · ${brand}`;
    } else if (handle) {
      next = formatFanStorefrontDocumentTitle(undefined, handle);
    } else {
      next = brand;
    }
    document.title = next;
    return () => {
      document.title = prev;
    };
  }, [creator, error, handle, legalSubpage]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (activeTab !== "messages" || !uid || !creator?.creatorId) return;
    void clearNewMessageNotificationBadge(uid, creator.creatorId);
  }, [activeTab, creator?.creatorId]);

  /** Chat off → Messages tab hidden; leave tab if user was on Messages */
  useEffect(() => {
    if (!creator?.creatorId) return;
    const chatOn = creator.monetization?.chatEnabled !== false;
    if (chatOn || activeTab !== "messages") return;
    const order = creator.sectionsOrder || ["feed", "treats", "tip", "messages", "about"];
    const sec = creator.sections ?? {};
    const next =
      order.find(
        (key) =>
          key !== "saved" &&
          key !== "messages" &&
          key !== "about" &&
          (sec as Record<string, boolean>)[key] !== false
      ) ?? "feed";
    const nextTab = next as FanStorefrontMemberTab;
    setActiveTab(nextTab);
    if (creator?.handle?.trim()) {
      applyFanStorefrontMemberUrl(nextTab, { showLanding: false, creatorHandle: creator.handle });
    }
  }, [
    creator?.creatorId,
    creator?.handle,
    creator?.monetization?.chatEnabled,
    creator?.sectionsOrder,
    creator?.sections,
    activeTab,
  ]);

  useEffect(() => {
    const parsed = parseHandleFromPath();
    setLegalSubpage(parsed.subpage);
    if (typeof window !== "undefined" && isConfiguredCustomStorefrontHost(window.location.hostname)) {
      const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
      const parts = currentPath.slice(1).split("/").filter(Boolean);
      const seg = parts.length === 1 ? parts[0].toLowerCase() : "";
      const shouldNormalizeToRoot =
        !!seg &&
        !isMemberPathSlug(seg) &&
        seg !== "terms" &&
        seg !== "privacy" &&
        seg !== FAN_STOREFRONT_PUBLIC_LANDING_SLUG &&
        CUSTOM_DOMAIN_RESERVED_APP_ROUTE_SEGMENTS.has(seg);
      if (shouldNormalizeToRoot) {
        window.history.replaceState(
          null,
          "",
          "/" + (window.location.search || "") + (window.location.hash || "")
        );
      }
    }
    if (parsed.handle) {
      setHandle(parsed.handle);
      setHandleResolveComplete(true);
      return;
    }
    const host = window.location.hostname;
    const isCustomHost = isConfiguredCustomStorefrontHost(host);
    if (!isCustomHost) {
      setHandle(null);
      setHandleResolveComplete(true);
      return;
    }
    if (customDomainHandleCacheRef.current?.host === host) {
      setHandle(customDomainHandleCacheRef.current.handle);
      setHandleResolveComplete(true);
      return;
    }
    setHandleResolveComplete(false);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/resolveStorefrontDomain?host=${encodeURIComponent(host)}`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && typeof (data as { handle?: string }).handle === "string") {
          const h = (data as { handle: string }).handle.trim().toLowerCase();
          customDomainHandleCacheRef.current = { host, handle: h || null };
          setHandle(h || null);
        } else {
          customDomainHandleCacheRef.current = { host, handle: null };
          setHandle(null);
        }
      } catch {
        if (!cancelled) {
          customDomainHandleCacheRef.current = { host, handle: null };
          setHandle(null);
        }
      } finally {
        if (!cancelled) setHandleResolveComplete(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!handleResolveComplete) return;
    if (!handle) {
      setError("Invalid handle");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/getCreatorByHandle?handle=${encodeURIComponent(handle)}`);
        if (cancelled) return;
        let resolved: StorefrontCreator | null = null;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg = (body as { error?: string }).error;
          // Local-dev resilience: if proxied API is down, allow the signed-in creator
          // to load their own storefront directly from Firestore by matching handle.
          if (db && import.meta.env.DEV && auth.currentUser?.uid) {
            try {
              const ownDoc = await getDoc(doc(db, "creators", auth.currentUser.uid));
              if (ownDoc.exists()) {
                const own = ownDoc.data() as Record<string, unknown>;
                const ownHandle = normalizeHandleKey(typeof own.handle === "string" ? own.handle : "");
                const routeHandle = normalizeHandleKey(handle);
                if (ownHandle && routeHandle && ownHandle === routeHandle) {
                  const ownTheme = mergeFanHubStorefrontTheme(own.theme as Record<string, unknown> | undefined);
                  const ownSections = (own.sections as Record<string, boolean> | undefined) || {};
                  const ownRules = (own.rules as Record<string, string> | undefined) || {};
                  const ownMonetization =
                    (own.monetization as StorefrontCreator["monetization"] | undefined) ||
                    (typeof own.freeAccessEnabled === "boolean" ||
                    typeof own.tipsEnabled === "boolean" ||
                    typeof own.monthlyPrice === "number"
                      ? {
                          freeAccessEnabled: own.freeAccessEnabled === true,
                          tipsEnabled: own.tipsEnabled !== false,
                          ...(typeof own.monthlyPrice === "number" ? { monthlyPrice: own.monthlyPrice } : {}),
                        }
                      : undefined);
                  const ownHeroMedia = normalizeHeroMediaForStorefront(
                    own.heroMedia,
                    own.heroImage,
                    own.heroImageUrl
                  );
                  const ownHeroImage =
                    (typeof own.heroImage === "string" && own.heroImage.trim()) ||
                    (typeof own.heroImageUrl === "string" && own.heroImageUrl.trim()) ||
                    ownHeroMedia[0]?.url ||
                    undefined;

                  resolved = {
                    creatorId: auth.currentUser.uid,
                    handle: routeHandle || handle,
                    displayName: (own.displayName as string) || routeHandle || handle,
                    bio: (own.bio as string) || undefined,
                    avatar: (own.avatar as string) || (own.avatarUrl as string) || undefined,
                    avatarObjectPosition: (own.avatarObjectPosition as string) || undefined,
                    logo: (own.logo as string) || (own.logoUrl as string) || undefined,
                    logoUrl: (own.logoUrl as string) || undefined,
                    showDisplayNameOnLanding: (own.showDisplayNameOnLanding as boolean) !== false,
                    heroImage: ownHeroImage,
                    heroImageUrl: (own.heroImageUrl as string) || undefined,
                    heroMedia: ownHeroMedia.length > 0 ? ownHeroMedia : undefined,
                    heroTagline: (own.heroTagline as string) || undefined,
                    heroPromise: (own.heroPromise as string) || undefined,
                    heroSubline: (own.heroSubline as string) || undefined,
                    heroSubline2: (own.heroSubline2 as string) || undefined,
                    socialLinks: own.socialLinks as StorefrontCreator["socialLinks"] | undefined,
                    landingContent: own.landingContent as StorefrontCreator["landingContent"] | undefined,
                    legal: own.legal as StorefrontCreator["legal"] | undefined,
                    textStyles: own.textStyles as StorefrontCreator["textStyles"] | undefined,
                    theme: {
                      primary: ownTheme.primary || "#6366f1",
                      background: ownTheme.background || "#fafafa",
                      text: ownTheme.text || "#1f2937",
                      textMuted: ownTheme.textMuted,
                      presetId: ownTheme.presetId,
                      buttonStyle: ownTheme.buttonStyle || "solid",
                      fontFamily: ownTheme.fontFamily,
                      accentHover: ownTheme.accentHover,
                      border: ownTheme.border,
                    },
                    heroLayout: (own.heroLayout as StorefrontCreator["heroLayout"]) || "default",
                    sections: {
                      feed: ownSections.feed !== false,
                      treats: ownSections.treats !== false,
                      tip: ownSections.tip !== false,
                      messages: ownSections.messages !== false,
                      about: ownSections.about !== false,
                    },
                    sectionsOrder: (own.sectionsOrder as string[] | undefined) || ["feed", "treats", "tip", "messages", "about"],
                    publicTreatsOnLanding: own.publicTreatsOnLanding === true,
                    rules: ownRules.boundariesText != null ? { boundariesText: ownRules.boundariesText } : undefined,
                    spicyMode: own.spicyMode === true,
                    monetization: ownMonetization,
                    feedSettings: own.feedSettings as StorefrontCreator["feedSettings"] | undefined,
                    fanAuthBranding: own.fanAuthBranding as StorefrontCreator["fanAuthBranding"] | undefined,
                  };
                }
              }
            } catch {
              // fall through to standard API error below
            }
          }
          if (!resolved) {
            setError(
              res.status === 404
                ? msg || "Creator not found"
                : res.status >= 500
                  ? msg || "Unable to load this creator. Please try again in a moment."
                  : msg || "Creator not found"
            );
            setCreator(null);
            setLoading(false);
            return;
          }
        } else {
          const data = await res.json();
          resolved = data as StorefrontCreator;
        }

        const missingVisuals =
          !String(resolved.logo ?? "").trim() &&
          !String(resolved.logoUrl ?? "").trim() &&
          !String(resolved.avatar ?? "").trim() &&
          !String(resolved.heroImage ?? "").trim() &&
          !String(resolved.heroImageUrl ?? "").trim() &&
          (!Array.isArray(resolved.heroMedia) || resolved.heroMedia.length === 0);

        if (db) {
          try {
            const q = query(collection(db, "creators"), where("handle", "==", handle));
            const snapByHandle = await getDocs(q);
            if (!snapByHandle.empty) {
              let best = snapByHandle.docs[0].data() as Record<string, unknown>;
              let bestScore = storefrontVisualScore(best);
              for (const d of snapByHandle.docs.slice(1)) {
                const cand = d.data() as Record<string, unknown>;
                const s = storefrontVisualScore(cand);
                if (s > bestScore) {
                  best = cand;
                  bestScore = s;
                }
              }
              const resolvedHasLogo =
                String((resolved as { logo?: string }).logo ?? "").trim() !== "" ||
                String((resolved as { logoUrl?: string }).logoUrl ?? "").trim() !== "";
              if (bestScore > storefrontVisualScore(resolved as unknown as Record<string, unknown>) || !resolvedHasLogo) {
                resolved = {
                  ...resolved,
                  logo:
                    resolved.logo ||
                    (typeof best.logo === "string" ? best.logo : undefined) ||
                    (typeof best.logoUrl === "string" ? best.logoUrl : undefined),
                  logoUrl:
                    resolved.logoUrl ||
                    (typeof best.logoUrl === "string" ? best.logoUrl : undefined),
                  avatar:
                    resolved.avatar ||
                    (typeof best.avatar === "string" ? best.avatar : undefined) ||
                    (typeof best.avatarUrl === "string" ? best.avatarUrl : undefined),
                  avatarObjectPosition:
                    resolved.avatarObjectPosition ||
                    (typeof best.avatarObjectPosition === "string" ? best.avatarObjectPosition : undefined),
                  heroImage:
                    resolved.heroImage ||
                    (typeof best.heroImage === "string" ? best.heroImage : undefined) ||
                    (typeof best.heroImageUrl === "string" ? best.heroImageUrl : undefined),
                  heroImageUrl:
                    resolved.heroImageUrl ||
                    (typeof best.heroImageUrl === "string" ? best.heroImageUrl : undefined),
                  heroMedia:
                    (Array.isArray(resolved.heroMedia) && resolved.heroMedia.length > 0)
                      ? resolved.heroMedia
                      : (Array.isArray(best.heroMedia) ? (best.heroMedia as StorefrontCreator["heroMedia"]) : undefined),
                  heroTagline:
                    resolved.heroTagline ||
                    (typeof best.heroTagline === "string" ? best.heroTagline : undefined),
                  heroPromise:
                    resolved.heroPromise ||
                    (typeof best.heroPromise === "string" ? best.heroPromise : undefined),
                  heroSubline:
                    resolved.heroSubline ||
                    (typeof best.heroSubline === "string" ? best.heroSubline : undefined),
                  heroSubline2:
                    resolved.heroSubline2 ||
                    (typeof best.heroSubline2 === "string" ? best.heroSubline2 : undefined),
                  displayName:
                    resolved.displayName ||
                    (typeof best.displayName === "string" ? best.displayName : undefined),
                  bio:
                    resolved.bio ||
                    (typeof best.bio === "string" ? best.bio : undefined),
                  socialLinks:
                    (hasVisibleSocialLinks(resolved.socialLinks as StorefrontSocialLinks | undefined)
                      ? resolved.socialLinks
                      : undefined) ||
                    (best.socialLinks as StorefrontCreator["socialLinks"] | undefined),
                  landingContent:
                    resolved.landingContent ||
                    (best.landingContent as StorefrontCreator["landingContent"] | undefined),
                  textStyles:
                    resolved.textStyles ||
                    (best.textStyles as StorefrontCreator["textStyles"] | undefined),
                  rules:
                    resolved.rules ||
                    (best.rules as StorefrontCreator["rules"] | undefined),
                  theme:
                    resolved.theme ||
                    (best.theme as StorefrontCreator["theme"] | undefined),
                  heroLayout:
                    resolved.heroLayout ||
                    (best.heroLayout as StorefrontCreator["heroLayout"] | undefined),
                  showDisplayNameOnLanding:
                    typeof best.showDisplayNameOnLanding === "boolean"
                      ? (best.showDisplayNameOnLanding as boolean)
                      : resolved.showDisplayNameOnLanding,
                };
              }
            }
          } catch {
            // Optional fallback only; keep API payload when Firestore read is unavailable.
          }
        }
        // Strong fallback for creator-owned storefront while signed in:
        // use the signed-in creator doc directly when it matches this handle.
        if (db && auth.currentUser?.uid) {
          try {
            const ownDoc = await getDoc(doc(db, "creators", auth.currentUser.uid));
            if (ownDoc.exists()) {
              const own = ownDoc.data() as Record<string, unknown>;
              const ownHandle = normalizeHandleKey(typeof own.handle === "string" ? own.handle : "");
              const routeHandle = normalizeHandleKey(handle);
              if (ownHandle && routeHandle && ownHandle === routeHandle) {
                const ownMonetization = (
                  (own.monetization as StorefrontCreator["monetization"] | undefined) ||
                  (typeof own.freeAccessEnabled === "boolean" ||
                  typeof own.tipsEnabled === "boolean" ||
                  typeof own.monthlyPrice === "number"
                    ? {
                        freeAccessEnabled: own.freeAccessEnabled === true,
                        tipsEnabled: own.tipsEnabled !== false,
                        ...(typeof own.monthlyPrice === "number" ? { monthlyPrice: own.monthlyPrice } : {}),
                      }
                    : undefined)
                );
                resolved = {
                  ...resolved,
                  creatorId: auth.currentUser.uid,
                  logo:
                    resolved.logo ||
                    (typeof own.logo === "string" ? own.logo : undefined) ||
                    (typeof own.logoUrl === "string" ? own.logoUrl : undefined),
                  logoUrl:
                    resolved.logoUrl ||
                    (typeof own.logoUrl === "string" ? own.logoUrl : undefined),
                  avatar:
                    resolved.avatar ||
                    (typeof own.avatar === "string" ? own.avatar : undefined) ||
                    (typeof own.avatarUrl === "string" ? own.avatarUrl : undefined),
                  avatarObjectPosition:
                    resolved.avatarObjectPosition ||
                    (typeof own.avatarObjectPosition === "string" ? own.avatarObjectPosition : undefined),
                  heroImage:
                    resolved.heroImage ||
                    (typeof own.heroImage === "string" ? own.heroImage : undefined) ||
                    (typeof own.heroImageUrl === "string" ? own.heroImageUrl : undefined),
                  heroImageUrl:
                    resolved.heroImageUrl ||
                    (typeof own.heroImageUrl === "string" ? own.heroImageUrl : undefined),
                  heroMedia:
                    (Array.isArray(resolved.heroMedia) && resolved.heroMedia.length > 0)
                      ? resolved.heroMedia
                      : (Array.isArray(own.heroMedia) ? (own.heroMedia as StorefrontCreator["heroMedia"]) : undefined),
                  heroTagline:
                    resolved.heroTagline ||
                    (typeof own.heroTagline === "string" ? own.heroTagline : undefined),
                  heroPromise:
                    resolved.heroPromise ||
                    (typeof own.heroPromise === "string" ? own.heroPromise : undefined),
                  heroSubline:
                    resolved.heroSubline ||
                    (typeof own.heroSubline === "string" ? own.heroSubline : undefined),
                  heroSubline2:
                    resolved.heroSubline2 ||
                    (typeof own.heroSubline2 === "string" ? own.heroSubline2 : undefined),
                  displayName:
                    resolved.displayName ||
                    (typeof own.displayName === "string" ? own.displayName : undefined),
                  bio:
                    resolved.bio ||
                    (typeof own.bio === "string" ? own.bio : undefined),
                  socialLinks:
                    (hasVisibleSocialLinks(resolved.socialLinks as StorefrontSocialLinks | undefined)
                      ? resolved.socialLinks
                      : undefined) ||
                    (own.socialLinks as StorefrontCreator["socialLinks"] | undefined),
                  landingContent:
                    resolved.landingContent ||
                    (own.landingContent as StorefrontCreator["landingContent"] | undefined),
                  textStyles:
                    resolved.textStyles ||
                    (own.textStyles as StorefrontCreator["textStyles"] | undefined),
                  rules:
                    resolved.rules ||
                    (own.rules as StorefrontCreator["rules"] | undefined),
                  // Owner preview should reflect owner's latest theme and monetization exactly.
                  theme:
                    (own.theme as StorefrontCreator["theme"] | undefined) ||
                    resolved.theme,
                  monetization:
                    ownMonetization ||
                    resolved.monetization,
                  sections:
                    (own.sections as StorefrontCreator["sections"] | undefined) ||
                    resolved.sections,
                  sectionsOrder:
                    (own.sectionsOrder as StorefrontCreator["sectionsOrder"] | undefined) ||
                    resolved.sectionsOrder,
                  fanAuthBranding:
                    (own.fanAuthBranding as StorefrontCreator["fanAuthBranding"] | undefined) ||
                    resolved.fanAuthBranding,
                  publicTreatsOnLanding:
                    typeof own.publicTreatsOnLanding === "boolean"
                      ? (own.publicTreatsOnLanding as boolean)
                      : resolved.publicTreatsOnLanding,
                  heroLayout:
                    resolved.heroLayout ||
                    (own.heroLayout as StorefrontCreator["heroLayout"] | undefined),
                  showDisplayNameOnLanding:
                    typeof own.showDisplayNameOnLanding === "boolean"
                      ? (own.showDisplayNameOnLanding as boolean)
                      : resolved.showDisplayNameOnLanding,
                };
              }
            }
          } catch {
            // Optional fallback only.
          }
        }
        // Member/live fallback too: if logo is missing but the signed-in creator doc for this handle has one,
        // merge it so header branding stays consistent with My Page save state.
        if (db && auth.currentUser?.uid) {
          const resolvedHasLogoNow =
            String((resolved as { logo?: string }).logo ?? "").trim() !== "" ||
            String((resolved as { logoUrl?: string }).logoUrl ?? "").trim() !== "";
          if (!resolvedHasLogoNow) {
            try {
              const ownDoc = await getDoc(doc(db, "creators", auth.currentUser.uid));
              if (ownDoc.exists()) {
                const own = ownDoc.data() as Record<string, unknown>;
                const ownHandle = normalizeHandleKey(typeof own.handle === "string" ? own.handle : "");
                const routeHandle = normalizeHandleKey(handle);
                const ownLogo =
                  (typeof own.logo === "string" ? own.logo.trim() : "") ||
                  (typeof own.logoUrl === "string" ? own.logoUrl.trim() : "");
                if (ownHandle && routeHandle && ownHandle === routeHandle && ownLogo) {
                  resolved = {
                    ...resolved,
                    logo: ownLogo,
                    logoUrl: ownLogo,
                  };
                }
              }
            } catch {
              // Optional fallback only.
            }
          }
        }
        const resolvedLogo = String((resolved as { logo?: string }).logo ?? "").trim();
        const resolvedLogoUrl = String((resolved as { logoUrl?: string }).logoUrl ?? "").trim();
        if (!resolvedLogo && resolvedLogoUrl) {
          resolved = { ...resolved, logo: resolvedLogoUrl };
        } else if (resolvedLogo && !resolvedLogoUrl) {
          resolved = { ...resolved, logoUrl: resolvedLogo };
        }
        setCreator(resolved);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError("Failed to load creator");
          setCreator(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handle, handleResolveComplete, storefrontVisualScore, hasVisibleSocialLinks, isLoggedIn, forcePublicLanding]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setAuthResolved(true);
      setIsLoggedIn(!!u);
      setFanAuthUid(u?.uid);
    });
    return () => unsub();
  }, []);

  const joinFanVideoSession = useCallback(
    async (sessionId: string, notifyCreatorId: string) => {
      if (!notifyCreatorId.trim() || !auth.currentUser) return;
      try {
        const token = await auth.currentUser.getIdToken(true);
        const res = await fetch("/api/liveVideoChat?action=token", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId, creatorId: notifyCreatorId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || "Could not open video session");
        const roomUrl = (data as { roomUrl?: string }).roomUrl;
        const tokenParam = (data as { token?: string }).token;
        if (!roomUrl || !tokenParam) throw new Error("Video room is not ready yet.");
        setActiveVideoSession({ sessionId, creatorId: notifyCreatorId });
      } catch (e) {
        showToast?.(e instanceof Error ? e.message : "Could not open video session.", "error");
      }
    },
    [showToast]
  );

  const handleSessionAlertAction = useCallback(
    async (alert: HeaderSessionAlert) => {
      if (!creator?.creatorId || !auth.currentUser) return;
      if (alert.kind === "chat") {
        setActiveTab("messages");
        if (creator?.handle?.trim()) {
          applyFanStorefrontMemberUrl("messages", { showLanding: false, creatorHandle: creator.handle });
        }
        return;
      }
      await joinFanVideoSession(alert.id, creator.creatorId);
    },
    [creator?.creatorId, creator?.handle, joinFanVideoSession]
  );

  useEffect(() => {
    if (!isLoggedIn || !creator?.creatorId || !auth.currentUser) {
      setSessionAlerts([]);
      sessionAlertIdsRef.current = null;
      return;
    }
    let cancelled = false;

    const fetchAlerts = async () => {
      try {
        const token = await auth.currentUser!.getIdToken();
        const res = await fetch(`/api/getFanSessionAlerts?creatorId=${encodeURIComponent(creator.creatorId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const alerts = Array.isArray((data as { alerts?: HeaderSessionAlert[] }).alerts)
          ? ((data as { alerts: HeaderSessionAlert[] }).alerts || [])
          : [];
        if (!cancelled) {
          setSessionAlerts(alerts);
          const nextIds = new Set(alerts.map((a) => `${a.kind}:${a.id}`));
          const prevIds = sessionAlertIdsRef.current;
          if (prevIds) {
            const newOnes = alerts.filter((a) => !prevIds.has(`${a.kind}:${a.id}`));
            if (newOnes.length > 0) {
              const first = newOnes[0];
              showToast?.(first.title, "info");
            }
          }
          sessionAlertIdsRef.current = nextIds;
        }
      } catch {
        if (!cancelled) setSessionAlerts([]);
      }
    };

    void fetchAlerts();
    const timer = window.setInterval(fetchAlerts, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isLoggedIn, creator?.creatorId, showToast]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser?.uid || !db) {
      setSupportThreads([]);
      setSupportThreadId(null);
      return;
    }
    const uid = auth.currentUser.uid;
    const q = query(
      collection(db, "users", uid, "support_threads"),
      orderBy("updatedAt", "desc"),
      limit(25)
    );
    return onSnapshot(
      q,
      (snap) => {
        const next: SupportThread[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : "Problem report",
            status: data.status === "closed" ? "closed" : "open",
            createdAt: typeof data.createdAt === "string" ? data.createdAt : undefined,
            updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
            lastMessage: typeof data.lastMessage === "string" ? data.lastMessage : undefined,
          };
        });
        setSupportThreads(next);
        setSupportThreadId((prev) => prev ?? next[0]?.id ?? null);
      },
      () => {
        setSupportThreads([]);
      }
    );
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser?.uid || !supportThreadId || !db) {
      setSupportMessages([]);
      return;
    }
    const uid = auth.currentUser.uid;
    const q = query(
      collection(db, "users", uid, "support_threads", supportThreadId, "messages"),
      orderBy("createdAt", "asc"),
      limit(200)
    );
    return onSnapshot(
      q,
      (snap) => {
        const msgs: SupportMessage[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const createdAt =
            typeof data.createdAt === "string"
              ? data.createdAt
              : data.createdAt && typeof (data.createdAt as { toDate?: () => Date }).toDate === "function"
                ? (data.createdAt as { toDate: () => Date }).toDate().toISOString()
                : undefined;
          return {
            id: d.id,
            senderType: data.senderType === "support" ? "support" : "fan",
            content: typeof data.content === "string" ? data.content : "",
            createdAt,
          };
        });
        setSupportMessages(msgs);
      },
      () => {
        setSupportMessages([]);
      }
    );
  }, [isLoggedIn, supportThreadId]);

  const submitSupportProblem = useCallback(
    async ({ message, diagnostics }: { message: string; diagnostics: string }) => {
      if (!auth.currentUser?.uid || !creator?.creatorId) throw new Error("Please sign in again and try.");
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch("/api/createSupportTicket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          creatorId: creator.creatorId,
          reporterKind: "fan",
          message,
          diagnostics,
          page: activePage,
          url: typeof window !== "undefined" ? window.location.href : "",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !(data as { success?: boolean }).success) {
        throw new Error((data as { error?: string }).error || "Failed to create support ticket");
      }
      setSupportThreadId((data as { ticketId?: string }).ticketId ?? null);
      setActiveTab("profile");
      if (creator?.handle?.trim()) {
        applyFanStorefrontMemberUrl("profile", { showLanding: false, creatorHandle: creator.handle });
      }
    },
    [activePage, creator?.creatorId, creator?.handle, setActiveTab]
  );

  const sendSupportReply = useCallback(async () => {
    const content = supportReplyDraft.trim();
    if (!content || !auth.currentUser?.uid || !supportThreadId) return;
    setSupportSending(true);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch("/api/supportTicketReply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticketId: supportThreadId, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to send support reply");
      setSupportReplyDraft("");
      showToast("Reply sent to support.", "success");
    } catch (error: any) {
      showToast(error?.message || "Failed to send support reply", "error");
    } finally {
      setSupportSending(false);
    }
  }, [showToast, supportReplyDraft, supportThreadId]);

  const getSupportMessageMainText = useCallback((content: string): string => {
    const [main] = content.split("\n\n---\n");
    return (main || content).trim();
  }, []);

  const getSupportMessageDiagnostics = useCallback((content: string): string | null => {
    const parts = content.split("\n\n---\n");
    if (parts.length < 2) return null;
    const diagnostics = parts.slice(1).join("\n\n---\n").trim();
    return diagnostics || null;
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!creator?.creatorId || !isLoggedIn) {
      setSubscribed(false);
      setMembershipType(null);
      setMemberUsernameRequired(false);
      setUnlockedFanPostIds([]);
      setLimitedMemberAccess(false);
      setFanPageAdminBypass(false);
      setEntitlementLoading(false);
      setEntitlementBootstrapResolved(true);
      entitlementHydratingRef.current = false;
      return;
    }

    const gen = ++entitlementFetchGen.current;
    setEntitlementBootstrapResolved(false);
    setEntitlementLoading(true);
    entitlementHydratingRef.current = true;

    (async () => {
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
        const res = await fetch(
          `/api/getFanEntitlement?creatorId=${encodeURIComponent(creator.creatorId)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        const data = await res.json().catch(() => ({}));
        if (gen !== entitlementFetchGen.current) return;
        const nextUnlockedProducts = Array.isArray((data as { unlockedProductIds?: string[] }).unlockedProductIds)
          ? (data as { unlockedProductIds: string[] }).unlockedProductIds
          : [];
        const nextUnlockedPosts =
          Array.isArray((data as { unlockedFanPostIds?: string[] }).unlockedFanPostIds)
            ? (data as { unlockedFanPostIds: string[] }).unlockedFanPostIds
            : [];
        setSubscribed(!!(data as { subscribed?: boolean }).subscribed);
        setMembershipType(((data as { membershipType?: "free" | "paid" | null }).membershipType ?? null) as "free" | "paid" | null);
        setBilledSubscriptionPriceCents(
          typeof (data as { billedSubscriptionPriceCents?: unknown }).billedSubscriptionPriceCents === "number"
            ? Math.max(0, Math.round((data as { billedSubscriptionPriceCents: number }).billedSubscriptionPriceCents))
            : null
        );
        setMemberUsernameRequired(!!(data as { memberUsernameRequired?: boolean }).memberUsernameRequired);
        setUnlockedProductIds(nextUnlockedProducts);
        setUnlockedFanPostIds(nextUnlockedPosts);
        setLimitedMemberAccess(
          !!(data as { limitedMemberAccess?: boolean }).limitedMemberAccess ||
            nextUnlockedProducts.length > 0 ||
            nextUnlockedPosts.length > 0
        );
        setFanPageAdminBypass(!!(data as { fanPageAdminBypass?: boolean }).fanPageAdminBypass);
      } catch {
        if (gen === entitlementFetchGen.current) {
          setSubscribed(false);
          setMembershipType(null);
          setBilledSubscriptionPriceCents(null);
          setMemberUsernameRequired(false);
          setUnlockedFanPostIds([]);
          setLimitedMemberAccess(false);
          setFanPageAdminBypass(false);
        }
      } finally {
        if (gen === entitlementFetchGen.current) {
          setEntitlementLoading(false);
          setEntitlementBootstrapResolved(true);
          entitlementHydratingRef.current = false;
        }
      }
    })();
  }, [creator?.creatorId, isLoggedIn]);

  const refetchMemberEntitlement = useCallback(async () => {
    if (!creator?.creatorId || !auth.currentUser) return;
    const token = await auth.currentUser.getIdToken(true);
    const res = await fetch(
      `/api/getFanEntitlement?creatorId=${encodeURIComponent(creator.creatorId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json().catch(() => ({}));
    const nextUnlockedProducts = Array.isArray((data as { unlockedProductIds?: string[] }).unlockedProductIds)
      ? (data as { unlockedProductIds: string[] }).unlockedProductIds
      : [];
    const nextUnlockedPosts =
      Array.isArray((data as { unlockedFanPostIds?: string[] }).unlockedFanPostIds)
        ? (data as { unlockedFanPostIds: string[] }).unlockedFanPostIds
        : [];
    setSubscribed(!!(data as { subscribed?: boolean }).subscribed);
    setMembershipType(
      ((data as { membershipType?: "free" | "paid" | null }).membershipType ?? null) as "free" | "paid" | null
    );
    setBilledSubscriptionPriceCents(
      typeof (data as { billedSubscriptionPriceCents?: unknown }).billedSubscriptionPriceCents === "number"
        ? Math.max(0, Math.round((data as { billedSubscriptionPriceCents: number }).billedSubscriptionPriceCents))
        : null
    );
    setMemberUsernameRequired(!!(data as { memberUsernameRequired?: boolean }).memberUsernameRequired);
    setUnlockedProductIds(nextUnlockedProducts);
    setUnlockedFanPostIds(nextUnlockedPosts);
    setLimitedMemberAccess(
      !!(data as { limitedMemberAccess?: boolean }).limitedMemberAccess ||
        nextUnlockedProducts.length > 0 ||
        nextUnlockedPosts.length > 0
    );
    setFanPageAdminBypass(!!(data as { fanPageAdminBypass?: boolean }).fanPageAdminBypass);
  }, [creator?.creatorId]);

  useEffect(() => {
    if (typeof window === "undefined" || !creator?.creatorId || !isLoggedIn) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("post_unlock") !== "1") return;
    if (params.get("session_id")) return; // session_id path: member checkout sync effect runs first
    void refetchMemberEntitlement();
    params.delete("post_unlock");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (qs ? `?${qs}` : "") + (window.location.hash || "")
    );
  }, [creator?.creatorId, isLoggedIn, refetchMemberEntitlement]);

  /** Member checkout return: apply Firestore same as webhook when session_id is present (webhook delay). */
  useEffect(() => {
    if (typeof window === "undefined" || !creator?.creatorId || !isLoggedIn || !auth.currentUser) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("treat_success") === "1") return;
    const sid = params.get("session_id");
    const purchaseSync = params.get("purchase_sync") === "1";
    const postUnlock = params.get("post_unlock") === "1";
    if (!sid || (!purchaseSync && !postUnlock)) return;

    let cancelled = false;
    (async () => {
      try {
        const token = await auth.currentUser!.getIdToken(true);
        let allowPublicFallbackSync = false;
        let synced = false;
        for (let attempt = 0; attempt < 4; attempt++) {
          const res = await fetch("/api/syncFanCheckoutSession", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ sessionId: sid, creatorId: creator.creatorId }),
          });
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (res.ok) {
            synced = true;
            break;
          }
          console.warn("syncFanCheckoutSession", res.status, data);
          // Stripe can briefly return "not complete yet" right after redirect.
          if (res.status === 409 && attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
            continue;
          }
          // If auth-linked sync can't bind this session, still try public sync so tip/order analytics
          // and fan card creation are not blocked by account-id mismatches.
          const code = String((data as { code?: unknown }).code || "");
          if (res.status === 403 || code === "SESSION_FAN_MISMATCH" || code === "SESSION_FAN_MISSING") {
            allowPublicFallbackSync = true;
          }
          break;
        }
        if (!synced && allowPublicFallbackSync) {
          for (let attempt = 0; attempt < 4; attempt++) {
            const pubRes = await fetch("/api/syncFanCheckoutSessionPublic", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId: sid, creatorId: creator.creatorId }),
            }).catch(() => null);
            if (cancelled) return;
            if (pubRes?.ok) {
              synced = true;
              break;
            }
            if (!pubRes) break;
            if (pubRes.status === 409 && attempt < 3) {
              await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
              continue;
            }
            break;
          }
        }
        if (!synced) {
          // Keep URL params so a refresh can retry sync.
          return;
        }
        await refetchMemberEntitlement();
        const url = new URL(window.location.href);
        url.searchParams.delete("session_id");
        url.searchParams.delete("purchase_sync");
        url.searchParams.delete("post_unlock");
        url.searchParams.delete("tip");
        const qs = url.searchParams.toString();
        window.history.replaceState({}, "", url.pathname + (qs ? `?${qs}` : "") + (url.hash || ""));
      } catch (e) {
        if (!cancelled) console.warn("member checkout sync", e);
        void refetchMemberEntitlement();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creator?.creatorId, isLoggedIn, refetchMemberEntitlement]);

  /** Logged-out tip return: webhook updates Firestore; remove session id from the address bar. */
  useEffect(() => {
    if (typeof window === "undefined" || isLoggedIn || !creator?.creatorId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tip") !== "success") return;
    const sid = params.get("session_id");
    if (!sid) return;

    let cancelled = false;
    (async () => {
      try {
        let synced = false;
        for (let attempt = 0; attempt < 4; attempt++) {
          // No auth required: this ensures landing-page tips appear in creator/admin analytics
          // even when webhook delivery is delayed.
          const res = await fetch("/api/syncFanCheckoutSessionPublic", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: sid, creatorId: creator.creatorId }),
          }).catch(() => null);
          if (cancelled) return;
          if (res?.ok) {
            synced = true;
            break;
          }
          if (!res) break;
          // Stripe can briefly return "not complete yet" right after redirect.
          if (res.status === 409 && attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
            continue;
          }
          break;
        }
        if (!synced) {
          // Keep URL params so a refresh can retry sync.
          return;
        }
      } finally {
        if (cancelled) return;
        const url = new URL(window.location.href);
        url.searchParams.delete("session_id");
        url.searchParams.delete("purchase_sync");
        const qs = url.searchParams.toString();
        window.history.replaceState({}, "", url.pathname + (qs ? `?${qs}` : "") + (url.hash || ""));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [creator?.creatorId, isLoggedIn]);

  const fetchTreats = useCallback(async () => {
    if (!creator?.creatorId) return;
    setTreatsLoading(true);
    try {
      const res = await fetch(
        `/api/products?creatorId=${encodeURIComponent(creator.creatorId)}&context=member`
      );
      if (res.ok) {
        const data = await res.json();
        setTreatsProducts(normalizeMemberTreatProducts(data.products));
        return;
      }
      const fallback = await loadTreatProductsViaFirestore(creator.creatorId, "member");
      setTreatsProducts(normalizeMemberTreatProducts(fallback));
    } catch {
      try {
        const fallback = await loadTreatProductsViaFirestore(creator.creatorId, "member");
        setTreatsProducts(normalizeMemberTreatProducts(fallback));
      } catch {
        setTreatsProducts([]);
      }
    } finally {
      setTreatsLoading(false);
    }
  }, [creator?.creatorId]);

  useEffect(() => {
    if ((activeTab === "treats" || activeTab === "purchases") && creator?.creatorId) fetchTreats();
  }, [activeTab, creator?.creatorId, fetchTreats]);

  const fetchFanPurchases = useCallback(async () => {
    if (!creator?.creatorId || !isLoggedIn) return;
    setFanPurchasesLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const url = `/api/fanPurchases?creatorId=${encodeURIComponent(creator.creatorId)}&limit=200`;
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json().catch(() => ({} as { purchases?: FanDeliveryPurchase[]; error?: string }));
      if (res.ok) {
        setFanPurchases(Array.isArray(data.purchases) ? data.purchases : []);
        return;
      }

      // Local/dev fallback when API route is unavailable in current runtime.
      if ((res.status === 404 || res.status === 405) && auth.currentUser?.uid) {
        const fanUid = auth.currentUser.uid;
        const fanEmail = (auth.currentUser.email || "").trim().toLowerCase();
        const byIdSnap = await getDocs(
          query(
            collection(db, "orders"),
            where("creatorId", "==", creator.creatorId),
            where("fanId", "==", fanUid),
            limit(300)
          )
        );
        const outById = new Map<string, FanDeliveryPurchase>();
        for (const d of byIdSnap.docs) {
          const raw = d.data() as Record<string, unknown>;
          const normalizedType = normalizeFanPurchaseType(raw);
          const postIdFromOrder = typeof raw.postId === "string" ? raw.postId.trim() : "";
          outById.set(d.id, {
            id: d.id,
            creatorId: String(raw.creatorId || ""),
            fanId: String(raw.fanId || ""),
            fanEmail: typeof raw.fanEmail === "string" ? raw.fanEmail : undefined,
            type: normalizedType,
            productId: typeof raw.productId === "string" ? raw.productId : null,
            postId: postIdFromOrder || null,
            productTitle: typeof raw.productTitle === "string" ? raw.productTitle : undefined,
            amountCents: Number.isFinite(Number(raw.amountCents)) ? Math.max(0, Math.round(Number(raw.amountCents))) : 0,
            status: typeof raw.status === "string" ? raw.status : "paid",
            createdAt: toIsoFromUnknownDate(raw.createdAt),
            deliveryStatus:
              normalizedType === "tip" || normalizedType === "subscription"
                ? undefined
                : (raw.deliveryStatus === "delivered" ? "delivered" : "pending"),
            deliveryType:
              raw.deliveryType === "video" ||
              raw.deliveryType === "image" ||
              raw.deliveryType === "audio" ||
              raw.deliveryType === "text" ||
              raw.deliveryType === "link"
                ? raw.deliveryType
                : null,
            deliveryText: typeof raw.deliveryText === "string" ? raw.deliveryText : null,
            deliveryUrl: typeof raw.deliveryUrl === "string" ? raw.deliveryUrl : null,
            deliveredAt: typeof raw.deliveredAt === "string" ? raw.deliveredAt : null,
          });
        }
        if (fanEmail) {
          const byEmailSnap = await getDocs(
            query(
              collection(db, "orders"),
              where("creatorId", "==", creator.creatorId),
              where("fanEmail", "==", fanEmail),
              limit(300)
            )
          );
          for (const d of byEmailSnap.docs) {
            const raw = d.data() as Record<string, unknown>;
            const normalizedType = normalizeFanPurchaseType(raw);
            const postIdFromOrderEmail = typeof raw.postId === "string" ? raw.postId.trim() : "";
            outById.set(d.id, {
              id: d.id,
              creatorId: String(raw.creatorId || ""),
              fanId: String(raw.fanId || ""),
              fanEmail: typeof raw.fanEmail === "string" ? raw.fanEmail : undefined,
              type: normalizedType,
              productId: typeof raw.productId === "string" ? raw.productId : null,
              postId: postIdFromOrderEmail || null,
              productTitle: typeof raw.productTitle === "string" ? raw.productTitle : undefined,
              amountCents: Number.isFinite(Number(raw.amountCents))
                ? Math.max(0, Math.round(Number(raw.amountCents)))
                : 0,
              status: typeof raw.status === "string" ? raw.status : "paid",
              createdAt: toIsoFromUnknownDate(raw.createdAt),
              deliveryStatus:
                normalizedType === "tip" || normalizedType === "subscription"
                  ? undefined
                  : (raw.deliveryStatus === "delivered" ? "delivered" : "pending"),
              deliveryType:
                raw.deliveryType === "video" ||
                raw.deliveryType === "image" ||
                raw.deliveryType === "audio" ||
                raw.deliveryType === "text" ||
                raw.deliveryType === "link"
                  ? raw.deliveryType
                  : null,
              deliveryText: typeof raw.deliveryText === "string" ? raw.deliveryText : null,
              deliveryUrl: typeof raw.deliveryUrl === "string" ? raw.deliveryUrl : null,
              deliveredAt: typeof raw.deliveredAt === "string" ? raw.deliveredAt : null,
            });
          }
        }
        const fallbackRows = Array.from(outById.values())
          .filter((o) => o.status !== "refunded")
          .filter(
            (o) =>
              o.type === "product" ||
              o.type === "unlock" ||
              o.type === "post_unlock" ||
              o.type === "tip" ||
              o.type === "subscription"
          )
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        setFanPurchases(fallbackRows);
        return;
      }

      showToast(data.error || "Could not load purchases.", "error");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load purchases.", "error");
    } finally {
      setFanPurchasesLoading(false);
    }
  }, [creator?.creatorId, isLoggedIn, showToast]);

  useEffect(() => {
    if (activeTab === "purchases" && isLoggedIn && creator?.creatorId) {
      void fetchFanPurchases();
    }
  }, [activeTab, creator?.creatorId, fetchFanPurchases, isLoggedIn]);

  /** True when the signed-in Firebase user is this page's creator (handles legacy compound creatorId). */
  const isViewingOwnStorefront =
    !!creator?.creatorId &&
    !!auth.currentUser?.uid &&
    normalizeCreatorId(auth.currentUser.uid) === normalizeCreatorId(creator.creatorId);

  const onPublicLanding =
    !previewMember &&
    (isViewingOwnStorefront ||
      !isLoggedIn ||
      !(subscribed && (creator?.monetization?.freeAccessEnabled === true || membershipType === "paid")));

  /** Guest treat shop on landing: creator allows public store + viewer is not a subscribed member in hub mode (see docs/LOCAL_DEV.md). */
  const landingGuestTreatCommerceEnabled =
    creator?.publicTreatsOnLanding === true &&
    onPublicLanding &&
    creator?.sections?.treats !== false;

  useEffect(() => {
    if (
      !creator?.creatorId ||
      creator.sections?.treats === false ||
      !onPublicLanding ||
      creator.publicTreatsOnLanding !== true
    ) {
      setLandingTreatsProducts([]);
      setLandingTreatsLoading(false);
      return;
    }
    let cancelled = false;
    setLandingTreatsLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/products?creatorId=${encodeURIComponent(creator.creatorId)}&context=landing`
        );
        if (res.ok) {
          if (cancelled) return;
          const data = await res.json();
          if (!cancelled) {
            setLandingTreatsProducts(Array.isArray(data.products) ? data.products : []);
          }
          return;
        }
        const fallback = await loadTreatProductsViaFirestore(creator.creatorId, "landing");
        if (!cancelled) {
          setLandingTreatsProducts(normalizeMemberTreatProducts(fallback));
        }
      } catch {
        try {
          const fallback = await loadTreatProductsViaFirestore(creator.creatorId, "landing");
          if (!cancelled) setLandingTreatsProducts(normalizeMemberTreatProducts(fallback));
        } catch {
          if (!cancelled) setLandingTreatsProducts([]);
        }
      } finally {
        if (!cancelled) setLandingTreatsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    creator?.creatorId,
    creator?.sections?.treats,
    creator?.publicTreatsOnLanding,
    onPublicLanding,
  ]);

  /** Guest checkout returned from Stripe but fan is not signed in yet — prompt before claim can run. */
  useEffect(() => {
    if (typeof window === "undefined" || isLoggedIn || pendingGuestLinkBannerShown.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("treat_success") !== "1" || !params.get("session_id")) return;
    pendingGuestLinkBannerShown.current = true;
    setTreatLinkMessage(
      "Payment successful. Sign in or create an account using the same email you used at checkout — we'll link your purchase to this account automatically."
    );
  }, [isLoggedIn]);

  useEffect(() => {
    if (typeof window === "undefined" || !creator?.creatorId || !isLoggedIn || !auth.currentUser) return;
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");
    const ok = params.get("treat_success") === "1";
    if (!sid || !ok) return;

    let cancelled = false;
    (async () => {
      try {
        const token = await auth.currentUser!.getIdToken(true);
        const res = await fetch("/api/claimGuestPurchase", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId: sid }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          const merged = (data as { merged?: boolean }).merged;
          setTreatLinkMessage(
            merged
              ? "Your purchase is linked to your account. You'll see it in your member area; you can still subscribe anytime for full access."
              : "You're all set — this purchase was already linked to your account."
          );
          const gen = ++entitlementFetchGen.current;
          try {
            const entRes = await fetch(
              `/api/getFanEntitlement?creatorId=${encodeURIComponent(creator.creatorId)}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            const ent = await entRes.json().catch(() => ({}));
            if (gen === entitlementFetchGen.current) {
              const nextUnlockedProducts = Array.isArray((ent as { unlockedProductIds?: string[] }).unlockedProductIds)
                ? (ent as { unlockedProductIds: string[] }).unlockedProductIds
                : [];
              const nextUnlockedPosts =
                Array.isArray((ent as { unlockedFanPostIds?: string[] }).unlockedFanPostIds)
                  ? (ent as { unlockedFanPostIds: string[] }).unlockedFanPostIds
                  : [];
              setSubscribed(!!(ent as { subscribed?: boolean }).subscribed);
              setUnlockedProductIds(nextUnlockedProducts);
              setUnlockedFanPostIds(nextUnlockedPosts);
              setLimitedMemberAccess(
                !!(ent as { limitedMemberAccess?: boolean }).limitedMemberAccess ||
                  nextUnlockedProducts.length > 0 ||
                  nextUnlockedPosts.length > 0
              );
              setFanPageAdminBypass(!!(ent as { fanPageAdminBypass?: boolean }).fanPageAdminBypass);
            }
          } catch {
            /* ignore */
          }
        } else {
          setTreatLinkMessage((data as { error?: string }).error || "Could not link purchase to your account.");
        }
        const url = new URL(window.location.href);
        url.searchParams.delete("session_id");
        url.searchParams.delete("treat_success");
        const qs = url.searchParams.toString();
        window.history.replaceState({}, "", url.pathname + (qs ? `?${qs}` : ""));
      } catch {
        if (!cancelled) setTreatLinkMessage("Could not link purchase. Try again or contact support.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creator?.creatorId, isLoggedIn]);

  const handleGuestTreatPurchase = async (productId: string) => {
    if (!creator?.creatorId) return;
    setGuestTreatPurchasingId(productId);
    try {
      const successUrl = buildPublicCheckoutUrl(
        window.location.pathname,
        "?treat_success=1&session_id={CHECKOUT_SESSION_ID}"
      );
      const cancelUrl = buildPublicCheckoutUrl(window.location.pathname);
      const res = await fetch("/api/createFanCheckoutSession", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorId: creator.creatorId,
          type: "product",
          productId,
          guestProduct: true,
          ...(successUrl ? { successUrl } : {}),
          ...(cancelUrl ? { cancelUrl } : {}),
        }),
      });
      const { ok, url, error } = await readFanCheckoutFetchResult(res);
      if (!ok || !url) throw new Error(error || "Checkout failed");
      window.location.href = url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Checkout could not start. Please try again.";
      showToast?.(msg, "error");
    } finally {
      setGuestTreatPurchasingId(null);
    }
  };

  const startSubscriptionCheckout = async (opts?: { auto?: boolean }) => {
    const isAuto = opts?.auto === true;
    if (!creator?.creatorId || !auth.currentUser) {
      if (isAuto) return;
      setFanAuthView("login");
      setFanAuthOpen(true);
      return;
    }
    if (isAuto) {
      autoSubscribeRedirectingRef.current = true;
    }
    setSubscribing(true);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const currentUrl = typeof window !== "undefined" ? new URL(window.location.href) : null;
      const successUrl = currentUrl
        ? buildPublicCheckoutUrl(
            currentUrl.pathname,
            `?${buildMemberCheckoutSuccessSearch(currentUrl.search)}`,
            currentUrl.hash
          )
        : undefined;
      const cancelUrl = currentUrl
        ? (() => {
            const u = new URL(currentUrl.toString());
            u.searchParams.set("paywall", "1");
            return buildPublicCheckoutUrl(u.pathname, u.search, u.hash);
          })()
        : undefined;
      const res = await fetch("/api/createFanCheckoutSession", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          creatorId: creator.creatorId,
          type: "subscription",
          ...(typeof creator.monetization?.monthlyPrice === "number"
            ? { subscriptionPriceCents: Math.max(100, Math.round(creator.monetization.monthlyPrice)) }
            : {}),
          ...(successUrl ? { successUrl } : {}),
          ...(cancelUrl ? { cancelUrl } : {}),
        }),
      });
      const { ok, url, error } = await readFanCheckoutFetchResult(res);
      if (!ok || !url) throw new Error(error || "Checkout failed");
      window.location.href = url;
    } catch (e) {
      if (!isAuto) {
        showToast(e instanceof Error ? e.message : "Could not open checkout.", "error");
      }
    } finally {
      setSubscribing(false);
      if (isAuto) {
        autoSubscribeRedirectingRef.current = false;
      }
    }
  };

  const handleSubscribe = async () => {
    await startSubscriptionCheckout();
  };

  const handleJoinFree = async () => {
    if (!creator?.creatorId || !auth.currentUser) {
      setFanAuthView("signup");
      setFanAuthOpen(true);
      return;
    }
    setJoiningFree(true);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch("/api/joinFreeMembership", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ creatorId: creator.creatorId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to join");
      // Successfully joined — sync entitlement (username may still be required)
      setSubscribed(true);
      setMembershipType("free");
      try {
        const token2 = await auth.currentUser.getIdToken(true);
        const entRes = await fetch(
          `/api/getFanEntitlement?creatorId=${encodeURIComponent(creator.creatorId)}`,
          { headers: { Authorization: `Bearer ${token2}` } }
        );
        const ent = await entRes.json().catch(() => ({}));
        setMemberUsernameRequired(!!(ent as { memberUsernameRequired?: boolean }).memberUsernameRequired);
        setUnlockedProductIds(
          Array.isArray((ent as { unlockedProductIds?: string[] }).unlockedProductIds)
            ? (ent as { unlockedProductIds: string[] }).unlockedProductIds
            : []
        );
        setUnlockedFanPostIds(
          Array.isArray((ent as { unlockedFanPostIds?: string[] }).unlockedFanPostIds)
            ? (ent as { unlockedFanPostIds: string[] }).unlockedFanPostIds
            : []
        );
        setFanPageAdminBypass(!!(ent as { fanPageAdminBypass?: boolean }).fanPageAdminBypass);
      } catch {
        /* keep prior state */
      }
    } catch (e) {
      console.error("Failed to join free membership:", e);
    } finally {
      setJoiningFree(false);
    }
  };

  const handlePurchase = async (productId: string) => {
    if (!creator?.creatorId || !auth.currentUser) return;
    const pid =
      typeof productId === "string" ? productId.trim() : String(productId ?? "").trim();
    if (!pid) return;
    setPurchasingId(pid);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const u = new URL(typeof window !== "undefined" ? window.location.href : "https://local/");
      const successUrl = buildPublicCheckoutUrl(
        u.pathname,
        `?${buildMemberCheckoutSuccessSearch(u.search)}`,
        u.hash
      );
      const cancelUrl = buildPublicCheckoutUrl(window.location.pathname, window.location.search, window.location.hash);
      const res = await fetch("/api/createFanCheckoutSession", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          creatorId: creator.creatorId,
          type: "product",
          productId: pid,
          ...(successUrl ? { successUrl } : {}),
          ...(cancelUrl ? { cancelUrl } : {}),
        }),
      });
      const { ok, url, error } = await readFanCheckoutFetchResult(res);
      if (!ok || !url) throw new Error(error || "Checkout failed");
      window.location.href = url;
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not open checkout.", "error");
    } finally {
      setPurchasingId(null);
    }
  };

  const formatPrice = (cents: number) => "$" + (cents / 100).toFixed(2);
  const formatRemaining = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds || 0));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const handleCancelMembership = async () => {
    if (!creator?.creatorId || !auth.currentUser) return;
    if (!window.confirm("Cancel your membership? You'll keep access until the end of your current billing period.")) return;
    setCancelMembershipLoading(true);
    setCancelMembershipMessage(null);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch("/api/fanCancelCreatorSubscription", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ creatorId: creator.creatorId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to cancel");
      const endDate = (data as { currentPeriodEnd?: string }).currentPeriodEnd;
      const msg = endDate
        ? `Membership will end on ${new Date(endDate).toLocaleDateString()}. You keep access until then.`
        : "Membership set to cancel at the end of your billing period.";
      setCancelMembershipMessage(msg);
    } catch (e) {
      setCancelMembershipMessage(e instanceof Error ? e.message : "Failed to cancel membership.");
    } finally {
      setCancelMembershipLoading(false);
    }
  };

  const handleOpenProfile = () => {
    setProfileMenuOpen(false);
    setActiveTab("profile");
    if (creator?.handle?.trim()) {
      applyFanStorefrontMemberUrl("profile", { showLanding: false, creatorHandle: creator.handle });
    }
  };

  const handleSendProblem = () => {
    setProfileMenuOpen(false);
    setReportProblemOpen(true);
  };

  const handleLogout = async () => {
    setProfileMenuOpen(false);
    try {
      await auth.signOut();
      setIsLoggedIn(false);
      setMembershipType(null);
      if (creator?.handle) window.location.href = `/${creator.handle}`;
    } catch {
      showToast("Could not log out. Try again.", "error");
    }
  };

  useEffect(() => {
    if (activeTab !== "profile" || !auth.currentUser?.uid) return;
    const uid = auth.currentUser.uid;
    let cancelled = false;
    const userRef = doc(db, "users", uid);
    const applyFallbackFromAuth = () => {
      const dn = auth.currentUser?.displayName || "";
      setProfileDraft({
        firstName: dn ? dn.split(/\s+/)[0] : "",
        lastName: dn.includes(" ") ? dn.split(/\s+/).slice(1).join(" ") : "",
        bio: "",
        photoURL: auth.currentUser?.photoURL || "",
      });
      setProfileInitial({
        firstName: dn ? dn.split(/\s+/)[0] : "",
        lastName: dn.includes(" ") ? dn.split(/\s+/).slice(1).join(" ") : "",
        bio: "",
        photoURL: auth.currentUser?.photoURL || "",
      });
      setUsernameDraft("");
      setUsernameInitial("");
      setUsernameState("idle");
      setUsernameMsg("");
    };
    const unsub = onSnapshot(
      userRef,
      (snap) => {
        if (cancelled) return;
        const d = (snap.data() || {}) as Record<string, unknown>;
        const parsed = parseFanMemberProfileFromUserDoc(
          d,
          auth.currentUser?.displayName,
          auth.currentUser?.photoURL
        );
        const { isDirty, usernameDraft: ud, usernameInitial: ui } = profileUserDocSyncRef.current;
        if (!isDirty) {
          setProfileDraft({
            firstName: parsed.firstName,
            lastName: parsed.lastName,
            bio: parsed.bio,
            photoURL: parsed.photoURL,
          });
          setProfileInitial({
            firstName: parsed.firstName,
            lastName: parsed.lastName,
            bio: parsed.bio,
            photoURL: parsed.photoURL,
          });
          setUsernameDraft(parsed.username);
          setUsernameInitial(parsed.username);
          if (parsed.username) {
            setUsernameState("current");
            setUsernameMsg("Your current username.");
          } else {
            setUsernameState("idle");
            setUsernameMsg("");
          }
          return;
        }
        const normServer = parsed.username;
        const normDraft = normalizeMemberUsername(ud || "");
        const normInit = normalizeMemberUsername(ui || "");
        if (normDraft === normInit && normServer && normServer !== normInit) {
          setUsernameDraft(normServer);
          setUsernameInitial(normServer);
          setUsernameState("current");
          setUsernameMsg("Your current username.");
        }
      },
      () => {
        if (!cancelled) applyFallbackFromAuth();
      }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [activeTab, isLoggedIn, auth.currentUser?.uid]);

  useEffect(() => {
    setMemberProfilePhotoLoadFailed(false);
  }, [profileDraft.photoURL]);

  useEffect(() => {
    if (activeTab !== "profile" || !auth.currentUser) return;
    const raw = usernameDraft.trim();
    if (!raw) {
      setUsernameState("idle");
      setUsernameMsg("");
      return;
    }
    const fmtErr = validateMemberUsernameFormat(raw);
    if (fmtErr) {
      setUsernameState("invalid");
      setUsernameMsg(fmtErr);
      return;
    }
    const normalized = normalizeMemberUsername(raw);
    if (usernameInitial && normalized === normalizeMemberUsername(usernameInitial)) {
      setUsernameState("current");
      setUsernameMsg("Your current username.");
      return;
    }

    let cancelled = false;
    setUsernameState("checking");
    const t = window.setTimeout(async () => {
      try {
        const token = await auth.currentUser!.getIdToken(true);
        const res = await fetch(
          `/api/checkMemberUsernameAvailability?username=${encodeURIComponent(normalized)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setUsernameState("idle");
          setUsernameMsg((data as { error?: string }).error || "Could not check availability.");
          return;
        }
        const reason = (data as { reason?: string }).reason || "";
        if (reason === "invalid") {
          setUsernameState("invalid");
          setUsernameMsg((data as { message?: string }).message || "Invalid username.");
          return;
        }
        if (reason === "current") {
          setUsernameState("current");
          setUsernameMsg("Your current username.");
        } else if ((data as { available?: boolean }).available) {
          setUsernameState("available");
          setUsernameMsg("Available.");
        } else {
          setUsernameState("taken");
          setUsernameMsg((data as { message?: string }).message || "Unavailable — already taken.");
        }
      } catch {
        if (!cancelled) {
          setUsernameState("idle");
          setUsernameMsg("");
        }
      }
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [activeTab, usernameDraft, usernameInitial]);

  const handleProfileSave = useCallback(async () => {
    if (!auth.currentUser?.uid) return;
    if (!isProfileDirty) return;
    const firstName = profileDraft.firstName.trim();
    const lastName = profileDraft.lastName.trim();
    const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || "Member";
    const nextUsername = normalizeMemberUsername(usernameDraft || "");
    const usernameFmtErr = nextUsername ? validateMemberUsernameFormat(nextUsername) : null;
    if (usernameFmtErr) {
      showToast(usernameFmtErr, "error");
      return;
    }
    setProfileSaving(true);
    try {
      if (nextUsername && creator?.creatorId) {
        const token = await auth.currentUser.getIdToken(true);
        const claimRes = await fetch("/api/claimMemberUsername", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ username: nextUsername, creatorId: creator.creatorId }),
        });
        const claimData = await claimRes.json().catch(() => ({}));
        if (!claimRes.ok) {
          throw new Error((claimData as { error?: string }).error || "Could not save username.");
        }
      }
      await setDoc(
        doc(db, "users", auth.currentUser.uid),
        {
          firstName,
          lastName,
          displayName,
          bio: profileDraft.bio.trim(),
          memberBio: profileDraft.bio.trim(),
          photoURL: profileDraft.photoURL || null,
          avatar: profileDraft.photoURL || null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      await updateProfile(auth.currentUser, {
        displayName,
        photoURL: profileDraft.photoURL || null,
      });
      if (nextUsername) {
        setUsernameInitial(nextUsername);
        setUsernameState("current");
        setUsernameMsg("Your current username.");
      } else {
        setUsernameInitial("");
        setUsernameState("idle");
        setUsernameMsg("");
      }
      setProfileInitial({
        firstName,
        lastName,
        bio: profileDraft.bio.trim(),
        photoURL: profileDraft.photoURL || "",
      });
      showToast("Profile updated.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save profile.", "error");
    } finally {
      setProfileSaving(false);
    }
  }, [creator?.creatorId, isProfileDirty, profileDraft, showToast, usernameDraft]);

  const handleProfileAvatarUpload = useCallback(
    async (file: File) => {
      if (!auth.currentUser?.uid) return;
      setAvatarUploading(true);
      try {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `users/${auth.currentUser.uid}/profile_avatar/${Date.now()}.${ext}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
        const url = await getDownloadURL(storageRef);
        setProfileDraft((prev) => ({ ...prev, photoURL: url }));
        showToast("Photo added. Click Save changes to apply.", "success");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not upload avatar.", "error");
      } finally {
        setAvatarUploading(false);
      }
    },
    [showToast]
  );

  const handleChangePassword = useCallback(async () => {
    if (!auth.currentUser) return;
    const email = auth.currentUser.email || "";
    if (!email) {
      showToast("No email found on this account.", "error");
      return;
    }
    const next = passwordNext.trim();
    if (!next || next.length < 8) {
      showToast("Use at least 8 characters for a new password.", "error");
      return;
    }
    if (next !== passwordConfirm.trim()) {
      showToast("New passwords do not match.", "error");
      return;
    }
    setPasswordSaving(true);
    try {
      if (passwordCurrent.trim()) {
        const cred = EmailAuthProvider.credential(email, passwordCurrent.trim());
        await reauthenticateWithCredential(auth.currentUser, cred);
        await updatePassword(auth.currentUser, next);
        showToast("Password updated.", "success");
      } else {
        const actionCodeSettings = {
          url: `${window.location.origin}/reset-password?email=${encodeURIComponent(email)}`,
          handleCodeInApp: false,
        };
        await sendPasswordResetEmail(auth, email, actionCodeSettings);
        showToast("Password reset email sent. Open your email to finish changing password.", "success");
      }
      setPasswordCurrent("");
      setPasswordNext("");
      setPasswordConfirm("");
    } catch (e) {
      const code = (e as { code?: string })?.code || "";
      if (code === "auth/requires-recent-login") {
        showToast("Please log in again, then change password.", "error");
      } else if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        showToast("Current password is incorrect.", "error");
      } else {
        showToast(e instanceof Error ? e.message : "Could not change password.", "error");
      }
    } finally {
      setPasswordSaving(false);
    }
  }, [passwordCurrent, passwordNext, passwordConfirm, showToast]);

  const closeFanDeleteModal = useCallback(() => {
    setFanDeleteModalOpen(false);
    setFanDeleteConfirmInput("");
    setFanDeletePassword("");
  }, []);

  const handleFanDeleteAccount = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) {
      showToast("Sign in to delete your account.", "error");
      return;
    }
    if (fanDeleteConfirmInput.trim().toUpperCase() !== "DELETE") {
      showToast('Type DELETE to confirm.', "error");
      return;
    }
    const providerId = u.providerData[0]?.providerId || "";
    try {
      if (providerId === "password") {
        const pw = fanDeletePassword.trim();
        if (!pw) {
          showToast("Enter your current password to confirm.", "error");
          return;
        }
        const email = u.email;
        if (!email) {
          showToast("No email on this account.", "error");
          return;
        }
        await reauthenticateWithCredential(u, EmailAuthProvider.credential(email, pw));
      } else if (providerId === "google.com") {
        await reauthenticateWithPopup(u, new GoogleAuthProvider());
      } else {
        showToast(
          "This sign-in method can’t be confirmed on this page. Contact support to delete your account.",
          "error"
        );
        return;
      }

      setFanDeleteAccountLoading(true);
      const token = await u.getIdToken(true);
      const res = await fetch("/api/deleteMyAccount", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "Could not delete account.");
      }
      showToast("Your account was deleted.", "success");
      closeFanDeleteModal();
      try {
        await auth.signOut();
      } catch {
        /* ignore */
      }
      const h = creator?.handle?.trim();
      window.location.href = h ? `/${h}` : "/";
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        showToast("Incorrect password. Try again.", "error");
      } else if (code === "auth/popup-closed-by-user") {
        showToast("Sign-in was cancelled.", "info");
      } else {
        showToast(e instanceof Error ? e.message : "Could not delete account.", "error");
      }
    } finally {
      setFanDeleteAccountLoading(false);
    }
  }, [creator?.handle, fanDeleteConfirmInput, fanDeletePassword, showToast, closeFanDeleteModal]);

  const fetchDmThreadAndMessages = useCallback(async (opts?: { silent?: boolean; threadId?: string }) => {
    if (!creator?.creatorId || !auth.currentUser || activeTab !== "messages") return;
    const silent = opts?.silent === true;
    const requestedThreadId = typeof opts?.threadId === "string" ? opts.threadId.trim() : "";
    // Silent refreshes should not invalidate an in-flight foreground load token.
    const gen = silent ? dmThreadFetchGen.current : ++dmThreadFetchGen.current;
    if (!silent) setDmLoading(true);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const cid = creator.creatorId;
      const bannedResPromise = fetch(`/api/checkFanBanned?creatorId=${encodeURIComponent(cid)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const threadsResPromise = requestedThreadId
        ? Promise.resolve(null)
        : fetch("/api/fanDmThreads?as=fan", { headers: { Authorization: `Bearer ${token}` } });
      const [threadsRes, bannedRes] = await Promise.all([threadsResPromise, bannedResPromise]);
      if (gen !== dmThreadFetchGen.current) return;
      const threadsData = threadsRes ? await threadsRes.json().catch(() => ({})) : {};
      const bannedData = await bannedRes.json().catch(() => ({}));
      setFanBanned(!!(bannedData as { banned?: boolean }).banned);
      const threads = (threadsData.threads as FanDmThread[]) || [];
      const byRequestedId = requestedThreadId ? threads.find((t) => t.id === requestedThreadId) : null;
      const withCreator = byRequestedId || threads.find((t) => t.creatorId === cid) || (requestedThreadId
        ? ({ id: requestedThreadId, creatorId: cid, fanId: auth.currentUser.uid } as FanDmThread)
        : null);
      setDmThread(withCreator || null);
      if (withCreator) {
        const msgRes = await fetch(
          `/api/fanDmMessages?threadId=${encodeURIComponent(withCreator.id)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (gen !== dmThreadFetchGen.current) return;
        const msgData = await msgRes.json().catch(() => ({}));
        setDmMessages(Array.isArray(msgData.messages) ? msgData.messages : []);
        const raw = msgData.labels as { fan?: unknown; creator?: unknown } | undefined;
        setDmLabels(
          raw && typeof raw.fan === "string" && typeof raw.creator === "string"
            ? { fan: raw.fan, creator: raw.creator }
            : null
        );
        if (requestedThreadId) setDmPreferredThreadId(null);
      } else {
        setDmMessages([]);
        setDmLabels(null);
      }
    } catch {
      if (gen === dmThreadFetchGen.current) {
        setDmThread(null);
        setDmMessages([]);
        setDmLabels(null);
      }
    } finally {
      if (gen === dmThreadFetchGen.current) {
        if (!silent) setDmLoading(false);
      }
    }
  }, [creator?.creatorId, activeTab, auth.currentUser?.uid]);

  useEffect(() => {
    setDmThread(null);
    setDmMessages([]);
    setDmLabels(null);
    setDmLiveSession(null);
    setDmPreferredSessionId(null);
  }, [creator?.creatorId]);

  useEffect(() => {
    if (activeTab === "messages" && creator?.creatorId && isLoggedIn) fetchDmThreadAndMessages();
  }, [activeTab, creator?.creatorId, isLoggedIn, fetchDmThreadAndMessages]);

  useEffect(() => {
    if (activeTab !== "messages" || !creator?.creatorId || !isLoggedIn || !dmPreferredThreadId) return;
    void fetchDmThreadAndMessages({ threadId: dmPreferredThreadId });
  }, [activeTab, creator?.creatorId, isLoggedIn, dmPreferredThreadId, fetchDmThreadAndMessages]);

  useEffect(() => {
    if (activeTab !== "messages" || !creator?.creatorId || !isLoggedIn) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void fetchDmThreadAndMessages({ silent: true });
    };
    const onFocus = () => {
      tick();
    };
    const id = window.setInterval(tick, DM_LIVE_REFRESH_MS);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [activeTab, creator?.creatorId, isLoggedIn, fetchDmThreadAndMessages]);

  useEffect(() => {
    if (activeTab !== "messages" || !creator?.creatorId || !isLoggedIn || !dmThread?.id || !auth.currentUser) {
      setDmLiveSession(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const token = await auth.currentUser!.getIdToken(true);
        const params = new URLSearchParams({
          creatorId: creator.creatorId,
          threadId: dmThread.id,
        });
        if (dmPreferredSessionId?.trim()) params.set("sessionId", dmPreferredSessionId.trim());
        const res = await fetch(`/api/chatSession?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({} as { session?: DmLiveSession | null }));
        if (cancelled) return;
        const next = (data as { session?: DmLiveSession | null }).session || null;
        setDmLiveSession(next);
        if (next && dmPreferredSessionId && next.id === dmPreferredSessionId) {
          setDmPreferredSessionId(null);
        }
      } catch {
        if (!cancelled) setDmLiveSession(null);
      }
    };
    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [activeTab, creator?.creatorId, isLoggedIn, dmThread?.id, dmPreferredSessionId, auth.currentUser]);

  useEffect(() => {
    if (activeTab !== "messages") {
      setDmPendingAttachmentUrl(null);
      setDmPendingAttachmentType(null);
      setDmPendingAttachmentUploading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setDmPendingAttachmentUrl(null);
    setDmPendingAttachmentType(null);
    setDmPendingAttachmentUploading(false);
  }, [creator?.creatorId]);

  useEffect(() => {
    if (activeTab !== "messages" || dmLoading) return;
    const listEl = dmMessagesListRef.current;
    if (!listEl) return;
    if (dmComposerFocusedRef.current) return;
    if (!dmIsNearBottom(listEl)) {
      dmAutoStickToBottomRef.current = false;
      return;
    }
    if (!dmAutoStickToBottomRef.current) return;
    requestAnimationFrame(() => {
      // Only adjust scroll on the DM list — scrollIntoView can scroll ancestor/page and feel like a "jump".
      listEl.scrollTop = listEl.scrollHeight;
    });
  }, [activeTab, dmMessages, dmLoading, dmIsNearBottom]);

  useEffect(() => {
    if (activeTab === "messages") {
      dmAutoStickToBottomRef.current = true;
    }
  }, [activeTab]);

  useEffect(() => {
    return () => {
      const r = dmMediaRecorderRef.current;
      if (r && r.state !== "inactive") {
        r.onstop = null;
        stopMediaRecorderSafe(r);
      }
    };
  }, []);

  const sendDmWithPayload = async (
    content: string,
    attachmentUrl?: string,
    attachmentType?: DmAttachmentKind
  ) => {
    if (!creator?.creatorId || !auth.currentUser) return;
    if (!content.trim() && !attachmentUrl) return;
    setDmSending(true);
    const prevInput = dmInput;
    setDmInput("");
    try {
      const token = await auth.currentUser.getIdToken(true);
      const body: Record<string, string> = {
        creatorId: creator.creatorId,
        fanId: auth.currentUser.uid,
        content: content.trim(),
      };
      if (dmThread && dmThread.creatorId === creator.creatorId) {
        body.threadId = dmThread.id;
      }
      if (attachmentUrl) {
        body.attachmentUrl = attachmentUrl;
        if (attachmentType) body.attachmentType = attachmentType;
      }
      const res = await fetch("/api/fanDmSend", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to send");
      await fetchDmThreadAndMessages();
      setDmPendingAttachmentUrl(null);
      setDmPendingAttachmentType(null);
      dmAutoStickToBottomRef.current = true;
      requestAnimationFrame(() => {
        const listEl = dmMessagesListRef.current;
        if (listEl) listEl.scrollTop = listEl.scrollHeight;
      });
    } catch {
      setDmInput(prevInput);
    } finally {
      setDmSending(false);
    }
  };

  const sendDm = async () => {
    if (!creator?.creatorId || !auth.currentUser) return;
    if (!dmInput.trim() && !dmPendingAttachmentUrl) return;
    await sendDmWithPayload(
      dmInput.trim(),
      dmPendingAttachmentUrl || undefined,
      dmPendingAttachmentType || undefined
    );
  };

  const clearDmPendingAttachment = () => {
    setDmPendingAttachmentUrl(null);
    setDmPendingAttachmentType(null);
  };

  const onDmFileSelected: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !auth.currentUser) return;
    const videoOn = creator?.monetization?.videoEnabled !== false;
    if (!videoOn && file.type.startsWith("video/")) {
      showToast?.("This creator doesn’t accept video attachments in DMs.", "info");
      return;
    }
    setDmPendingAttachmentUploading(true);
    try {
      const { url, attachmentType } = await uploadFanDmAttachment(auth.currentUser.uid, file);
      setDmPendingAttachmentUrl(url);
      setDmPendingAttachmentType(attachmentType);
    } catch {
      /* silent */
    } finally {
      setDmPendingAttachmentUploading(false);
    }
  };

  const stopDmRecording = useCallback(() => {
    const rec = dmMediaRecorderRef.current;
    if (!rec || rec.state === "inactive") {
      setDmRecordingVoice(false);
      setDmVoiceMeterStream(null);
      return;
    }
    stopMediaRecorderSafe(rec);
  }, []);

  const startDmVoiceRecording = async () => {
    if (!auth.currentUser || !creator?.creatorId || dmRecordingVoice) return;
    let stream: MediaStream | null = null;
    try {
      try {
        const permissionStatus = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (permissionStatus.state === "denied") return;
      } catch {
        /* permissions.query unsupported */
      }

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setDmVoiceMeterStream(stream);
      setDmVoiceMeterKey((k) => k + 1);
      const rec = createAudioMediaRecorder(stream);
      const requestedMime = rec.mimeType || undefined;
      dmMediaChunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size) dmMediaChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        setDmVoiceMeterStream(null);
        stream?.getTracks().forEach((t) => t.stop());
        setDmRecordingVoice(false);
        dmMediaRecorderRef.current = null;
        const chunks = dmMediaChunksRef.current;
        dmMediaChunksRef.current = [];
        const uid = auth.currentUser?.uid;
        if (!chunks.length || !uid) return;
        const blobType = effectiveBlobType(rec, requestedMime);
        const blob = new Blob(chunks, { type: blobType });
        if (blob.size < 256) return;
        const fileType = normalizeVoiceRecordingFileType(blobType);
        const ext = fileExtensionForAudioMime(fileType);
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: fileType });
        try {
          const { url } = await uploadFanDmAttachment(uid, file);
          setDmPendingAttachmentUrl(url);
          setDmPendingAttachmentType("audio");
        } catch {
          /* silent */
        }
      };
      dmMediaRecorderRef.current = rec;
      rec.start(AUDIO_RECORDER_TIMESLICE_MS);
      setDmRecordingVoice(true);
    } catch {
      setDmVoiceMeterStream(null);
    }
  };

  const toggleDmVoice = () => {
    if (dmRecordingVoice) stopDmRecording();
    else void startDmVoiceRecording();
  };

  /* Neutral theme defaults - creators should customize */
  const defaultBg = "#fafafa";
  const defaultPrimary = "#6366f1";

  // Membership gating values must be computed before any early return to keep hook order stable.
  const creatorRequiresPaidMembership = creator?.monetization?.freeAccessEnabled !== true;
  const hasPaidMembershipBase = subscribed && membershipType === "paid";
  const paidPageUnsubscribedBase = creatorRequiresPaidMembership && membershipType !== "paid";
  const hasAccessByCurrentMembershipBase =
    subscribed && (creator?.monetization?.freeAccessEnabled === true || hasPaidMembershipBase);
  const hasUnlockedPurchases = unlockedProductIds.length > 0 || unlockedFanPostIds.length > 0;
  const deliveredOrPurchasedProductIdSet = useMemo(() => {
    const out = new Set<string>();
    for (const o of fanPurchases) {
      if (typeof o.productId === "string" && o.productId.trim()) out.add(o.productId.trim());
    }
    return out;
  }, [fanPurchases]);
  const legacyUnlockedTreatPurchases = useMemo(
    () =>
      treatsProducts.filter(
        (p) => unlockedProductIds.includes(p.id) && !deliveredOrPurchasedProductIdSet.has(p.id)
      ),
    [deliveredOrPurchasedProductIdSet, treatsProducts, unlockedProductIds]
  );
  const fanPurchasesDisplayRows = useMemo(() => {
    const postIdsFromOrders = new Set<string>();
    for (const o of fanPurchases) {
      if (o.type === "post_unlock" && typeof o.postId === "string" && o.postId.trim()) {
        postIdsFromOrders.add(o.postId.trim());
      }
    }
    const cid = creator?.creatorId?.trim() || "";
    const uid = fanAuthUid?.trim() || "";
    const synthetic: FanDeliveryPurchase[] = unlockedFanPostIds
      .map((id) => id.trim())
      .filter((id) => id && !postIdsFromOrders.has(id))
      .map((postId) => ({
        id: `entitlement-unlock-${postId}`,
        creatorId: cid,
        fanId: uid,
        type: "post_unlock",
        productId: null,
        postId,
        productTitle: "Unlocked on feed",
        amountCents: 0,
        status: "paid",
        createdAt: new Date(0).toISOString(),
      }));
    return [...fanPurchases, ...synthetic];
  }, [fanPurchases, unlockedFanPostIds, creator?.creatorId, fanAuthUid]);
  const needsPaidUpgradeBase =
    isLoggedIn && subscribed && creatorRequiresPaidMembership && !hasPaidMembershipBase;
  const purchaseOnlyAccessBase =
    creatorRequiresPaidMembership &&
    !hasPaidMembershipBase &&
    (limitedMemberAccess || hasUnlockedPurchases);

  /** Staff/QA bypass from getFanEntitlement: always use full member hub (not purchase-only / paywall nav). */
  const hasPaidMembership = fanPageAdminBypass ? true : hasPaidMembershipBase;
  const paidPageUnsubscribed = fanPageAdminBypass ? false : paidPageUnsubscribedBase;
  const needsPaidUpgrade = fanPageAdminBypass ? false : needsPaidUpgradeBase;
  const purchaseOnlyAccess = fanPageAdminBypass ? false : purchaseOnlyAccessBase;
  const hasAccessByCurrentMembership = fanPageAdminBypass
    ? true
    : hasAccessByCurrentMembershipBase || purchaseOnlyAccess;
  const forceCreatorPreviewLanding = forcePublicLanding && isViewingOwnStorefront;
  const hasMemberAreaAccess = hasAccessByCurrentMembership || purchaseOnlyAccess;
  const canViewFeed = fanPageAdminBypass || !creatorRequiresPaidMembership || hasPaidMembership;
  const requiresPaidToAccess = creator?.monetization?.freeAccessEnabled !== true;
  const showLanding = previewMember
    ? false
    : forceCreatorPreviewLanding || !isLoggedIn || (!requiresPaidToAccess && !hasMemberAreaAccess);
  const holdForAuthResolution = !authResolved && !previewMember && !forceCreatorPreviewLanding;
  const holdForEntitlementBootstrap =
    !previewMember &&
    !forceCreatorPreviewLanding &&
    isLoggedIn &&
    creatorRequiresPaidMembership &&
    !entitlementBootstrapResolved;

  /**
   * Member hub must not follow EchoFlux `html.dark` (UIContext). That class turns on `.dark .stormij-theme`
   * overrides and Tailwind `dark:` utilities and produces a half-light/half-dark mix.
   * UIProvider applies `dark` in a passive effect that runs after child effects, so we strip again via
   * `setTimeout(0)` (and when `isDarkMode` changes) while `showLanding` is false.
   */
  const memberHtmlDarkSnapshotRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;

    if (showLanding) {
      if (memberHtmlDarkSnapshotRef.current !== null) {
        if (memberHtmlDarkSnapshotRef.current) root.classList.add("dark");
        else root.classList.remove("dark");
        memberHtmlDarkSnapshotRef.current = null;
      }
      return undefined;
    }

    if (memberHtmlDarkSnapshotRef.current === null) {
      memberHtmlDarkSnapshotRef.current = root.classList.contains("dark");
    }

    return () => {
      if (memberHtmlDarkSnapshotRef.current !== null) {
        if (memberHtmlDarkSnapshotRef.current) root.classList.add("dark");
        else root.classList.remove("dark");
        memberHtmlDarkSnapshotRef.current = null;
      }
    };
  }, [showLanding]);

  useEffect(() => {
    if (typeof document === "undefined" || showLanding) return undefined;
    const root = document.documentElement;
    const strip = () => {
      root.classList.remove("dark");
    };
    strip();
    const t = window.setTimeout(strip, 0);
    return () => {
      window.clearTimeout(t);
    };
  }, [showLanding, isDarkMode]);

  useEffect(() => {
    if (showLanding || previewMember || isViewingOwnStorefront || fanPageAdminBypass) return;
    // Until getFanEntitlement finishes, subscribed/membership defaults make canViewFeed false for
    // paid-only creators — do not redirect away from Home/feed or we stick on Purchases after refresh.
    if (!entitlementBootstrapResolved) return;
    if (!canViewFeed && activeTab === "feed") {
      setActiveTab("purchases");
      if (creator?.handle?.trim()) {
        applyFanStorefrontMemberUrl("purchases", { showLanding: false, creatorHandle: creator.handle });
      }
    }
  }, [
    showLanding,
    previewMember,
    isViewingOwnStorefront,
    fanPageAdminBypass,
    entitlementBootstrapResolved,
    canViewFeed,
    activeTab,
    creator?.handle,
  ]);

  useEffect(() => {
    if (!needsPaidUpgrade || previewMember || isViewingOwnStorefront || fanPageAdminBypass) return;
    // Wait for entitlement hydration before any auto-checkout decision.
    if (entitlementLoading || entitlementHydratingRef.current) return;
    // Never auto-redirect while processing a returned Checkout session.
    if (typeof window !== "undefined") {
      const pending = new URLSearchParams(window.location.search);
      if (pending.get("session_id")) return;
      if (pending.get("purchase_sync") === "1" || pending.get("post_unlock") === "1" || pending.get("tip") === "success") {
        return;
      }
    }
    if ((purchaseOnlyAccess || paidPageUnsubscribed) && !["tip", "purchases", "profile"].includes(activeTab)) {
      setActiveTab("purchases");
      if (creator?.handle?.trim()) {
        applyFanStorefrontMemberUrl("purchases", { showLanding: false, creatorHandle: creator.handle });
      }
    }
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("paywall") === "1") return;
    }
    if (autoSubscribeRedirectingRef.current) return;
    void startSubscriptionCheckout({ auto: true });
  }, [
    needsPaidUpgrade,
    entitlementLoading,
    previewMember,
    isViewingOwnStorefront,
    fanPageAdminBypass,
    purchaseOnlyAccess,
    paidPageUnsubscribed,
    activeTab,
    creator?.handle,
  ]);
  useEffect(() => {
    if (typeof window === "undefined" || showLanding) return;
    const parsed = parseHandleFromPath();
    const isCustomHost = isConfiguredCustomStorefrontHost(window.location.hostname);
    const fromPath = parsed.memberNavSlug ? memberPathSlugToTab(parsed.memberNavSlug) : null;
    const params = new URLSearchParams(window.location.search);
    const qTab = (params.get("tab") || "").trim().toLowerCase();
    // On custom domains, rely on path-based tabs only to avoid stale/global ?tab collisions.
    const fromQuery = !isCustomHost && qTab ? memberPathSlugToTab(qTab) : null;
    const mapped = fromPath || fromQuery;
    if (mapped && mapped !== activeTab) setActiveTab(mapped);

    if ((parsed.memberNavSlug && params.has("tab")) || (isCustomHost && params.has("tab"))) {
      params.delete("tab");
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash
      );
    } else if (!isCustomHost && creator?.handle?.trim() && qTab && memberPathSlugToTab(qTab) && !parsed.memberNavSlug) {
      applyFanStorefrontMemberUrl(memberPathSlugToTab(qTab)!, {
        showLanding: false,
        creatorHandle: creator.handle.trim(),
      });
    }
  }, [showLanding, pathname, creator?.handle, activeTab]);

  /** Must run before any early return (loading / error) so hook order is stable. */
  const profileDisplayName = useMemo(() => {
    const fromForm = [profileDraft.firstName, profileDraft.lastName].filter(Boolean).join(" ").trim();
    if (fromForm) return fromForm;
    return auth.currentUser?.displayName?.trim() || "Member";
  }, [profileDraft.firstName, profileDraft.lastName, auth.currentUser?.displayName]);

  /** Initials for member profile avatar when no photo (uses draft names, then Auth display name / email). */
  const memberProfileAvatarInitials = useMemo(() => {
    const f = profileDraft.firstName.trim();
    const l = profileDraft.lastName.trim();
    if (f && l) return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase();
    if (f) return f.charAt(0).toUpperCase();
    if (l) return l.charAt(0).toUpperCase();
    const dn = auth.currentUser?.displayName?.trim();
    if (dn) {
      const parts = dn.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
      }
      return dn.charAt(0).toUpperCase();
    }
    const em = auth.currentUser?.email?.trim();
    return (em?.charAt(0) || "U").toUpperCase();
  }, [profileDraft.firstName, profileDraft.lastName, auth.currentUser?.displayName, auth.currentUser?.email]);

  const memberProfilePhotoSrc = (profileDraft.photoURL || "").trim();
  const showMemberProfilePhotoImg = Boolean(memberProfilePhotoSrc) && !memberProfilePhotoLoadFailed;

  const profileMemberAtHandle = useMemo(() => {
    const u = normalizeMemberUsername(usernameInitial || usernameDraft || "");
    return u ? `@${u}` : "";
  }, [usernameInitial, usernameDraft]);

  const handleFanHubNotificationNavigate = useCallback(
    (p: FanHubNotificationNavigatePayload) => {
      const cid = creator?.creatorId;
      if (!cid) return;
      const d = p.data;
      if (d.creatorId && d.creatorId !== cid) return;

      const goTab = (tab: typeof activeTab) => {
        setActiveTab(tab);
        if (typeof window === "undefined" || showLanding || !creator?.handle?.trim()) return;
        applyFanStorefrontMemberUrl(tab as FanStorefrontMemberTab, {
          showLanding,
          creatorHandle: creator.handle,
        });
      };

      if (p.type === "new_message") {
        if (d.threadId?.trim()) setDmPreferredThreadId(d.threadId.trim());
        if (d.sessionId?.trim()) setDmPreferredSessionId(d.sessionId.trim());
        goTab("messages");
        return;
      }
      if (
        p.type === "video_chat_accepted" ||
        p.type === "video_chat_starting" ||
        p.type === "video_chat_reminder"
      ) {
        const sid = d.sessionId?.trim();
        if (sid) void joinFanVideoSession(sid, cid);
        else goTab("messages");
        return;
      }
      if (p.type === "purchase_confirmed" || p.type === "content_unlocked") {
        goTab("purchases");
        return;
      }
      if (p.type === "session_starting" || p.type === "session_reminder") {
        if (d.threadId?.trim()) {
          const threadId = d.threadId.trim();
          setDmPreferredThreadId(threadId);
          void fetchDmThreadAndMessages({ threadId });
        }
        if (d.sessionId?.trim()) setDmPreferredSessionId(d.sessionId.trim());
        goTab("messages");
        return;
      }
      if (d.threadId?.trim()) {
        const threadId = d.threadId.trim();
        setDmPreferredThreadId(threadId);
        void fetchDmThreadAndMessages({ threadId });
        if (d.sessionId?.trim()) setDmPreferredSessionId(d.sessionId.trim());
        goTab("messages");
      }
    },
    [creator?.creatorId, creator?.handle, joinFanVideoSession, showLanding, fetchDmThreadAndMessages]
  );

  if (loading) {
    const loadingPrimary = creator?.theme?.primary || defaultPrimary;
    return (
      <>
        <div className="stormij-theme stormij-theme--light storefront-landing-wrap min-h-screen flex items-center justify-center">
          <div className="text-center" style={{ color: "var(--text-muted)" }}>
            <div
              className="animate-spin rounded-full h-10 w-10 border-2 border-t-transparent mx-auto mb-3"
              style={{ borderColor: loadingPrimary, borderTopColor: "transparent" }}
            />
            <p>Loading...</p>
          </div>
        </div>
        {toast && <Toast message={toast.message} type={toast.type} />}
      </>
    );
  }

  if (activeVideoSession) {
    return (
      <VideoCallRoom
        sessionId={activeVideoSession.sessionId}
        creatorId={activeVideoSession.creatorId}
        onLeave={() => setActiveVideoSession(null)}
        onSessionEnd={() => setActiveVideoSession(null)}
      />
    );
  }

  if (error || !creator) {
    return (
      <>
        <div className="stormij-theme stormij-theme--light storefront-landing-wrap min-h-screen flex items-center justify-center">
          <div className="text-center max-w-md px-4" style={{ color: "var(--text)" }}>
            <h1 className="text-xl font-semibold mb-2">Not found</h1>
            <p style={{ color: "var(--text-muted)" }}>{error || "This creator page doesn't exist."}</p>
          </div>
        </div>
        {toast && <Toast message={toast.message} type={toast.type} />}
      </>
    );
  }

  const { theme, displayName, avatar, logo, bio, sections, sectionsOrder, rules, landingContent, monetization } = creator;
  const creatorAvatarRaw =
    (typeof avatar === "string" && avatar.trim() ? avatar.trim() : "") ||
    (typeof creator.avatarUrl === "string" && creator.avatarUrl.trim() ? creator.avatarUrl.trim() : "");
  const creatorAvatar = creatorAvatarRaw
    ? normalizeFirebaseStorageObjectPath(creatorAvatarRaw) || creatorAvatarRaw
    : "";
  const memberAvatar = auth.currentUser?.photoURL || creatorAvatar || "";
  const memberAvatarInitial = (auth.currentUser?.displayName || auth.currentUser?.email || "U").trim().charAt(0).toUpperCase();
  const chatEnabled = monetization?.chatEnabled !== false;
  const videoEnabled = monetization?.videoEnabled !== false;
  const storeCopy = resolveStoreCopy(landingContent);
  const memberStoreSubtitleText = (() => {
    const raw = (storeCopy.memberStoreSubtitle || "").trim();
    if (!raw) return "";
    if (/^demo member store subtitle text\.?$/i.test(raw)) {
      return "Personal messages, voice notes, and more - just for you.";
    }
    return raw;
  })();
  const guidelinesSectionTitle =
    (landingContent?.boundaryTitle && landingContent.boundaryTitle.trim()) || "Community Guidelines";
  const rulesBoundariesRaw = rules?.boundariesText;
  const guidelinesFromRulesOnly =
    typeof rulesBoundariesRaw === "string" && rulesBoundariesRaw.trim() !== "";
  const memberGuidelinesIntro = guidelinesFromRulesOnly
    ? rulesBoundariesRaw.trim()
    : (landingContent?.boundaryText || "").trim();
  const memberGuidelinesLines = guidelinesFromRulesOnly
    ? []
    : (landingContent?.boundaryLines ?? []).filter((l) => String(l).trim());
  const showMemberGuidelines = !!(memberGuidelinesIntro || memberGuidelinesLines.length > 0);
  const tipMemberCopy = resolveTipSectionCopy(landingContent, "member");
  const avatarCropStyle: React.CSSProperties = getAvatarCropStyle(creator.avatarObjectPosition);
  const creatorDmPrimary = formatCreatorDmBubblePrimaryLine(displayName, creator.handle);
  const creatorDmSecondary = formatCreatorDmBubbleSecondaryLine(displayName, creator.handle);

  // Member view background - uses creator theme or neutral default
  const bg = theme?.background || defaultBg;
  const primary = theme?.primary || defaultPrimary;
  const profileFieldLabelColor =
    "color-mix(in srgb, var(--fan-primary, #6366f1) 72%, var(--fan-text, #1f2937) 28%)";
  const memberSinceLabel = (() => {
    const raw = auth.currentUser?.metadata?.creationTime;
    if (!raw) return "Unknown";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  })();
  const membershipSummary = fanPageAdminBypass
    ? "Staff access"
    : subscribed
      ? membershipType === "paid"
        ? `Paid${typeof billedSubscriptionPriceCents === "number"
            ? ` • $${(billedSubscriptionPriceCents / 100).toFixed(2)}/mo`
            : typeof creator.monetization?.monthlyPrice === "number"
              ? ` • $${(creator.monetization.monthlyPrice / 100).toFixed(2)}/mo`
              : ""}`
        : "Free"
      : "Not active";
  const memberHubWelcomeLine = (() => {
    const community =
      (creator.landingContent?.perksTitle || "").trim() ||
      (creator.fanAuthBranding?.communityName || "").trim();
    if (community) return `Welcome to ${community}`;
    const name = typeof displayName === "string" && displayName.trim() ? displayName.trim() : "";
    if (name) return `Welcome to ${name}'s member hub`;
    const h = (creator.handle || "").trim();
    if (h) return `Welcome to @${h}'s member hub`;
    return "Welcome to this member hub";
  })();
  const fanBioPreviewText =
    profileDraft.bio?.trim() && !isEchoFluxDefaultFanBio(profileDraft.bio) ? profileDraft.bio.trim() : "";
  // Nav tabs: order from sectionsOrder, filtered by sections; hide Messages when chat disabled.
  const baseMemberTabKeys = (sectionsOrder || ["feed", "treats", "tip", "messages", "about"])
    .filter((key) => key !== "saved" && (sections as Record<string, boolean>)?.[key] !== false)
    .filter((key) => key !== "messages" || chatEnabled)
    .filter((key) => !purchaseOnlyAccess || key === "treats" || key === "tip");
  const memberTabKeys = (() => {
    const keys = [...baseMemberTabKeys];
    if (!keys.includes("purchases")) {
      const treatsIdx = keys.indexOf("treats");
      const insertAt = treatsIdx >= 0 ? treatsIdx + 1 : keys.length;
      keys.splice(insertAt, 0, "purchases");
    }
    if (purchaseOnlyAccess || paidPageUnsubscribed) {
      const out: string[] = [];
      if (keys.includes("purchases")) out.push("purchases");
      if (keys.includes("tip")) out.push("tip");
      out.push("profile");
      return out;
    }
    return keys;
  })();
  const navLabels: Record<string, string> = {
    feed: "Home",
    treats: "Store",
    purchases: "Purchases",
    tip: "Tip",
    messages: "Messages",
    profile: "Profile",
    about: "About",
    saved: "Saved",
  };
  const setActiveTabWithUrl = (nextTab: typeof activeTab) => {
    setActiveTab(nextTab);
    if (typeof window === "undefined" || showLanding || !creator.handle?.trim()) return;
    applyFanStorefrontMemberUrl(nextTab as FanStorefrontMemberTab, {
      showLanding,
      creatorHandle: creator.handle,
    });
  };

  const nextSessionAlert = sessionAlerts[0] ?? null;
  const nextSessionTimeLabel =
    nextSessionAlert?.startsAt &&
    Number.isFinite(new Date(nextSessionAlert.startsAt).getTime())
      ? new Date(nextSessionAlert.startsAt).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })
      : null;

  // Creator-facing live preview should present guest auth CTAs (Sign up / Log in),
  // not the creator's existing session state.
  // Do not force guest CTAs for normal fan sessions just because `?landing=1` is present.
  const showGuestAuthCtasOnLanding = isViewingOwnStorefront && forcePublicLanding;

  // Render legal pages (Terms/Privacy) if subpage is set
  if (legalSubpage) {
    const legalText = legalSubpage === "terms" 
      ? (creator.legal?.termsText || DEFAULT_TERMS_OF_SERVICE)
      : (creator.legal?.privacyText || DEFAULT_PRIVACY_POLICY);
    const legalTitle = legalSubpage === "terms" ? "Terms of Service" : "Privacy Policy";
    const lastUpdated = legalSubpage === "terms" 
      ? creator.legal?.termsLastUpdated 
      : creator.legal?.privacyLastUpdated;

    return (
      <>
      <div 
        className="min-h-screen py-8 px-4"
        style={{ backgroundColor: bg }}
      >
        <div className="max-w-3xl mx-auto">
          {/* Back link */}
          <a 
            href={`/${creator.handle}`}
            className="inline-flex items-center gap-2 text-sm mb-6 hover:opacity-80 transition"
            style={{ color: primary }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to {displayName}
          </a>

          {/* Legal content card */}
          <div 
            className="rounded-2xl p-6 md:p-8"
            style={{ 
              backgroundColor: "white",
              boxShadow: "0 4px 24px rgba(0,0,0,0.06)"
            }}
          >
            {/* Header */}
            <div className="mb-6 pb-6 border-b" style={{ borderColor: `${primary}22` }}>
              <div className="flex items-center gap-3 mb-3">
                {creatorAvatar && (
                  <img src={creatorAvatar} alt="" className="w-10 h-10 rounded-full object-cover" style={avatarCropStyle} />
                )}
                <span className="text-sm font-medium" style={{ color: "#666" }}>{displayName}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold" style={{ color: "#1a1a1a" }}>
                {legalTitle}
              </h1>
              {lastUpdated && (
                <p className="text-sm mt-2" style={{ color: "#888" }}>
                  Last updated: {lastUpdated}
                </p>
              )}
            </div>

            {/* Legal text content */}
            <div 
              className="prose prose-lg max-w-none"
              style={{ color: "#333" }}
            >
              {legalText.split('\n\n').map((paragraph, i) => {
                // Check if this is a heading (all caps or starts with a heading marker)
                const isHeading = /^[A-Z][A-Z\s—–-]+$/.test(paragraph.trim()) || 
                                  paragraph.trim().match(/^#{1,3}\s/);
                
                if (isHeading) {
                  const headingText = paragraph.replace(/^#{1,3}\s/, '').trim();
                  return (
                    <h2 
                      key={i} 
                      className="text-lg font-bold mt-8 mb-4"
                      style={{ color: "#1a1a1a" }}
                    >
                      {headingText}
                    </h2>
                  );
                }
                
                return (
                  <p key={i} className="mb-4 leading-relaxed" style={{ lineHeight: "1.75" }}>
                    {paragraph}
                  </p>
                );
              })}
            </div>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t text-center" style={{ borderColor: `${primary}22` }}>
              <a 
                href={`/${creator.handle}`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-medium transition hover:opacity-90"
                style={{ backgroundColor: primary, color: "white" }}
              >
                Return to {displayName}'s page
              </a>
            </div>
          </div>
        </div>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} />}
      </>
    );
  }

  const storefrontTermsPath =
    typeof window !== "undefined" && isConfiguredCustomStorefrontHost(window.location.hostname)
      ? "/terms"
      : `/${creator.handle}/terms`;
  const storefrontPrivacyPath =
    typeof window !== "undefined" && isConfiguredCustomStorefrontHost(window.location.hostname)
      ? "/privacy"
      : `/${creator.handle}/privacy`;
  const storefrontHomePath =
    typeof window !== "undefined" && isConfiguredCustomStorefrontHost(window.location.hostname)
      ? "/"
      : `/${creator.handle}/${FAN_STOREFRONT_PUBLIC_LANDING_SLUG}`;

  if (holdForAuthResolution || holdForEntitlementBootstrap) {
    return (
      <>
        <div className="stormij-theme stormij-theme--light storefront-landing-wrap min-h-screen flex items-center justify-center">
          <div className="text-center" style={{ color: "var(--text-muted)" }}>
            <div
              className="animate-spin rounded-full h-10 w-10 border-2 border-t-transparent mx-auto mb-3"
              style={{ borderColor: primary, borderTopColor: "transparent" }}
            />
            <p>Loading...</p>
          </div>
        </div>
        {toast && <Toast message={toast.message} type={toast.type} />}
      </>
    );
  }

  if (showLanding) {
    return (
      <>
        <FanLandingPage
          creator={creator}
          onSubscribe={handleSubscribe}
          onJoinFree={handleJoinFree}
          onOpenFanAuth={(view) => {
            setFanAuthView(view);
            setFanAuthOpen(true);
          }}
          subscribing={subscribing}
          joiningFree={joiningFree}
          isLoggedIn={showGuestAuthCtasOnLanding ? false : isLoggedIn}
          onLogout={showGuestAuthCtasOnLanding ? undefined : handleLogout}
          publicTreatsOnLanding={creator.publicTreatsOnLanding === true}
          sectionsTreatsEnabled={creator.sections?.treats !== false}
          landingTreatProducts={landingTreatsProducts}
          landingTreatsLoading={landingTreatsLoading}
          landingGuestTreatCommerceEnabled={landingGuestTreatCommerceEnabled}
          onGuestPurchaseTreat={undefined}
          guestTreatPurchasingId={guestTreatPurchasingId}
          treatLinkAccountMessage={treatLinkMessage}
          termsHref={storefrontTermsPath}
          privacyHref={storefrontPrivacyPath}
          homeHref={storefrontHomePath}
        />
        {fanAuthOpen && (
          <FanAuthModal
            isOpen={fanAuthOpen}
            onClose={() => setFanAuthOpen(false)}
            onSuccess={() => {
              setIsLoggedIn(true);
              setFanAuthOpen(false);
              // Free pages: auth can immediately join and enter member hub.
              if (creator.monetization?.freeAccessEnabled === true) {
                const nextTab: FanStorefrontMemberTab = "feed";
                setActiveTab(nextTab);
                setSubscribed(true);
                setMembershipType("free");
                if (typeof window !== "undefined" && creator.handle?.trim()) {
                  applyFanStorefrontMemberUrl(nextTab, {
                    showLanding: false,
                    creatorHandle: creator.handle,
                    stripSearchKeys: ["landing", "login", "signup"],
                  });
                }
                return;
              }
              // Paid pages: let entitlement hydrate first; auto-checkout effect decides safely.
            }}
            initialView={fanAuthView}
            creatorId={creator.creatorId}
            displayName={displayName}
            logo={creator.logo || creator.logoUrl}
            avatar={creator.avatar}
            themePrimary={creator.theme?.primary}
            themeText={creator.theme?.text}
            fontFamily={creator.theme?.fontFamily}
            branding={creator.fanAuthBranding ?? null}
            termsHref={storefrontTermsPath}
            privacyHref={storefrontPrivacyPath}
            freeAccessEnabled={creator.monetization?.freeAccessEnabled === true}
          />
        )}
        {toast && <Toast message={toast.message} type={toast.type} />}
      </>
    );
  }

  const globalFont = theme?.fontFamily || "Inter, sans-serif";

  return (
    <div
      className="min-h-screen stormij-theme stormij-theme--light"
      style={{ 
        fontFamily: globalFont,
        backgroundColor: bg,
        width: "100%",
        maxWidth: "100%",
        overflowX: "hidden",
        minHeight: "100dvh",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        "--fan-primary": primary,
        "--fan-accent": primary,
        "--fan-accent-soft": `color-mix(in srgb, ${primary} 14%, transparent)`,
        "--fan-accent-hover": theme?.accentHover ?? primary,
        "--fan-bg": bg,
        "--fan-text": theme?.text || "#1f2937",
        "--fan-border": theme?.border || "#e5e7eb",
      } as React.CSSProperties}
    >
      <ReportProblemModal
        isOpen={reportProblemOpen}
        onClose={() => setReportProblemOpen(false)}
        contactEmail="contact@insightmediagroupllc.com"
        supportName="Insight Media Group LLC"
        mode="inApp"
        onSubmitInApp={submitSupportProblem}
        onSubmitted={() => {
          setActiveTab("profile");
          if (creator.handle?.trim()) {
            applyFanStorefrontMemberUrl("profile", { showLanding: false, creatorHandle: creator.handle });
          }
        }}
      />
      {memberUsernameRequired && creator && !previewMember && isLoggedIn && !isViewingOwnStorefront && (
        <MemberUsernameGateModal
          creatorId={creator.creatorId}
          creatorDisplayName={displayName}
          primaryColor={primary}
          textColor={theme?.text}
          onComplete={() => {
            setMemberUsernameRequired(false);
            void refetchMemberEntitlement();
          }}
        />
      )}
      {fanDeleteModalOpen && creator ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="fan-delete-account-title"
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 shadow-xl"
            style={{ backgroundColor: "#fff", color: theme?.text || "#1f2937" }}
          >
            <h2 id="fan-delete-account-title" className="text-lg font-bold mb-2">
              Delete your account?
            </h2>
            <p className="text-sm mb-3 opacity-90">
              You will lose this login everywhere on this platform (member access, purchases, messages). Type{" "}
              <strong>DELETE</strong> to confirm.
            </p>
            <label className="block text-xs font-medium mb-1" htmlFor="fan-delete-confirm">
              Confirmation
            </label>
            <input
              id="fan-delete-confirm"
              className="w-full px-3 py-2 rounded-lg border text-sm mb-3"
              style={{
                borderColor: "color-mix(in srgb, #b91c1c 35%, transparent)",
                backgroundColor: "white",
                color: "var(--fan-text, #1f2937)",
              }}
              value={fanDeleteConfirmInput}
              onChange={(e) => setFanDeleteConfirmInput(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
            {auth.currentUser?.providerData[0]?.providerId === "password" ? (
              <>
                <label className="block text-xs font-medium mb-1" htmlFor="fan-delete-password">
                  Current password
                </label>
                <input
                  id="fan-delete-password"
                  type="password"
                  className="w-full px-3 py-2 rounded-lg border text-sm mb-3"
                  style={{
                    borderColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 18%, transparent)",
                    backgroundColor: "white",
                    color: "var(--fan-text, #1f2937)",
                  }}
                  value={fanDeletePassword}
                  onChange={(e) => setFanDeletePassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                />
              </>
            ) : auth.currentUser?.providerData[0]?.providerId === "google.com" ? (
              <p className="text-xs opacity-80 mb-3">You will be asked to sign in with Google to confirm.</p>
            ) : (
              <p className="text-xs text-amber-800 mb-3">
                This account uses a sign-in method we can’t verify here. Contact support to delete it.
              </p>
            )}
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-medium border"
                style={{ borderColor: `${primary}66`, color: primary }}
                disabled={fanDeleteAccountLoading}
                onClick={closeFanDeleteModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#b91c1c" }}
                disabled={
                  fanDeleteAccountLoading ||
                  fanDeleteConfirmInput.trim().toUpperCase() !== "DELETE" ||
                  (auth.currentUser?.providerData[0]?.providerId !== "password" &&
                    auth.currentUser?.providerData[0]?.providerId !== "google.com")
                }
                onClick={() => {
                  void handleFanDeleteAccount();
                }}
              >
                {fanDeleteAccountLoading ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {/* Member Header — witme wordmark only (no creator avatar / community subtitle) */}
      <header
        className="storefront-member-header storefront-member-header--leftnav"
        data-witme-member-header="wordmark-only"
        style={{ backgroundColor: `${primary}14` }}
      >
        <div className="storefront-member-header-row flex items-center justify-between px-4 sm:px-6 py-3 gap-2 min-w-0 max-w-[1360px] mx-auto w-full">
          <div className="storefront-header-left storefront-header-left--witme-wordmark flex items-center min-h-0 min-w-0">
            <WitmeHeaderLogo color={primary} className="h-10 w-auto max-w-[220px] shrink-0 sm:h-11" />
          </div>
          <nav className="storefront-header-nav">
            {memberTabKeys.map((key) => {
              const isTip = key === "tip";
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTabWithUrl(key as typeof activeTab)}
                  className={`storefront-nav-btn ${isTip ? "storefront-nav-tip" : ""} ${activeTab === key ? "active" : ""}`}
                  title={key === "saved" ? "Saved posts" : undefined}
                >
                  {key === "feed" && (
                    <svg className="storefront-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                  )}
                  {key === "treats" && (
                    <svg className="storefront-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 12 20 22 4 22 4 12" />
                      <rect x="2" y="7" width="20" height="5" />
                      <line x1="12" y1="22" x2="12" y2="7" />
                      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                    </svg>
                  )}
                  {key === "purchases" && (
                    <svg className="storefront-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <line x1="7" y1="9" x2="17" y2="9" />
                      <line x1="7" y1="13" x2="14" y2="13" />
                    </svg>
                  )}
                  {key === "tip" && (
                    <svg className="storefront-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  )}
                  {key === "messages" && (
                    <svg className="storefront-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  )}
                  {key === "profile" && (
                    <svg className="storefront-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  )}
                  {key === "saved" && (
                    <svg className="storefront-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  )}
                  {key === "about" && (
                    <svg className="storefront-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4M12 8h.01" />
                    </svg>
                  )}
                  <span className="inline-flex items-center gap-1">
                    {navLabels[key] || key}
                    {key === "messages" && memberMessagesTabBadgeCount > 0 ? (
                      <span
                        className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none inline-flex items-center justify-center text-white"
                        style={{ backgroundColor: primary }}
                        aria-label={`${memberMessagesTabBadgeCount} unread messages`}
                      >
                        {memberMessagesTabBadgeCount > 9 ? "9+" : memberMessagesTabBadgeCount}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="storefront-header-actions">
            {isLoggedIn && (
              <FanHubNotificationBell
                accentColor={primary}
                iconColor={theme?.text || "#6f4858"}
                className="storefront-header-notify-bell"
                onNavigate={handleFanHubNotificationNavigate}
                hidden={memberSuppressDmNotifications}
              />
            )}
            {isLoggedIn && nextSessionAlert ? (
              <button
                type="button"
                onClick={() => {
                  void handleSessionAlertAction(nextSessionAlert);
                }}
                className="storefront-nav-btn active"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.45rem 0.75rem",
                  borderRadius: "999px",
                  borderColor: `${primary}55`,
                  backgroundColor: `${primary}12`,
                  color: "var(--fan-text, #1f2937)",
                }}
                title={nextSessionAlert.title}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "999px",
                    backgroundColor: primary,
                    display: "inline-block",
                  }}
                />
                <span style={{ fontWeight: 600, fontSize: "0.78rem" }}>
                  {nextSessionAlert.kind === "video" ? "Video session" : "Chat session"}
                </span>
                {nextSessionTimeLabel ? (
                  <span style={{ fontSize: "0.72rem", opacity: 0.85 }}>
                    {nextSessionTimeLabel}
                  </span>
                ) : null}
                {sessionAlerts.length > 1 ? (
                  <span
                    className="min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-bold leading-none inline-flex items-center justify-center text-white"
                    style={{ backgroundColor: primary }}
                    aria-label={`${sessionAlerts.length} upcoming sessions`}
                  >
                    {sessionAlerts.length}
                  </span>
                ) : null}
              </button>
            ) : null}
            <div className="storefront-profile-menu-wrap" ref={profileMenuRef}>
              <button
                type="button"
                className="storefront-profile-menu-trigger"
                onClick={() => setProfileMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
                title="Profile menu"
              >
                {memberAvatar ? (
                  <img src={memberAvatar} alt="" className="storefront-profile-menu-avatar" style={avatarCropStyle} />
                ) : (
                  <span className="storefront-profile-menu-avatar storefront-profile-menu-avatar-fallback">{memberAvatarInitial}</span>
                )}
              </button>
              {profileMenuOpen && (
                <div className="storefront-profile-menu-dropdown" role="menu">
                  <button type="button" role="menuitem" className="storefront-profile-menu-item" onClick={handleOpenProfile}>
                    Your profile
                  </button>
                  <button type="button" role="menuitem" className="storefront-profile-menu-item" onClick={handleSendProblem}>
                    Report a problem
                  </button>
                  <button type="button" role="menuitem" className="storefront-profile-menu-item" onClick={handleLogout}>
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {cancelMembershipMessage && (
        <div className="storefront-cancel-message" role="alert" style={{ backgroundColor: `${primary}18`, color: theme?.text || "#1f2937" }}>
          {cancelMembershipMessage}
        </div>
      )}

      {!entitlementLoading && (
        <div
          className={`fan-member-content ${
            activeTab === "profile" ? "fan-member-content--settings" : ""
          } ${activeTab === "feed" ? "fan-member-content--feed" : ""}${
            activeTab === "saved" ? " fan-member-content--feed-column" : ""
          }${activeTab === "treats" || activeTab === "purchases" ? " fan-member-content--store" : ""
          }`}
        >
            {activeTab === "feed" && !needsPaidUpgrade && canViewFeed && (
              <FanMemberFeed
                creatorId={creator.creatorId}
                creatorHandle={creator.handle}
                displayName={displayName}
                avatar={creatorAvatar}
                avatarObjectPosition={creator.avatarObjectPosition}
                primary={primary}
                feedSettings={creator.feedSettings}
                fanId={fanAuthUid}
                unlockedFanPostIds={unlockedFanPostIds}
                fanPageAdminBypass={fanPageAdminBypass}
                onOpenSaved={() => setActiveTabWithUrl("saved")}
                tipsEnabled={creator.sections?.tip !== false}
                tipHeading={tipMemberCopy.heading}
                tipSubline={tipMemberCopy.subline}
              />
            )}
            {activeTab === "saved" && (
              <FanMemberSaved
                creatorId={creator.creatorId}
                creatorHandle={creator.handle}
                displayName={displayName}
                avatar={creatorAvatar}
                avatarObjectPosition={creator.avatarObjectPosition}
                primary={primary}
                feedSettings={creator.feedSettings}
                fanId={fanAuthUid}
                unlockedFanPostIds={unlockedFanPostIds}
                fanPageAdminBypass={fanPageAdminBypass}
                onBackToFeed={() => setActiveTabWithUrl("feed")}
              />
            )}
            {activeTab === "treats" && !paidPageUnsubscribed && !purchaseOnlyAccess && (
              <div className="fan-member-treats">
                <div className="fan-member-store-header">
                  <h2 className="fan-member-store-title">
                    {storeCopy.memberStoreTitle || "Treats"}
                  </h2>
                  {memberStoreSubtitleText ? (
                    <p className="fan-member-store-subtitle">
                      {memberStoreSubtitleText}
                    </p>
                  ) : null}
                </div>
                {treatsLoading ? (
                  <p className="fan-member-loading">{storeCopy.memberStoreLoadingMessage}</p>
                ) : treatsProducts.length === 0 ? (
                  <p className="fan-member-empty">{storeCopy.memberStoreEmptyMessage}</p>
                ) : (
                  <div className="fan-member-treats-grid">
                    {treatsProducts.map((p, index) => {
                      const productRowId = p.id;
                      const owned = unlockedProductIds.includes(productRowId);
                      const hasLimit = typeof p.quantityLimit === "number" && p.quantityLimit > 0;
                      const soldCount = Math.max(0, Number(p.soldCount || 0));
                      const remaining = hasLimit ? Math.max(0, p.quantityLimit! - soldCount) : null;
                      const soldOut = hasLimit && remaining === 0;
                      const checkoutBusy = purchasingId != null && purchasingId !== "";
                      const isPurchasingThis =
                        checkoutBusy && purchasingId === productRowId;
                      return (
                        <div
                          key={`member-treat-${productRowId}-${index}`}
                          className="fan-member-treat-card"
                        >
                          <p className="fan-member-treat-type">{p.type.replace(/_/g, " ")}</p>
                          <h3 className="fan-member-treat-title">{p.title}</h3>
                          {p.description && (
                            <p className="fan-member-treat-desc">{p.description}</p>
                          )}
                          <p className="fan-member-treat-price">{formatPrice(p.priceCents)}</p>
                          {hasLimit ? (
                            <p className="fan-member-treat-desc" style={{ marginTop: "-0.2rem" }}>
                              {remaining} left
                            </p>
                          ) : null}
                          <div className="fan-member-treat-action">
                            {owned ? (
                              <span className="fan-member-treat-owned">Purchased</span>
                            ) : soldOut ? (
                              <span className="fan-member-treat-owned">Sold out</span>
                            ) : (
                              <button
                                type="button"
                                disabled={checkoutBusy || soldOut}
                                onClick={() => handlePurchase(productRowId)}
                                className="fan-member-treat-buy"
                                style={{ backgroundColor: primary }}
                              >
                                {isPurchasingThis ? "Processing…" : "Purchase"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {activeTab === "purchases" && (
              <div className="fan-member-treats">
                <div className="fan-member-store-header">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div>
                      <h2 className="fan-member-store-title">Your purchases</h2>
                      <p className="fan-member-store-subtitle">
                        Everything you bought lives here — including feed unlocks. You keep access even if your membership ends.
                      </p>
                    </div>
                    {isLoggedIn &&
                    !fanPurchasesLoading &&
                    (fanPurchasesDisplayRows.length > 0 || legacyUnlockedTreatPurchases.length > 0) ? (
                      <button
                        type="button"
                        className="storefront-nav-btn shrink-0 self-start"
                        style={{ color: primary, borderColor: `${primary}55` }}
                        onClick={() =>
                          setMemberPurchasesListCompactPersisted(!memberPurchasesListCompact)
                        }
                      >
                        {memberPurchasesListCompact ? "Expand cards" : "Minimize list"}
                      </button>
                    ) : null}
                  </div>
                </div>
                {!isLoggedIn ? (
                  <div className="fan-profile-panel">
                    <p className="fan-member-about-text">Log in to view your purchases.</p>
                  </div>
                ) : fanPurchasesLoading ? (
                  <p className="fan-member-loading">Loading your purchases...</p>
                ) : fanPurchasesDisplayRows.length === 0 && legacyUnlockedTreatPurchases.length === 0 ? (
                  <div className="fan-profile-panel">
                    <p className="fan-member-about-text">No purchases yet.</p>
                  </div>
                ) : treatsLoading ? (
                  <p className="fan-member-loading">Loading your purchases...</p>
                ) : memberPurchasesListCompact ? (
                  <div className="fan-member-purchases-compact">
                    {fanPurchasesDisplayRows.map((o) => (
                      <details key={`order-${o.id}`} className="fan-member-purchase-compact">
                        <summary className="fan-member-purchase-compact-summary">
                          <span className="fan-member-purchase-compact-type">{fanPurchaseTypeLabel(o)}</span>
                          <span className="fan-member-purchase-compact-title">{o.productTitle || "Purchase"}</span>
                          <span className="fan-member-purchase-compact-status">{fanPurchaseRowStatus(o)}</span>
                          {o.amountCents > 0 || o.type === "tip" || o.type === "subscription" ? (
                            <span className="fan-member-purchase-compact-price">{formatPrice(o.amountCents)}</span>
                          ) : (
                            <span className="fan-member-purchase-compact-price fan-member-purchase-compact-price--muted">
                              —
                            </span>
                          )}
                        </summary>
                        <div className="fan-member-purchase-compact-body">
                          <FanMemberPurchaseItemBody
                            o={o}
                            creatorId={creator?.creatorId}
                            primary={primary}
                            onOpenFeed={() => setActiveTabWithUrl("feed")}
                          />
                        </div>
                      </details>
                    ))}
                    {legacyUnlockedTreatPurchases.map((p) => (
                      <details key={p.id} className="fan-member-purchase-compact">
                        <summary className="fan-member-purchase-compact-summary">
                          <span className="fan-member-purchase-compact-type">{p.type.replace(/_/g, " ")}</span>
                          <span className="fan-member-purchase-compact-title">{p.title}</span>
                          <span className="fan-member-purchase-compact-status">Purchased</span>
                          <span className="fan-member-purchase-compact-price">{formatPrice(p.priceCents)}</span>
                        </summary>
                        <div className="fan-member-purchase-compact-body">
                          {p.description ? (
                            <p className="fan-member-about-text" style={{ marginBottom: "0.65rem" }}>
                              {p.description}
                            </p>
                          ) : null}
                          <button
                            type="button"
                            className="fan-member-treat-buy"
                            style={{ backgroundColor: primary }}
                            onClick={() => setActiveTabWithUrl("treats")}
                          >
                            Open in Store
                          </button>
                        </div>
                      </details>
                    ))}
                  </div>
                ) : (
                  <div className="fan-member-treats-grid">
                    {fanPurchasesDisplayRows.map((o) => (
                      <div key={`order-${o.id}`} className="fan-member-treat-card">
                        <p className="fan-member-treat-type">{fanPurchaseTypeLabel(o)}</p>
                        <h3 className="fan-member-treat-title">{o.productTitle || "Purchase"}</h3>
                        {o.amountCents > 0 ? (
                          <p className="fan-member-treat-price">{formatPrice(o.amountCents)}</p>
                        ) : o.type === "tip" || o.type === "subscription" ? (
                          <p className="fan-member-treat-price">{formatPrice(o.amountCents)}</p>
                        ) : null}
                        <FanMemberPurchaseItemBody
                          o={o}
                          creatorId={creator?.creatorId}
                          primary={primary}
                          onOpenFeed={() => setActiveTabWithUrl("feed")}
                        />
                      </div>
                    ))}
                    {legacyUnlockedTreatPurchases.map((p) => (
                      <div key={p.id} className="fan-member-treat-card">
                        <p className="fan-member-treat-type">{p.type.replace(/_/g, " ")}</p>
                        <h3 className="fan-member-treat-title">{p.title}</h3>
                        {p.description ? (
                          <p className="fan-member-treat-desc">{p.description}</p>
                        ) : null}
                        <p className="fan-member-treat-price">{formatPrice(p.priceCents)}</p>
                        <div className="fan-member-treat-action">
                          <span className="fan-member-treat-owned">Purchased</span>
                          <button
                            type="button"
                            className="fan-member-treat-buy"
                            style={{ backgroundColor: primary }}
                            onClick={() => setActiveTabWithUrl("treats")}
                          >
                            Open in Store
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {activeTab === "messages" && !needsPaidUpgrade && (
              <div className="fan-member-messages">
                {!isLoggedIn ? (
                  <p className="fan-member-empty">Log in to message {displayName}.</p>
                ) : dmLoading ? (
                  <p className="fan-member-loading">Loading...</p>
                ) : fanBanned ? (
                  <p className="fan-member-banned">You cannot message this creator.</p>
                ) : (
                  <div
                    className={dmPremiumSessionLive ? "fan-member-premium-session-shell" : undefined}
                    role={dmPremiumSessionLive ? "region" : undefined}
                    aria-label={dmPremiumSessionLive ? "Premium live chat session" : undefined}
                  >
                    {dmPremiumSessionLive && dmLiveSession ? (
                      <div className="fan-member-premium-session-shell__hero">
                        <span className="fan-member-premium-session-shell__badge">Premium live session</span>
                        <h2 className="fan-member-premium-session-shell__title">Session with {displayName}</h2>
                        <p className="fan-member-premium-session-shell__meta">
                          {dmLiveSession.chatType || "Custom"} · {formatRemaining(dmLiveSession.remainingSeconds)} left ·
                          separate from everyday DMs
                        </p>
                      </div>
                    ) : (
                      <p className="fan-member-messages-title">Conversation with {displayName}</p>
                    )}
                    <div
                      ref={dmMessagesListRef}
                      className={`fan-member-messages-list ${dmPremiumSessionLive ? "fh-dm-session-room" : ""}`}
                      onScroll={(e) => {
                        dmAutoStickToBottomRef.current = dmIsNearBottom(e.currentTarget);
                      }}
                    >
                      {dmMessages.length === 0 ? (
                        <p className="fan-member-messages-empty">No messages yet. Say hi below.</p>
                      ) : (
                        dmMessages.map((m, i) => {
                          const fanUid = auth.currentUser?.uid;
                          const isFan = dmThread
                            ? m.senderId === dmThread.fanId
                            : m.senderId === fanUid;
                          const prev = dmMessages[i - 1];
                          const showDayDivider =
                            !prev ||
                            formatDmDayCalendarKey(prev.createdAt) !== formatDmDayCalendarKey(m.createdAt);
                          const dividerLabel = formatDmDateDividerLabel(m.createdAt);
                          const timeStr = formatDmShortTime(m.createdAt);
                          const fanLine = formatDmBubbleAuthorLine(dmLabels?.fan || "You");
                          return (
                            <Fragment key={m.id}>
                              {showDayDivider && dividerLabel ? (
                                <div className="fh-dm-date-divider" role="separator">
                                  <span className="fh-dm-date-divider__line" aria-hidden />
                                  <span className="fh-dm-date-divider__label">{dividerLabel}</span>
                                  <span className="fh-dm-date-divider__line" aria-hidden />
                                </div>
                              ) : null}
                              <div
                                className={`fan-member-message ${isFan ? "fan-member-message-sent" : "fan-member-message-received"}`}
                              >
                                <div
                                  className={`fh-dm-chat-row ${isFan ? "fh-dm-chat-row--out" : "fh-dm-chat-row--in"}`}
                                >
                                  <div
                                    className={`fh-dm-bubble-wrap ${isFan ? "fh-dm-bubble-wrap--out" : "fh-dm-bubble-wrap--in"}`}
                                  >
                                    <div className={`fh-dm-bubble ${isFan ? "fh-dm-bubble--me" : "fh-dm-bubble--them"}`}>
                                      {isFan ? (
                                        <div className="fh-dm-bubble__head fh-dm-bubble__head--primary">{fanLine}</div>
                                      ) : (
                                        <div className="fh-dm-bubble__head-stack">
                                          <div className="fh-dm-bubble__head fh-dm-bubble__head--primary">{creatorDmPrimary}</div>
                                          {creatorDmSecondary ? (
                                            <div className="fh-dm-bubble__head fh-dm-bubble__head--secondary">
                                              {creatorDmSecondary}
                                            </div>
                                          ) : null}
                                        </div>
                                      )}
                                      <div className="fh-dm-bubble__body">
                                        {m.attachmentUrl && m.attachmentType === "image" ? (
                                          <div className="fh-dm-attachment">
                                            <a
                                              href={m.attachmentUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="fh-dm-attachment-link"
                                              aria-label="Open image in new tab"
                                            >
                                              <img src={m.attachmentUrl} alt="" loading="lazy" />
                                            </a>
                                          </div>
                                        ) : null}
                                        {m.attachmentUrl && m.attachmentType === "video" ? (
                                          <div className="fh-dm-attachment">
                                            <a
                                              href={m.attachmentUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="fh-dm-attachment-link"
                                              aria-label="Open video in new tab"
                                            >
                                              <video src={m.attachmentUrl} controls playsInline />
                                            </a>
                                          </div>
                                        ) : null}
                                        {m.attachmentUrl &&
                                        (m.attachmentType === "audio" ||
                                          (inferIsAudioFromUrl(m.attachmentUrl) &&
                                            m.attachmentType !== "image" &&
                                            m.attachmentType !== "video")) ? (
                                          <div className="fh-dm-attachment">
                                            <DmAudioPlayer src={m.attachmentUrl} variant="voiceNote" />
                                          </div>
                                        ) : null}
                                        {m.content?.trim() ? m.content : null}
                                        {!m.content?.trim() && !m.attachmentUrl ? (
                                          <span className="italic opacity-70">(empty message)</span>
                                        ) : null}
                                      </div>
                                      {timeStr ? (
                                        <div className={`fh-dm-bubble__foot ${isFan ? "fh-dm-bubble__foot--me" : ""}`}>
                                          {timeStr}
                                          {isFan ? (
                                            m.read ? (
                                              <span className="fh-dm-bubble__receipt" title="Creator has seen this">
                                                {" "}
                                                — Read
                                              </span>
                                            ) : (
                                              <span
                                                className="fh-dm-bubble__receipt fh-dm-bubble__receipt--unread"
                                                title="Not read yet"
                                              >
                                                {" "}
                                                — Unread
                                              </span>
                                            )
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </Fragment>
                          );
                        })
                      )}
                      <div ref={dmMessagesEndRef} aria-hidden />
                    </div>
                    <div className="fan-member-messages-compose-wrap">
                      {dmRecordingVoice && dmVoiceMeterStream ? (
                        <div className="w-full space-y-1">
                          <RecordingDurationLabel active={dmRecordingVoice} />
                          <AudioLevelMeter key={`dm-fan-voice-${dmVoiceMeterKey}`} stream={dmVoiceMeterStream} barColor={primary} />
                        </div>
                      ) : null}
                      {dmPendingAttachmentUploading && !dmPendingAttachmentUrl ? (
                        <div className="fh-dm-pending-attach">
                          <p className="fh-dm-pending-attach__uploading">Uploading attachment…</p>
                        </div>
                      ) : null}
                      {dmPendingAttachmentUrl && dmPendingAttachmentType ? (
                        <div className="fh-dm-pending-attach">
                          <div className="fh-dm-pending-attach__inner">
                            {dmPendingAttachmentType === "image" ? (
                              <img src={dmPendingAttachmentUrl} alt="" className="fh-dm-pending-attach__thumb" />
                            ) : dmPendingAttachmentType === "video" ? (
                              <video src={dmPendingAttachmentUrl} className="fh-dm-pending-attach__thumb" muted playsInline />
                            ) : (
                              <div className="fh-dm-pending-attach__voice-label">
                                <span className="fh-dm-pending-attach__voice-icon" aria-hidden>
                                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
                                    <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                                  </svg>
                                </span>
                                Voice note ready — tap Send
                              </div>
                            )}
                            <button
                              type="button"
                              className="fh-dm-pending-attach__remove"
                              aria-label="Remove attachment"
                              onClick={clearDmPendingAttachment}
                            >
                              ×
                            </button>
                          </div>
                          <p className="fh-dm-pending-attach__hint">Add a caption if you like, then Send.</p>
                        </div>
                      ) : null}
                      <div className="fan-member-messages-compose">
                      <input
                        ref={dmFileInputRef}
                        type="file"
                        accept={videoEnabled ? "image/*,video/*" : "image/*"}
                        className="hidden"
                        onChange={onDmFileSelected}
                      />
                      <div className="fh-dm-compose-actions">
                        <button
                          type="button"
                          className="fh-dm-compose-icon"
                          title={videoEnabled ? "Photo or video" : "Photo"}
                          aria-label={videoEnabled ? "Upload photo or video" : "Upload photo"}
                          disabled={dmSending || fanBanned || dmPendingAttachmentUploading}
                          onClick={() => dmFileInputRef.current?.click()}
                        >
                          <DmPhotoIcon />
                        </button>
                        <button
                          type="button"
                          className={`fh-dm-compose-icon ${dmRecordingVoice ? "fh-dm-compose-icon--recording" : ""}`}
                          title={dmRecordingVoice ? "Stop recording" : "Voice message"}
                          aria-label={dmRecordingVoice ? "Stop recording" : "Record voice"}
                          disabled={dmSending || fanBanned || dmPendingAttachmentUploading}
                          onClick={() => toggleDmVoice()}
                        >
                          <DmMicIcon />
                        </button>
                      </div>
                      <textarea
                        ref={dmTextareaRef}
                        rows={1}
                        value={dmInput}
                        onChange={(e) => setDmInput(e.target.value)}
                        onFocus={() => {
                          dmComposerFocusedRef.current = true;
                        }}
                        onBlur={() => {
                          dmComposerFocusedRef.current = false;
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (dmInput.trim() || dmPendingAttachmentUrl) void sendDm();
                          }
                        }}
                        placeholder="Message"
                        className="fan-member-messages-input"
                      />
                      <button
                        type="button"
                        disabled={
                          dmSending ||
                          dmPendingAttachmentUploading ||
                          (!dmInput.trim() && !dmPendingAttachmentUrl)
                        }
                        onClick={sendDm}
                        className="fan-member-messages-send"
                        style={{ backgroundColor: primary }}
                      >
                        {dmSending ? "Sending…" : "Send"}
                      </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {activeTab === "tip" && (
              <TipSection
                creatorId={creator.creatorId}
                displayName={displayName}
                primary={primary}
                tipHeading={tipMemberCopy.heading}
                tipSubline={tipMemberCopy.subline}
                tipSelectedPreset={tipSelectedPreset}
                setTipSelectedPreset={setTipSelectedPreset}
                tipCustomAmount={tipCustomAmount}
                setTipCustomAmount={setTipCustomAmount}
                tipLoading={tipLoading}
                setTipLoading={setTipLoading}
                showToast={showToast}
              />
            )}
            {activeTab === "profile" && (
              <div className="fan-member-about fan-member-about--settings">
                <div className="fan-profile-header">
                  <h2 className="fan-member-about-title m-0">{profileDisplayName}'s Profile</h2>
                  <p className="fan-member-about-text mt-1">View and manage profile information.</p>
                </div>
                <div className="fan-profile-stats-grid">
                  <div className="fan-profile-stat-card">
                    <p className="fan-profile-stat-label">Current Plan</p>
                    <p className="fan-profile-stat-value">{membershipSummary}</p>
                  </div>
                  <div className="fan-profile-stat-card">
                    <p className="fan-profile-stat-label">Member Since</p>
                    <p className="fan-profile-stat-value">{memberSinceLabel}</p>
                  </div>
                  <div className="fan-profile-stat-card">
                    <p className="fan-profile-stat-label">Support Threads</p>
                    <p className="fan-profile-stat-value">{supportThreads.length}</p>
                  </div>
                </div>
                <div className="fan-member-about-section">
                  <div
                    className="fan-profile-panel fan-profile-hero-card"
                    style={{
                      borderColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 24%, transparent)",
                    }}
                  >
                    <h3 className="fan-profile-section-title">Profile Information</h3>
                    <input
                      ref={profileAvatarInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void handleProfileAvatarUpload(f);
                      }}
                    />
                    <div className="flex items-center gap-3">
                      <div className="relative h-20 w-20 shrink-0">
                        <button
                          type="button"
                          className="fan-profile-hero-avatar-btn relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-0 p-0 cursor-pointer bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fan-primary,#6366f1)] focus-visible:ring-offset-2 disabled:opacity-60"
                          disabled={avatarUploading}
                          onClick={() => profileAvatarInputRef.current?.click()}
                          aria-label={
                            showMemberProfilePhotoImg || memberProfilePhotoSrc
                              ? "Change profile photo"
                              : "Upload profile photo"
                          }
                        >
                          {showMemberProfilePhotoImg ? (
                            <img
                              src={memberProfilePhotoSrc}
                              alt=""
                              className="h-full w-full rounded-full object-cover border-2 border-white shadow-sm"
                              style={{ objectFit: "cover", objectPosition: "center" }}
                              onError={() => setMemberProfilePhotoLoadFailed(true)}
                            />
                          ) : (
                            <span
                              className="fan-profile-hero-avatar-initials flex h-full w-full items-center justify-center rounded-full text-xl font-bold text-white shadow-sm"
                              aria-hidden
                            >
                              {memberProfileAvatarInitials}
                            </span>
                          )}
                          <span
                            className="pointer-events-none absolute bottom-0 right-0 z-[1] text-[9px] font-semibold leading-none px-1 py-0.5 rounded-md shadow-sm ring-2 ring-white"
                            style={{ backgroundColor: `${primary}f2`, color: "#fff" }}
                          >
                            {avatarUploading ? "…" : showMemberProfilePhotoImg ? "Edit" : "Add"}
                          </span>
                        </button>
                        {memberProfilePhotoSrc ? (
                          <button
                            type="button"
                            className="absolute -top-0.5 -right-0.5 z-10 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[11px] font-bold leading-none text-white shadow-sm hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 disabled:opacity-50"
                            disabled={avatarUploading}
                            aria-label="Remove profile photo"
                            title="Remove photo"
                            onClick={() => {
                              setMemberProfilePhotoLoadFailed(false);
                              setProfileDraft((p) => ({ ...p, photoURL: "" }));
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                      <div>
                        <p className="fan-profile-name m-0">{profileDisplayName}</p>
                        <p className="fan-member-about-text m-0 text-sm">
                          {auth.currentUser?.email || "No email on account"}
                        </p>
                        {profileMemberAtHandle ? (
                          <p className="fan-member-about-text m-0 opacity-80 text-sm">{profileMemberAtHandle}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs mb-1" style={{ color: profileFieldLabelColor }}>
                        Username
                      </label>
                      <div className="fan-profile-username-row">
                        <span className="fan-profile-username-prefix" style={{ color: profileFieldLabelColor }}>@</span>
                        <input
                          value={usernameDraft}
                          onChange={(e) =>
                            setUsernameDraft(normalizeMemberUsername(e.target.value).replace(/[^a-z0-9_]/g, ""))
                          }
                          className="fan-profile-username-input"
                          name="member_handle"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          placeholder="your_username"
                          maxLength={32}
                        />
                      </div>
                      {usernameMsg ? (
                        <p
                          className={`fan-profile-username-status fan-profile-username-status--${usernameState}`}
                        >
                          {usernameState === "available"
                            ? "Available."
                            : usernameState === "taken"
                              ? "Unavailable - already taken."
                              : usernameState === "current"
                                ? "Your current username."
                                : usernameMsg}
                        </p>
                      ) : null}
                    </div>
                    <p
                      className="fan-profile-member-hub-welcome mt-4 text-sm font-semibold m-0"
                      style={{ color: "var(--fan-text, #111827)" }}
                    >
                      {memberHubWelcomeLine}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="block text-xs mb-1" style={{ color: profileFieldLabelColor }}>First name</label>
                        <input
                          value={profileDraft.firstName}
                          onChange={(e) => setProfileDraft((p) => ({ ...p, firstName: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border text-sm"
                          style={{ borderColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 18%, transparent)", backgroundColor: "white", color: "var(--fan-text, #1f2937)" }}
                          placeholder="First name"
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: profileFieldLabelColor }}>Last name</label>
                        <input
                          value={profileDraft.lastName}
                          onChange={(e) => setProfileDraft((p) => ({ ...p, lastName: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border text-sm"
                          style={{ borderColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 18%, transparent)", backgroundColor: "white", color: "var(--fan-text, #1f2937)" }}
                          placeholder="Last name"
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs mb-1" style={{ color: profileFieldLabelColor }}>
                        Bio (visible to creators)
                      </label>
                      <textarea
                        rows={4}
                        value={profileDraft.bio}
                        onChange={(e) => setProfileDraft((p) => ({ ...p, bio: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border text-sm"
                        style={{ borderColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 18%, transparent)", backgroundColor: "white", color: "var(--fan-text, #1f2937)" }}
                        placeholder="Tell creators a little about you..."
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3 items-center">
                      <button
                        type="button"
                        className="storefront-cancel-membership-btn"
                        style={{
                          color: primary,
                          borderColor: `${primary}66`,
                          backgroundColor: `${primary}0f`,
                        }}
                        disabled={avatarUploading}
                        onClick={() => profileAvatarInputRef.current?.click()}
                      >
                        {avatarUploading ? "Uploading…" : "Upload image"}
                      </button>
                      <button
                        type="button"
                        className="storefront-cancel-membership-btn"
                        style={{
                          color: primary,
                          borderColor: `${primary}66`,
                          backgroundColor: `${primary}0f`,
                        }}
                        onClick={() => setActiveTabWithUrl("messages")}
                      >
                        Messages
                      </button>
                      <button
                        type="button"
                        className="storefront-cancel-membership-btn"
                        style={{
                          color: primary,
                          borderColor: `${primary}66`,
                          backgroundColor: `${primary}0f`,
                        }}
                        disabled={profileSaving || !isProfileDirty}
                        onClick={() => {
                          void handleProfileSave();
                        }}
                      >
                        {profileSaving ? "Saving..." : isProfileDirty ? "Save changes" : "All changes saved"}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="fan-member-about-section">
                  <h3 className="fan-member-about-heading">Membership</h3>
                  <div
                    className="fan-profile-panel"
                    style={{
                      borderColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 24%, transparent)",
                    }}
                  >
                    <p className="fan-member-about-text">
                      {fanPageAdminBypass
                        ? "Staff access: full member hub for support and QA (not a fan subscription)."
                        : subscribed
                          ? membershipType === "paid"
                            ? `Paid membership is active${typeof billedSubscriptionPriceCents === "number"
                                ? ` ($${(billedSubscriptionPriceCents / 100).toFixed(2)}/mo)`
                                : typeof creator.monetization?.monthlyPrice === "number"
                                  ? ` ($${(creator.monetization.monthlyPrice / 100).toFixed(2)}/mo)`
                                : "."}`
                            : creator.monetization?.freeAccessEnabled
                              ? "Free membership is active."
                              : "You joined when this page was free. This page is now paid — subscribe to keep access."
                          : "No active membership."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {!fanPageAdminBypass && !subscribed ? (
                      <button
                        type="button"
                        onClick={creator.monetization?.freeAccessEnabled ? handleJoinFree : handleSubscribe}
                        disabled={joiningFree || subscribing}
                        className="storefront-cancel-membership-btn"
                        style={{
                          color: primary,
                          borderColor: `${primary}66`,
                          backgroundColor: `${primary}0f`,
                        }}
                      >
                        {creator.monetization?.freeAccessEnabled
                          ? joiningFree
                            ? "Joining..."
                            : "Join free membership"
                          : subscribing
                            ? "Opening checkout..."
                            : "Subscribe"}
                      </button>
                    ) : null}
                    {!fanPageAdminBypass &&
                    subscribed &&
                    membershipType !== "paid" &&
                    creator.monetization?.freeAccessEnabled !== true ? (
                      <button
                        type="button"
                        onClick={handleSubscribe}
                        disabled={subscribing}
                        className="storefront-cancel-membership-btn"
                        style={{
                          color: primary,
                          borderColor: `${primary}66`,
                          backgroundColor: `${primary}0f`,
                        }}
                      >
                        {subscribing ? "Opening checkout..." : "Subscribe"}
                      </button>
                    ) : null}
                    {!fanPageAdminBypass && subscribed && membershipType === "paid" ? (
                      <button
                        type="button"
                        onClick={handleCancelMembership}
                        disabled={cancelMembershipLoading}
                        className="storefront-cancel-membership-btn"
                        style={{
                          color: primary,
                          borderColor: `${primary}66`,
                          backgroundColor: `${primary}0f`,
                        }}
                      >
                        {cancelMembershipLoading ? "Updating..." : "Manage subscription"}
                      </button>
                    ) : null}
                  </div>
                  {cancelMembershipMessage ? (
                    <p className="fan-member-about-text mt-2">{cancelMembershipMessage}</p>
                  ) : null}
                </div>
                <div className="fan-member-about-section">
                  <h3 className="fan-member-about-heading">Password</h3>
                  <div className="fan-profile-panel" style={{ borderColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 24%, transparent)" }}>
                    <p className="fan-member-about-text mb-2">
                      Enter your current password and a new password to change it now, or leave current password blank and we will email you a reset link.
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      <input
                        type="password"
                        value={passwordCurrent}
                        onChange={(e) => setPasswordCurrent(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border text-sm"
                        style={{ borderColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 18%, transparent)", backgroundColor: "white", color: "var(--fan-text, #1f2937)" }}
                        placeholder="Current password (optional if using email reset)"
                      />
                      <input
                        type="password"
                        value={passwordNext}
                        onChange={(e) => setPasswordNext(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border text-sm"
                        style={{ borderColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 18%, transparent)", backgroundColor: "white", color: "var(--fan-text, #1f2937)" }}
                        placeholder="New password"
                      />
                      <input
                        type="password"
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border text-sm"
                        style={{ borderColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 18%, transparent)", backgroundColor: "white", color: "var(--fan-text, #1f2937)" }}
                        placeholder="Confirm new password"
                      />
                    </div>
                    <div className="mt-3">
                      <button
                        type="button"
                        className="storefront-cancel-membership-btn"
                        style={{
                          color: primary,
                          borderColor: `${primary}66`,
                          backgroundColor: `${primary}0f`,
                        }}
                        disabled={passwordSaving}
                        onClick={() => {
                          void handleChangePassword();
                        }}
                      >
                        {passwordSaving ? "Updating..." : "Change password"}
                      </button>
                    </div>
                  </div>
                </div>
                {!previewMember && !isViewingOwnStorefront ? (
                  <div className="fan-member-about-section">
                    <h3 className="fan-member-about-heading">Account</h3>
                    <div
                      className="fan-profile-panel"
                      style={{
                        borderColor: "color-mix(in srgb, #b91c1c 28%, transparent)",
                        backgroundColor: "color-mix(in srgb, #b91c1c 06%, white)",
                      }}
                    >
                      <p className="fan-member-about-text m-0 text-sm" style={{ color: "var(--fan-text, #1f2937)" }}>
                        Permanently delete your member account, @username, memberships on creator pages, purchase
                        unlocks, and DMs tied to this login. Active paid subscriptions are ended in Stripe so you are
                        not charged again; this does not refund your current billing period. This cannot be undone.
                      </p>
                      <div className="mt-3">
                        <button
                          type="button"
                          className="px-4 py-2 rounded-lg text-sm font-semibold text-white border-0 disabled:opacity-50"
                          style={{ backgroundColor: "#b91c1c" }}
                          onClick={() => {
                            setFanDeleteConfirmInput("");
                            setFanDeletePassword("");
                            setFanDeleteModalOpen(true);
                          }}
                        >
                          Delete my account
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="fan-member-about-section">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="fan-member-about-heading m-0">IT support threads</h3>
                    <button
                      type="button"
                      className="storefront-cancel-membership-btn"
                      style={{
                        color: primary,
                        borderColor: `${primary}66`,
                        backgroundColor: `${primary}0f`,
                      }}
                      onClick={() => setReportProblemOpen(true)}
                    >
                      Report a problem
                    </button>
                  </div>
                  <p className="fan-member-about-text mt-2">
                    Submit and track technical issues here. Your support history is organized by thread.
                  </p>
                  {supportThreads.length === 0 ? (
                    <div
                      className="fan-profile-panel mt-2 text-sm"
                      style={{
                        borderColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 24%, transparent)",
                      }}
                    >
                      No support threads yet. Use <strong>Report a problem</strong> to start one.
                    </div>
                  ) : (
                    <div className="mt-2 grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4">
                      <div
                        className="fan-profile-panel p-2"
                        style={{
                          borderColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 24%, transparent)",
                        }}
                      >
                        <div className="space-y-2 max-h-[280px] overflow-auto">
                          {supportThreads.map((thread) => {
                            const active = supportThreadId === thread.id;
                            const preview = getSupportMessageMainText(thread.lastMessage || "");
                            return (
                              <button
                                key={thread.id}
                                type="button"
                                onClick={() => setSupportThreadId(thread.id)}
                                className="w-full text-left rounded-lg border px-3 py-2 transition-colors"
                                style={{
                                  borderColor: active
                                    ? "color-mix(in srgb, var(--fan-primary, #6366f1) 58%, transparent)"
                                    : "color-mix(in srgb, var(--fan-primary, #6366f1) 20%, transparent)",
                                  backgroundColor: active
                                    ? "color-mix(in srgb, var(--fan-primary, #6366f1) 10%, white)"
                                    : "white",
                                }}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-semibold m-0 truncate">{thread.title}</p>
                                  <span
                                    className="text-[10px] px-2 py-0.5 rounded-full border shrink-0"
                                    style={{
                                      borderColor:
                                        thread.status === "closed"
                                          ? "color-mix(in srgb, #64748b 45%, transparent)"
                                          : "color-mix(in srgb, #059669 45%, transparent)",
                                      color: thread.status === "closed" ? "#64748b" : "#059669",
                                      backgroundColor:
                                        thread.status === "closed"
                                          ? "color-mix(in srgb, #64748b 10%, transparent)"
                                          : "color-mix(in srgb, #059669 10%, transparent)",
                                    }}
                                  >
                                    {thread.status === "closed" ? "Closed" : "Open"}
                                  </span>
                                </div>
                                {preview ? <p className="text-xs m-0 mt-1 opacity-85 line-clamp-2">{preview}</p> : null}
                                <p className="text-[11px] m-0 mt-1 opacity-75">
                                  {thread.updatedAt ? new Date(thread.updatedAt).toLocaleString() : "No date"}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div
                        className="fan-profile-panel"
                        style={{
                          borderColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 24%, transparent)",
                        }}
                      >
                        <div className="space-y-2 max-h-[280px] overflow-auto pr-1">
                          {supportMessages.map((msg) => (
                            <div
                              key={msg.id}
                              className="rounded-lg border px-3 py-2"
                              style={{
                                borderColor:
                                  msg.senderType === "support"
                                    ? "color-mix(in srgb, #475569 32%, transparent)"
                                    : "color-mix(in srgb, var(--fan-primary, #6366f1) 30%, transparent)",
                                backgroundColor:
                                  msg.senderType === "support"
                                    ? "color-mix(in srgb, #475569 8%, white)"
                                    : "color-mix(in srgb, var(--fan-primary, #6366f1) 7%, white)",
                              }}
                            >
                              <p className="text-xs font-semibold m-0">
                                {msg.senderType === "support" ? "IT Team" : "You"}
                              </p>
                              <p className="text-sm whitespace-pre-wrap m-0 mt-1">{getSupportMessageMainText(msg.content)}</p>
                              {getSupportMessageDiagnostics(msg.content) ? (
                                <details className="mt-1">
                                  <summary className="text-[11px] cursor-pointer opacity-80">Diagnostics</summary>
                                  <pre className="text-[11px] whitespace-pre-wrap mt-1 opacity-80">
                                    {getSupportMessageDiagnostics(msg.content)}
                                  </pre>
                                </details>
                              ) : null}
                              <p className="text-[11px] opacity-75 m-0 mt-1">
                                {msg.createdAt ? new Date(msg.createdAt).toLocaleString() : ""}
                              </p>
                            </div>
                          ))}
                          {supportThreadId && supportMessages.length === 0 ? (
                            <p className="text-sm opacity-75">No messages in this thread yet.</p>
                          ) : null}
                        </div>
                        {supportThreadId ? (
                          <div className="mt-3 flex gap-2">
                            <textarea
                              rows={2}
                              value={supportReplyDraft}
                              onChange={(e) => setSupportReplyDraft(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border text-sm"
                              style={{
                                borderColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 18%, transparent)",
                                backgroundColor: "white",
                                color: "var(--fan-text, #1f2937)",
                              }}
                              placeholder="Reply to IT support..."
                            />
                            <button
                              type="button"
                              className="storefront-cancel-membership-btn self-end"
                              style={{
                                color: primary,
                                borderColor: `${primary}66`,
                                backgroundColor: `${primary}0f`,
                              }}
                              disabled={supportSending || !supportReplyDraft.trim()}
                              onClick={() => {
                                void sendSupportReply();
                              }}
                            >
                              {supportSending ? "Sending..." : "Send"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === "about" && (
              <div className="fan-member-about">
                <h2 className="fan-member-about-title">About {displayName}</h2>
                {bio && (
                  <div className="fan-member-about-section">
                    <p className="fan-member-about-bio">{bio}</p>
                  </div>
                )}
                {showMemberGuidelines ? (
                  <div className="fan-member-about-section">
                    <h3 className="fan-member-about-heading">{guidelinesSectionTitle}</h3>
                    {memberGuidelinesIntro ? <p className="fan-member-about-text">{memberGuidelinesIntro}</p> : null}
                    {memberGuidelinesLines.length > 0 ? (
                      <ul className="list-none m-0 mt-2 p-0 space-y-2">
                        {memberGuidelinesLines.map((line, i) => {
                          const marker: LandingSectionListMarker =
                            landingContent?.boundaryLinesMarker ?? "check";
                          if (marker === "none") {
                            return (
                              <li key={i} className="text-sm leading-relaxed" style={{ color: "var(--fan-text-muted)" }}>
                                {line}
                              </li>
                            );
                          }
                          const glyph = marker === "heart" ? "♥" : marker === "dot" ? "•" : "✓";
                          return (
                            <li key={i} className="flex gap-2 items-start text-sm leading-relaxed">
                              <span className="shrink-0 w-4 text-center" style={{ color: primary }}>
                                {glyph}
                              </span>
                              <span style={{ color: "var(--fan-text-muted)" }}>{line}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                {!bio && !showMemberGuidelines && (
                  <p className="fan-member-empty">No about or guidelines added yet.</p>
                )}
              </div>
            )}
        </div>
      )}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
};
