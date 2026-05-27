import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, Fragment, useMemo } from "react";
import { createPortal } from "react-dom";
import { auth } from "../firebaseConfig";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { storage } from "../firebaseConfig";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reload,
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
import { normalizeTreatProductsFromApi } from "../src/lib/treatProductsNormalize";
import {
  parseTreatProductPackFields,
  isDigitalPackProductType,
  parseDigitalPackMediaItems,
  mergeOwnedDigitalPackFulfillment,
  orderDeliveryMediaItems,
} from "../src/lib/digitalPackProduct";
import { FanMemberDigitalPackTreatCard } from "./FanMemberDigitalPackTreatCard";
import { DigitalPackDeliveryGallery } from "./DigitalPackDeliveryGallery";
import { STOREFRONT_SUSPENDED_PUBLIC_MESSAGE } from "../src/lib/creatorStorefrontActive";
import { getTreatProductTypeDisplayLabel } from "../src/lib/treatProductTypeLabel";
import { FanLandingPage } from "./FanLandingPage";
import { MemberHubSocialLinksButton } from "./StorefrontSocialLinksUI";
import { hasStorefrontSocialLinksOnSurface } from "../src/lib/storefrontSocialLinks";
import { FanAuthModal } from "./FanAuthModal";
import { FanMemberFeed, FanMemberSaved, fetchFanMemberPostForPurchases } from "./FanMemberFeed";
import { MemberUsernameGateModal } from "./MemberUsernameGateModal";
import {
  DEFAULT_PRIVACY_POLICY,
  DEFAULT_TERMS_OF_SERVICE,
  KNOWN_APP_ROUTES,
  fanStorefrontSkipAutoSubscribeKey,
} from "../constants";
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
import { fanDmMarkReadAfterOpen } from "../src/lib/fanDmMarkReadClient";
import {
  DM_MAX_ATTACHMENTS_PER_MESSAGE,
  attachmentsSignature,
  getMessageAttachments,
  type DmAttachmentItem,
} from "../src/lib/fanDmAttachments";
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
import { DmMessageAttachmentStack } from "./DmMessageAttachmentStack";
import { inferIsVideoFromUrl } from "../src/lib/mediaUrlInfer";
import { fetchCreatorFanPostMedia } from "../src/lib/fetchCreatorFanPostMedia";
import { isProtectedLockedMediaUrl } from "../src/lib/lockedPostMedia";
import { FanHubNotificationBell, type FanHubNotificationNavigatePayload } from "./FanHubNotificationBell";
import { BrowserPushSettings } from "./BrowserPushSettings";
import {
  clearLocalPushRegistrationState,
  isBrowserPushEnabled,
  listenForForegroundPush,
} from "../src/lib/fanPushNotifications";
import { getAvatarCropStyle } from "../src/lib/avatarCrop";
import { resolveStoreCopy } from "../src/lib/storefrontStoreCopy";
import { resolveTipFooterEmoji, resolveTipSectionCopy } from "../src/lib/tipSectionCopy";
import { normalizeMemberUsername, validateMemberUsernameFormat } from "../src/lib/memberUsername";
import { mergeFanHubStorefrontTheme } from "../src/lib/mergeFanHubStorefrontTheme";
import { normalizeHeroMediaForStorefront } from "../src/lib/storefrontHeroNormalize";
import { useAppContext } from "./AppContext";
import { isConfiguredCustomStorefrontHost } from "../src/lib/storefrontCustomDomain";
import { usePathname } from "../src/hooks/usePathname";
import { db } from "../firebaseConfig";
import { ReportProblemModal } from "./ReportProblemModal";
import { FanHubHelpChooserModal } from "./FanHubHelpChooserModal";
import { SupportThreadsPanel } from "./SupportThreadsPanel";
import { Toast } from "./Toast";
import VideoCallRoom from "./VideoCallRoom";
import { readFanCheckoutFetchResult, FAN_TIP_CHECKOUT_SUCCESS_QS } from "../src/lib/fanCheckoutResponse";
import { WitmeHeaderLogo } from "./WitmeHeaderLogo";
import { formatFanStorefrontDocumentTitle, getFanFacingSiteTitle } from "../src/lib/fanFacingSiteTitle";
import {
  consumeFanStorefrontPublicLandingIntent,
  peekFanStorefrontPublicLandingIntent,
  primeFanStorefrontPublicLandingIntentForNormalizedPath,
  stripFanStorefrontLandingQueryParam,
} from "../src/lib/fanStorefrontLandingIntent";
import {
  applyWitmeTabIcons,
  isWitmePublicSiteHostname,
  restoreEchoFluxTabIcons,
} from "../src/lib/witmeTabIcons";
import { creatorIdFirestoreQueryVariants, normalizeCreatorId } from "../src/lib/creatorIdNormalize";
import { renderTextWithCustomEmoji, type SjHeartEmojiAccessContext } from "../src/lib/customEmoji";

import {
  storefrontAudioDownloadGuardProps,
  storefrontImageDownloadGuardProps,
  storefrontVideoDownloadGuardProps,
  StorefrontGuardedImage,
} from "../src/lib/storefrontMediaGuard";

/** Ensure member-store products have usable Firestore ids (avoids every row showing “Processing…” when id is missing or duplicated). */
function toOptionalNonNegativeInt(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.floor(n));
}

async function loadTreatProductsViaFirestore(
  creatorId: string,
  context: "landing" | "member"
): Promise<TreatProduct[]> {
  const variants = creatorIdFirestoreQueryVariants(creatorId);
  const canReadOwnerScope =
    !!auth.currentUser?.uid &&
    normalizeCreatorId(auth.currentUser.uid) === normalizeCreatorId(creatorId);
  const docArrays = await Promise.all(
    variants.map(async (cid): Promise<QueryDocumentSnapshot<DocumentData>[]> => {
      try {
        /**
         * For public/guest storefront reads, Firestore rules require visibility/archive predicates to be
         * part of the query. Creator-owner reads can use creatorId-only query for manage/member parity.
         */
        const snap = canReadOwnerScope
          ? await getDocs(query(collection(db, "products"), where("creatorId", "==", cid)))
          : await getDocs(
              query(
                collection(db, "products"),
                where("creatorId", "==", cid),
                where("visible", "==", true),
                where("archived", "==", false)
              )
            );
        return snap.docs;
      } catch (e) {
        console.warn("Landing/member Firestore treats fallback query failed", {
          creatorIdVariant: cid,
          context,
          canReadOwnerScope,
          error: e,
        });
        return [];
      }
    })
  );
  const out: TreatProduct[] = [];
  const seen = new Set<string>();
  for (const docs of docArrays) {
    for (const d of docs) {
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
        ...parseTreatProductPackFields(x),
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

/**
 * Parse `users/{uid}` for the fan member hub.
 * If the Firestore doc exists but has no `photoURL` / `avatar` keys (e.g. after deleteField clears),
 * return an empty photo — do not resurrect a stale `auth.currentUser.photoURL` Storage URL after removal.
 */
function parseFanMemberProfileFromUserDoc(
  d: Record<string, unknown>,
  userDocumentExists: boolean,
  authDisplayName: string | null | undefined,
  authPhotoURL: string | null | undefined
): {
  firstName: string;
  lastName: string;
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
  const hasPhotoKeys =
    Object.prototype.hasOwnProperty.call(d, "photoURL") || Object.prototype.hasOwnProperty.call(d, "avatar");

  let photoURL: string;
  if (!userDocumentExists) {
    const fromDoc =
      hasPhotoKeys
        ? ((typeof d.photoURL === "string" && d.photoURL.trim()) ||
            (typeof d.avatar === "string" && d.avatar.trim()) ||
            "")
        : "";
    const oauth = typeof authPhotoURL === "string" ? authPhotoURL.trim() : "";
    photoURL = fromDoc || oauth;
  } else if (hasPhotoKeys) {
    photoURL =
      ((typeof d.photoURL === "string" && d.photoURL.trim()) ||
        (typeof d.avatar === "string" && d.avatar.trim()) ||
        "");
  } else {
    photoURL = "";
  }

  const username =
    (typeof d.username === "string" && d.username.trim())
      ? normalizeMemberUsername(d.username)
      : "";
  return { firstName, lastName, photoURL, username };
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
  showDisplayNameOnLanding?: boolean;
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
  /** Store items visible on the public landing page as a preview. */
  publicTreatsOnLanding?: boolean;
  /** False when creator EchoFlux subscription is lapsed — no new signups or store. */
  storefrontActive?: boolean;
  storefrontSuspendedMessage?: string;
  rules?: { boundariesText?: string };
  spicyMode?: boolean;
  monetization?: CreatorMonetization;
  feedSettings?: { hideLikeCounts?: boolean; hideComments?: boolean; hideLikes?: boolean; hideTipButton?: boolean };
  heroMedia?: {
    url: string;
    size?: "small" | "medium" | "large" | "fullBackground" | "fullBackgroundPortrait";
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
    perksExtra?: TextStyle;
    previewTitle?: TextStyle;
    previewText?: TextStyle;
    previewExtra?: TextStyle;
    energyTitle?: TextStyle;
    energyBody?: TextStyle;
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

type FanDeliveryPurchaseType =
  | "product"
  | "post_unlock"
  | "unlock"
  | "tip"
  | "subscription"
  | "live_stream_ticket";

type FanDeliveryPurchase = {
  id: string;
  creatorId: string;
  fanId: string;
  fanEmail?: string;
  type: FanDeliveryPurchaseType;
  productId: string | null;
  /** Feed post id for paid feed unlocks (`post_unlock`). */
  postId?: string | null;
  streamId?: string | null;
  productTitle?: string;
  amountCents: number;
  status: string;
  createdAt: string;
  scheduleStatus?: "pending" | "scheduled" | "completed" | "cancelled" | "expired";
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  deliveryStatus?: "pending" | "delivered";
  deliveryType?: "video" | "image" | "audio" | "text" | "link" | null;
  deliveryText?: string | null;
  deliveryUrl?: string | null;
  deliveredAt?: string | null;
  deliveryItems?: import("../types").DigitalPackMediaItem[];
  digitalPackFulfillment?: boolean;
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

/** Avoid replacing `dmMessages` when polling returns the same rows (keeps scroll/layout stable). */
function fanDmMessagesEqualish(a: FanDmMessage[], b: FanDmMessage[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.senderId !== y.senderId ||
      x.content !== y.content ||
      x.createdAt !== y.createdAt ||
      (x.read ?? false) !== (y.read ?? false) ||
      (x.attachmentUrl ?? "") !== (y.attachmentUrl ?? "") ||
      (x.attachmentType ?? "") !== (y.attachmentType ?? "") ||
      attachmentsSignature(x) !== attachmentsSignature(y) ||
      (x.reported ?? false) !== (y.reported ?? false) ||
      (x.reportId ?? "") !== (y.reportId ?? "")
    ) {
      return false;
    }
  }
  return true;
}

function normalizeFanPurchaseType(raw: Record<string, unknown>): FanDeliveryPurchaseType {
  const type = typeof raw.type === "string" ? raw.type.trim().toLowerCase() : "";
  const productType = typeof raw.productType === "string" ? raw.productType.trim().toLowerCase() : "";
  if (type === "tip" || productType === "tip") return "tip";
  if (type === "subscription" || productType === "subscription") return "subscription";
  if (typeof raw.tipHandle === "string" && raw.tipHandle.trim()) return "tip";
  if (type === "post_unlock" || productType === "post_unlock") return "post_unlock";
  if (type === "unlock" || productType === "unlock") return "unlock";
  if (type === "live_stream_ticket" || productType === "live_stream_ticket") return "live_stream_ticket";
  return "product";
}

function fanOrderScheduleFields(
  normalizedType: FanDeliveryPurchaseType,
  raw: Record<string, unknown>
): Pick<FanDeliveryPurchase, "scheduleStatus" | "scheduledDate" | "scheduledTime"> {
  if (normalizedType === "tip" || normalizedType === "subscription") {
    return {};
  }
  const schedRaw = typeof raw.scheduleStatus === "string" ? raw.scheduleStatus.trim().toLowerCase() : "";
  let scheduleStatus: NonNullable<FanDeliveryPurchase["scheduleStatus"]>;
  if (
    schedRaw === "scheduled" ||
    schedRaw === "pending" ||
    schedRaw === "completed" ||
    schedRaw === "cancelled" ||
    schedRaw === "expired"
  ) {
    scheduleStatus = schedRaw;
  } else {
    scheduleStatus = "pending";
  }
  return {
    scheduleStatus,
    scheduledDate: typeof raw.scheduledDate === "string" ? raw.scheduledDate : null,
    scheduledTime: typeof raw.scheduledTime === "string" ? raw.scheduledTime : null,
  };
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

function FanPurchaseUnlockedPostBlock({ creatorId, postId }: { creatorId: string; postId: string }) {
  const [row, setRow] = useState<Awaited<ReturnType<typeof fetchFanMemberPostForPurchases>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedImageUrl, setExpandedImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRow(null);
    void Promise.all([
      fetchFanMemberPostForPurchases(creatorId, postId),
      fetchCreatorFanPostMedia(creatorId, postId),
    ])
      .then(([base, apiMedia]) => {
        if (cancelled) return;
        if (!base) {
          setRow(null);
          setLoading(false);
          return;
        }
        let mediaUrls = [...base.mediaUrls];
        let mediaTypes = [...base.mediaTypes];
        if (apiMedia?.mediaUrls?.length) {
          mediaUrls = apiMedia.mediaUrls;
          mediaTypes = apiMedia.mediaTypes;
        } else {
          const filteredUrls: string[] = [];
          const filteredTypes: ("image" | "video")[] = [];
          mediaUrls.forEach((url, i) => {
            if (isProtectedLockedMediaUrl(url)) return;
            filteredUrls.push(url);
            filteredTypes.push(mediaTypes[i] === "video" ? "video" : "image");
          });
          mediaUrls = filteredUrls;
          mediaTypes = filteredTypes;
        }
        const audioUrls = (base.audioUrls ?? []).filter((u) => !isProtectedLockedMediaUrl(u));
        setRow({ ...base, mediaUrls, mediaTypes, audioUrls });
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setRow(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [creatorId, postId]);

  useEffect(() => {
    if (!expandedImageUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedImageUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedImageUrl]);

  useEffect(() => {
    if (!expandedImageUrl) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expandedImageUrl]);

  if (loading) {
    return <p className="fan-member-loading" style={{ marginTop: "0.5rem" }}>Loading…</p>;
  }
  if (!row) {
    return (
      <p className="fan-member-about-text" style={{ marginTop: "0.5rem" }}>
        This post isn&apos;t available right now.
      </p>
    );
  }

  return (
    <div className="fan-member-purchase-unlock-preview">
      {row.body ? (
        <div className="fan-profile-panel fan-member-purchase-unlock-preview-body">
          <p className="fan-member-about-text fan-member-purchase-unlock-preview-text">{row.body}</p>
        </div>
      ) : null}
      {row.mediaUrls.length > 0 ? (
        <div className="digital-pack-delivery-gallery fan-member-purchase-unlock-delivery">
          {row.mediaUrls.map((url, i) => {
            const declared = row.mediaTypes[i] === "video" ? "video" : "image";
            const isVideo = declared === "video" || inferIsVideoFromUrl(url);
            if (isVideo) {
              return (
                <div
                  key={`${url}-${i}`}
                  className="digital-pack-delivery-item digital-pack-delivery-item--video"
                >
                  <video
                    src={url}
                    controls
                    playsInline
                    preload="metadata"
                    className="digital-pack-delivery-item__video"
                    {...storefrontVideoDownloadGuardProps}
                  />
                </div>
              );
            }
            return (
              <div
                key={`unlock-img-slot-${i}-${url}`}
                className="digital-pack-delivery-item digital-pack-delivery-item--image"
              >
                <StorefrontGuardedImage
                  src={url}
                  className="digital-pack-delivery-item__img"
                  fit="contain"
                  position="top center"
                />
                <button
                  type="button"
                  className="digital-pack-delivery-item__expand"
                  aria-label="Expand image"
                  onClick={() => setExpandedImageUrl(url)}
                >
                  Expand
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      {row.audioUrls.length > 0 ? (
        <div className="fan-member-purchase-unlock-audio-stack">
          {row.audioUrls.map((url) => (
            <audio
              key={url}
              src={url}
              controls
              preload="metadata"
              {...storefrontAudioDownloadGuardProps}
            />
          ))}
        </div>
      ) : null}
      {expandedImageUrl && typeof document !== "undefined"
        ? createPortal(
            <div
              className="digital-pack-delivery-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label="Expanded purchase image"
              onClick={(e) => {
                if (e.target === e.currentTarget) setExpandedImageUrl(null);
              }}
            >
              <button
                type="button"
                className="digital-pack-delivery-lightbox__close"
                onClick={() => setExpandedImageUrl(null)}
              >
                Close
              </button>
              <div className="digital-pack-delivery-lightbox__stage" onClick={(e) => e.stopPropagation()}>
                <StorefrontGuardedImage
                  src={expandedImageUrl}
                  className="digital-pack-delivery-lightbox__img"
                  fit="contain"
                  position="center"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function fanPurchaseIsDigitalPack(o: FanDeliveryPurchase): boolean {
  return o.digitalPackFulfillment === true;
}

function fanPurchasePackItemCountLabel(o: FanDeliveryPurchase): string | null {
  const n = o.deliveryItems?.length ?? 0;
  if (n <= 0) return null;
  return `${n} ${n === 1 ? "item" : "items"} delivered`;
}

function fanPurchaseTypeLabel(o: FanDeliveryPurchase): string {
  if (o.type === "post_unlock") return "Feed unlock";
  if (o.type === "live_stream_ticket") return "Live stream ticket";
  if (fanPurchaseIsDigitalPack(o)) return "Digital pack";
  return (o.type || "product").replace(/_/g, " ");
}

function formatPrice(cents: number | null | undefined): string {
  const n = typeof cents === "number" && Number.isFinite(cents) ? Math.max(0, cents) : 0;
  return `$${(n / 100).toFixed(2)}`;
}

/** Same preset merge as getCreatorByHandle — member hub must use API storefront theme, not a separate Firestore read. */
function storefrontMemberThemeColors(
  themeRaw: StorefrontCreator["theme"] | undefined,
  defaults: { primary: string; background: string }
) {
  const m = mergeFanHubStorefrontTheme(
    themeRaw && typeof themeRaw === "object" ? (themeRaw as Record<string, unknown>) : undefined
  );
  const primary = m.primary || defaults.primary;
  return {
    primary,
    background: m.background || defaults.background,
    text: m.text || "#1f2937",
    textMuted: m.textMuted,
    border: m.border || "#e5e7eb",
    accentHover: m.accentHover || primary,
    fontFamily: m.fontFamily || themeRaw?.fontFamily,
  };
}

function fanPurchaseRowStatus(o: FanDeliveryPurchase): string {
  if (o.type === "tip") return "Tip paid";
  if (o.type === "subscription") return "Membership active";
  if (o.type === "post_unlock") return "Unlocked";
  if (o.scheduleStatus === "cancelled") return "Cancelled";
  if (o.type === "live_stream_ticket") {
    if (o.scheduleStatus === "expired") return "Expired";
    if (o.deliveryStatus === "delivered" || o.scheduleStatus === "completed") return "Delivered";
    if (o.scheduleStatus === "scheduled") return "Scheduled";
    return "Pending";
  }
  if (o.deliveryStatus === "delivered") return "Delivered";
  if (o.scheduleStatus === "scheduled") return "Scheduled";
  return "Pending";
}

/** Delivered purchase media — pack gallery or legacy single delivery fields (not both). */
function FanMemberPurchaseDeliveryContent({
  o,
  primary,
}: {
  o: FanDeliveryPurchase;
  primary: string;
}) {
  if (o.deliveryStatus !== "delivered") return null;

  const mediaItems = orderDeliveryMediaItems(o);
  if (mediaItems.length > 0) {
    return (
      <DigitalPackDeliveryGallery
        items={mediaItems}
        imageGuardProps={storefrontImageDownloadGuardProps}
        videoGuardProps={storefrontVideoDownloadGuardProps}
        audioGuardProps={storefrontAudioDownloadGuardProps}
      />
    );
  }

  return (
    <>
      {o.deliveryType === "text" && o.deliveryText ? (
        <div className="fan-profile-panel fan-member-purchase-text-panel">
          <p className="fan-member-about-text" style={{ whiteSpace: "pre-wrap" }}>
            {o.deliveryText}
          </p>
        </div>
      ) : null}
      {o.deliveryType === "link" && o.deliveryUrl ? (
        <a
          href={o.deliveryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="fan-member-treat-buy fan-member-purchase-link-btn"
          style={{ backgroundColor: primary }}
        >
          Open link
        </a>
      ) : null}
    </>
  );
}

/** Shared media for one purchase row (inside expanded details body). */
function FanMemberPurchaseItemBody({
  o,
  creatorId,
  primary,
}: {
  o: FanDeliveryPurchase;
  creatorId: string | undefined;
  primary: string;
}) {
  if (o.type === "tip") {
    return <p className="fan-member-purchase-body-note">Tip recorded — no delivery media.</p>;
  }
  if (o.type === "subscription") {
    return <p className="fan-member-purchase-body-note">Membership payment — access is on your member hub.</p>;
  }
  if (o.type === "post_unlock") {
    return o.postId && creatorId ? (
      <FanPurchaseUnlockedPostBlock creatorId={creatorId} postId={o.postId} />
    ) : (
      <p className="fan-member-about-text fan-member-purchase-body-note">
        Post details aren&apos;t linked to this receipt.
      </p>
    );
  }
  if (o.type === "live_stream_ticket") {
    return <p className="fan-member-purchase-body-note">{fanPurchaseRowStatus(o)}</p>;
  }
  if (o.deliveryStatus === "delivered") {
    return <FanMemberPurchaseDeliveryContent o={o} primary={primary} />;
  }
  return <p className="fan-member-purchase-body-note">Pending delivery from the creator.</p>;
}

function FanMemberPurchaseRowBody({
  o,
  creatorId,
  primary,
  expanded,
}: {
  o: FanDeliveryPurchase;
  creatorId: string | undefined;
  primary: string;
  expanded: boolean;
}) {
  const hasDeliveredMedia =
    (o.deliveryItems && o.deliveryItems.length > 0) ||
    (o.deliveryStatus === "delivered" &&
      (Boolean(o.deliveryText) ||
        Boolean(o.deliveryUrl) ||
        o.type === "post_unlock"));

  if (expanded || !hasDeliveredMedia) {
    return <FanMemberPurchaseItemBody o={o} creatorId={creatorId} primary={primary} />;
  }

  return (
    <details className="fan-member-purchase-media-details" open={o.type === "post_unlock"}>
      <summary className="fan-member-purchase-media-details__summary">
        {o.type === "post_unlock" ? "View unlocked post" : "View delivery"}
      </summary>
      <div className="fan-member-purchase-media-details__content">
        <FanMemberPurchaseItemBody o={o} creatorId={creatorId} primary={primary} />
      </div>
    </details>
  );
}

function FanMemberPurchaseRow({
  o,
  creatorId,
  primary,
  expanded,
}: {
  o: FanDeliveryPurchase;
  creatorId: string | undefined;
  primary: string;
  expanded: boolean;
}) {
  const packMeta = fanPurchaseIsDigitalPack(o) ? fanPurchasePackItemCountLabel(o) : null;
  const priceEl =
    o.amountCents > 0 || o.type === "tip" || o.type === "subscription" ? (
      <span className="fan-member-purchase-compact-price">{formatPrice(o.amountCents)}</span>
    ) : (
      <span className="fan-member-purchase-compact-price fan-member-purchase-compact-price--muted">—</span>
    );

  const body = (
    <FanMemberPurchaseRowBody o={o} creatorId={creatorId} primary={primary} expanded={expanded} />
  );

  if (!expanded) {
    return (
      <details className="fan-member-purchase-compact">
        <summary className="fan-member-purchase-compact-summary">
          <span className="fan-member-purchase-compact-type">{fanPurchaseTypeLabel(o)}</span>
          <span className="fan-member-purchase-compact-title">{o.productTitle || "Purchase"}</span>
          <span className="fan-member-purchase-compact-status">{fanPurchaseRowStatus(o)}</span>
          {priceEl}
        </summary>
        <div className="fan-member-purchase-compact-body">
          <div className="fan-member-purchase-expanded-card">{body}</div>
        </div>
      </details>
    );
  }

  return (
    <article className="fan-member-purchase-row fan-member-purchase-row--card fan-member-purchase-row--expanded">
      <header className="fan-member-purchase-card-header">
        <div className="fan-member-purchase-card-header__main">
          <p className="fan-member-purchase-card-category">{fanPurchaseTypeLabel(o)}</p>
          <h3 className="fan-member-purchase-card-title">{o.productTitle || "Purchase"}</h3>
          {packMeta ? <p className="fan-member-purchase-card-pack-meta">{packMeta}</p> : null}
        </div>
        <div className="fan-member-purchase-card-header__aside">
          <span className="fan-member-purchase-card-status">{fanPurchaseRowStatus(o)}</span>
          {priceEl}
        </div>
      </header>
      <div className="fan-member-purchase-row__body fan-member-purchase-row__body--expanded">{body}</div>
    </article>
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

/** Legacy `/p` implied public landing. Rewrite to canonical path, prime landing intent without putting `landing=1` in the URL. */
const LEGACY_PUBLIC_LANDING_PATH_SEGMENT = "p";

function normalizeLegacyFanStorefrontPublicLandingPath(): void {
  if (typeof window === "undefined") return;
  const rawPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const seg = LEGACY_PUBLIC_LANDING_PATH_SEGMENT;
  let nextPathname: string | null = null;
  const custom = isConfiguredCustomStorefrontHost(window.location.hostname);

  if (!custom) {
    const leg = rawPath.match(/^\/(?:u|link)\/([^/]+)\/p$/i);
    const plain = rawPath.match(/^\/([^/]+)\/p$/i);
    if (leg) {
      nextPathname = `/u/${decodeHandleSegment(leg[1])}`;
    } else if (plain) {
      nextPathname = `/${decodeHandleSegment(plain[1])}`;
    }
  } else {
    if (rawPath.toLowerCase() === `/${seg}`) {
      nextPathname = "/";
    } else {
      const two = rawPath.match(/^\/([^/]+)\/p$/i);
      if (two && /^[a-z0-9_]+$/i.test(two[1])) {
        nextPathname = `/${decodeHandleSegment(two[1])}`;
      }
    }
  }

  if (nextPathname == null) return;

  const params = new URLSearchParams(window.location.search);
  params.delete("landing");
  const query = params.toString() ? `?${params.toString()}` : "";
  window.history.replaceState(null, "", nextPathname + query + (window.location.hash || ""));
  primeFanStorefrontPublicLandingIntentForNormalizedPath(nextPathname);
}

/**
 * Path → handle + legal subpage + optional member nav segment (path-based tabs).
 * - Default: /{handle}, /{handle}/terms|privacy|{nav}, legacy /u|link/{handle}/...
 * - Custom domain: /, /terms|privacy, /{nav} at root hub, /{handle}, /{handle}/{nav}
 */
function parseHandleFromPath(): {
  handle: string | null;
  subpage: "terms" | "privacy" | null;
  memberNavSlug: string | null;
} {
  if (typeof window === "undefined") {
    return { handle: null, subpage: null, memberNavSlug: null };
  }
  normalizeLegacyFanStorefrontPublicLandingPath();
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const parts = path.slice(1).split("/").filter(Boolean);
  const host = window.location.hostname;
  const custom = isConfiguredCustomStorefrontHost(host);

  if (custom) {
    if (parts.length === 0) {
      return { handle: null, subpage: null, memberNavSlug: null };
    }
    if (parts.length === 1 && (parts[0] === "terms" || parts[0] === "privacy")) {
      return { handle: null, subpage: parts[0] as "terms" | "privacy", memberNavSlug: null };
    }
    if (parts.length === 1 && isMemberPathSlug(parts[0])) {
      return { handle: null, subpage: null, memberNavSlug: parts[0].toLowerCase() };
    }
    if (parts.length === 1 && CUSTOM_DOMAIN_RESERVED_APP_ROUTE_SEGMENTS.has(parts[0].toLowerCase())) {
      return { handle: null, subpage: null, memberNavSlug: null };
    }
    if (parts.length === 1 && /^[a-z0-9_]+$/i.test(parts[0])) {
      return { handle: decodeHandleSegment(parts[0]), subpage: null, memberNavSlug: null };
    }
    if (parts.length === 2) {
      const a = parts[0];
      const b = parts[1].toLowerCase();
      if (b === "terms" || b === "privacy") {
        return { handle: decodeHandleSegment(a), subpage: b as "terms" | "privacy", memberNavSlug: null };
      }
      if (/^[a-z0-9_]+$/i.test(a) && isMemberPathSlug(b)) {
        return { handle: decodeHandleSegment(a), subpage: null, memberNavSlug: b };
      }
    }
    return { handle: null, subpage: null, memberNavSlug: null };
  }

  const legacyFull = path.match(/^\/(?:u|link)\/([^/]+)(?:\/([^/]+))?$/);
  if (legacyFull) {
    const h = decodeHandleSegment(legacyFull[1]);
    const rest = (legacyFull[2] || "").toLowerCase();
    if (rest === "terms" || rest === "privacy") {
      return { handle: h, subpage: rest as "terms" | "privacy", memberNavSlug: null };
    }
    if (rest && isMemberPathSlug(rest)) {
      return { handle: h, subpage: null, memberNavSlug: rest };
    }
    return { handle: h, subpage: null, memberNavSlug: null };
  }

  const handleSeg = parts[0];
  if (!handleSeg) return { handle: null, subpage: null, memberNavSlug: null };
  const seg1 = (parts[1] || "").toLowerCase();
  if (seg1 === "terms" || seg1 === "privacy") {
    return { handle: decodeHandleSegment(handleSeg), subpage: seg1 as "terms" | "privacy", memberNavSlug: null };
  }
  if (seg1 && isMemberPathSlug(seg1)) {
    return { handle: decodeHandleSegment(handleSeg), subpage: null, memberNavSlug: seg1 };
  }
  return { handle: decodeHandleSegment(handleSeg), subpage: null, memberNavSlug: null };
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
  // A stale guest-checkout marker would route the return through the guest claim flow
  // instead of the signed-in member sync that writes orders/entitlements.
  p.delete("treat_success");
  p.delete("checkout_cancel");
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
  /** After “Thank You!” — emoji or short text; null = hidden */
  tipFooterEmoji: string | null;
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
  tipFooterEmoji,
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
        {tipFooterEmoji ? <span className="tip-heart-icon">{tipFooterEmoji}</span> : null}
      </div>
    </div>
  );
}

/** Fan member hub purchases: first page size and API cap (see `/api/fanPurchases`). */
const FAN_MEMBER_PURCHASES_PAGE = 80;
const FAN_MEMBER_PURCHASES_MAX = 1000;

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
  const [membershipManageModalOpen, setMembershipManageModalOpen] = useState(false);
  const [billingPortalLoading, setBillingPortalLoading] = useState(false);
  const [billingPortalError, setBillingPortalError] = useState<string | null>(null);
  const [membershipType, setMembershipType] = useState<"free" | "paid" | null>(null);
  const [billedSubscriptionPriceCents, setBilledSubscriptionPriceCents] = useState<number | null>(null);
  const [limitedMemberAccess, setLimitedMemberAccess] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [entitlementLoading, setEntitlementLoading] = useState(false);
  const [entitlementBootstrapResolved, setEntitlementBootstrapResolved] = useState(false);
  /** Bumps when entitlement effect re-runs so stale async completions don't leave loading stuck. */
  const entitlementFetchGen = useRef(0);
  /** Paid-creator fan auth: pick Home vs Purchases after `getFanEntitlement` (expired / free tier → store). */
  const fanAuthPendingHubNavRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [geoBlocked, setGeoBlocked] = useState(false);
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
  const [unlockedLiveStreamIds, setUnlockedLiveStreamIds] = useState<string[]>([]);
  /** Synthetic member access from server (env-listed admins on selected storefronts). */
  const [fanPageAdminBypass, setFanPageAdminBypass] = useState(false);
  const [treatsProducts, setTreatsProducts] = useState<TreatProduct[]>([]);
  const [treatsLoading, setTreatsLoading] = useState(false);
  const [treatsRefreshNonce, setTreatsRefreshNonce] = useState(0);
  const [fanPurchases, setFanPurchases] = useState<FanDeliveryPurchase[]>([]);
  const [fanPurchasesLoading, setFanPurchasesLoading] = useState(false);
  const [fanPurchasesLoadingMore, setFanPurchasesLoadingMore] = useState(false);
  const [fanPurchasesQueryLimit, setFanPurchasesQueryLimit] = useState(80);
  const [fanPurchasesHasMore, setFanPurchasesHasMore] = useState(false);
  const [fanPurchasesRefreshNonce, setFanPurchasesRefreshNonce] = useState(0);
  const memberPurchasesCompactStorageKey = useMemo(() => {
    const uid = fanAuthUid;
    const cid = creator?.creatorId;
    if (!uid || !cid) return null;
    return `fanMemberPurchasesCompact:${uid}:${cid}`;
  }, [fanAuthUid, creator?.creatorId]);
  const [memberPurchasesListCompact, setMemberPurchasesListCompact] = useState(true);
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
  /** Visible treats on public landing when the creator enables landing store items. */
  const [landingTreatsProducts, setLandingTreatsProducts] = useState<TreatProduct[]>([]);
  const [landingTreatsLoading, setLandingTreatsLoading] = useState(false);
  /** Bumps when guest opens landing store modal so titles/prices match Firestore after edits. */
  const [landingTreatsRefreshNonce, setLandingTreatsRefreshNonce] = useState(0);
  const [treatLinkMessage, setTreatLinkMessage] = useState<string | null>(null);
  const pendingGuestLinkBannerShown = useRef(false);
  const checkoutReturnSyncInFlightRef = useRef(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [joiningFree, setJoiningFree] = useState(false);
  const [fanAuthOpen, setFanAuthOpen] = useState(false);
  const [fanAuthView, setFanAuthView] = useState<"login" | "signup">("login");
  /** Paid landing: user is already signed in — open auth on the “finish joining” step before Stripe. */
  const [fanAuthPaidDetailsStep, setFanAuthPaidDetailsStep] = useState(false);
  const [dmThread, setDmThread] = useState<FanDmThread | null>(null);
  const [dmMessages, setDmMessages] = useState<FanDmMessage[]>([]);
  const [dmLabels, setDmLabels] = useState<{ fan: string; creator: string } | null>(null);
  const [dmLoading, setDmLoading] = useState(false);
  /** Grows with “Load more” on DMs (fewer docs per open; cap matches `/api/fanDmMessages`). */
  const [dmMessageLimit, setDmMessageLimit] = useState(50);
  const [dmHasMoreOlder, setDmHasMoreOlder] = useState(false);
  const [dmLoadingOlder, setDmLoadingOlder] = useState(false);
  /** Avoid putting `dmMessageLimit` in `fetchDmThreadAndMessages` deps (would retrigger tab-open fetch and reset to 50). */
  const dmMessageLimitRef = useRef(dmMessageLimit);
  dmMessageLimitRef.current = dmMessageLimit;
  const [dmSending, setDmSending] = useState(false);
  const [dmInput, setDmInput] = useState("");
  /** Staged media: send only when the user clicks Send (not immediately after upload/record). */
  const [dmPendingAttachments, setDmPendingAttachments] = useState<DmAttachmentItem[]>([]);
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
  const dmMessagesListRef = useRef<HTMLDivElement | null>(null);
  const dmAutoStickToBottomRef = useRef(true);
  const dmForceScrollBottomRef = useRef(false);
  /** After foreground fetch the list mounts with scrollTop 0; `dmIsNearBottom` is false until we pin once. */
  const dmScrollBottomAfterForegroundLoadRef = useRef(false);
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
    photoURL: string;
  }>({ firstName: "", lastName: "", photoURL: "" });
  const [profileInitial, setProfileInitial] = useState<{
    firstName: string;
    lastName: string;
    photoURL: string;
  }>({ firstName: "", lastName: "", photoURL: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameInitial, setUsernameInitial] = useState("");
  const [usernameState, setUsernameState] = useState<"idle" | "checking" | "available" | "taken" | "current" | "invalid">("idle");
  const [usernameMsg, setUsernameMsg] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  /** When URL is set but the image fails in prod (expired token, 403, etc.), show initials until URL changes. */
  const [memberProfilePhotoLoadFailed, setMemberProfilePhotoLoadFailed] = useState(false);
  /** After first `users/{uid}` snapshot, don't use Auth photo for the header (Auth can stay non-null after Firestore photo was cleared). */
  const [memberProfileDocSynced, setMemberProfileDocSynced] = useState(false);
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
  const [fanHelpFlow, setFanHelpFlow] = useState<"closed" | "chooser" | "report" | "contact">("closed");
  const [supportTicketFocusId, setSupportTicketFocusId] = useState<string | null>(null);
  const [supportThreadCount, setSupportThreadCount] = useState(0);
  const customDomainHandleCacheRef = useRef<{ host: string; handle: string | null } | null>(null);

  const [landingEntryActive, setLandingEntryActive] = useState(() => {
    if (typeof window === "undefined") return false;
    const parsed = parseHandleFromPath();
    if (parsed.memberNavSlug) return false;
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    if (new URLSearchParams(window.location.search).get("landing") === "1") return true;
    return peekFanStorefrontPublicLandingIntent(window.location.hostname, path);
  });

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const parsed = parseHandleFromPath();
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    if (parsed.memberNavSlug) {
      setLandingEntryActive(false);
      stripFanStorefrontLandingQueryParam();
      return;
    }
    const urlLanding = new URLSearchParams(window.location.search).get("landing") === "1";
    const sessionConsumed = consumeFanStorefrontPublicLandingIntent(window.location.hostname, path);
    if (urlLanding || sessionConsumed) {
      setLandingEntryActive(true);
    }
    stripFanStorefrontLandingQueryParam();
  }, [pathname]);

  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const previewMember = urlParams?.get("preview") === "member";
  /**
   * Signed-in creators previewing landing (Live / legacy `/p` / optional `?landing=1`).
   * Query is stripped for a clean address bar; `landingEntryActive` keeps behavior until member hub tabs.
   */
  const forcePublicLanding = landingEntryActive || urlParams?.get("landing") === "1";

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
  const memberMessagesTabBadgeCount = activeTab === "messages" || memberSuppressDmNotifications ? 0 : unreadMessageTabCount;

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

  const hasVisibleSocialLinks = useCallback(
    (socialLinks: StorefrontSocialLinks | undefined) =>
      hasStorefrontSocialLinksOnSurface(socialLinks, "landing"),
    []
  );

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
    if (typeof window === "undefined") return;
    if (isWitmePublicSiteHostname(window.location.hostname)) {
      applyWitmeTabIcons();
    }
    return () => {
      if (typeof window === "undefined") return;
      if (!isWitmePublicSiteHostname(window.location.hostname)) {
        restoreEchoFluxTabIcons();
      }
    };
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (activeTab !== "messages" || !uid || !creator?.creatorId) return;
    void clearNewMessageNotificationBadge(uid, creator.creatorId);
  }, [activeTab, creator?.creatorId, unreadMessageTabCount]);

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
      setGeoBlocked(false);
      setError("Invalid handle");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const params = new URLSearchParams({ handle });
        if (typeof window !== "undefined") {
          const invite = new URLSearchParams(window.location.search).get("invite");
          if (invite?.trim()) params.set("invite", invite.trim());
        }
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        const res = await fetch(`/api/getCreatorByHandle?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (cancelled) return;
        let resolved: StorefrontCreator | null = null;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg = (body as { error?: string }).error;
          const code = (body as { code?: string }).code;
          const blockedByGeo = res.status === 451 || code === "GEO_BLOCKED";
          setGeoBlocked(blockedByGeo);
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
                      about: false,
                    },
                    sectionsOrder: ((own.sectionsOrder as string[] | undefined) || ["feed", "treats", "tip", "messages"]).filter(
                      (key) => key !== "about",
                    ),
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
              blockedByGeo
                ? msg || "This page is not available in your region."
                : res.status === 404
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
          setGeoBlocked(false);
        }
        if (!resolved) {
          setError("Creator not found");
          setCreator(null);
          setLoading(false);
          return;
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
                    (typeof best.displayName === "string" ? best.displayName : undefined) ||
                    resolved.handle ||
                    handle,
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
                    (typeof own.displayName === "string" ? own.displayName : undefined) ||
                    resolved.handle ||
                    handle,
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
                  } as StorefrontCreator;
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
          resolved = { ...resolved, logo: resolvedLogoUrl } as StorefrontCreator;
        } else if (resolvedLogo && !resolvedLogoUrl) {
          resolved = { ...resolved, logoUrl: resolvedLogo } as StorefrontCreator;
        }
        setCreator(resolved);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setGeoBlocked(false);
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

  /** Member hub: foreground toast when a push arrives while this tab is open. */
  useEffect(() => {
    if (!isLoggedIn || !creator?.creatorId || !auth.currentUser || previewMember) return;
    if (!isBrowserPushEnabled()) return;

    const unsubForeground = listenForForegroundPush((title, body) => {
      showToast?.(`${title}${body ? `: ${body}` : ""}`, "info");
    });

    return () => {
      unsubForeground?.();
    };
  }, [isLoggedIn, creator?.creatorId, previewMember, showToast]);

  const echofluxContactPageLabel = useMemo(() => {
    const h = creator?.handle?.trim();
    return h ? `Fan Hub · member · @${h}` : "Fan Hub · member";
  }, [creator?.handle]);

  const fanHubSupportDiagnosticsExtras = useMemo(() => {
    const lines: string[] = [];
    const un = normalizeMemberUsername(usernameDraft || usernameInitial || "");
    if (un) lines.push(`Member hub username: @${un}`);
    const ch = creator?.handle?.trim();
    if (ch) lines.push(`Creator storefront handle: @${ch}`);
    if (creator?.creatorId) lines.push(`Creator storefront ID: ${creator.creatorId}`);
    return lines;
  }, [usernameDraft, usernameInitial, creator?.handle, creator?.creatorId]);

  const submitSupportProblem = useCallback(
    async ({
      message,
      diagnostics,
      attachmentUrls,
    }: {
      message: string;
      diagnostics: string;
      attachmentUrls?: string[];
    }) => {
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
          page: echofluxContactPageLabel,
          url: typeof window !== "undefined" ? window.location.href : "",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          ...(attachmentUrls && attachmentUrls.length > 0 ? { attachmentUrls } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !(data as { success?: boolean }).success) {
        throw new Error((data as { error?: string }).error || "Failed to create support ticket");
      }
      setSupportTicketFocusId((data as { ticketId?: string }).ticketId ?? null);
      setActiveTab("profile");
      if (creator?.handle?.trim()) {
        applyFanStorefrontMemberUrl("profile", { showLanding: false, creatorHandle: creator.handle });
      }
    },
    [creator?.creatorId, creator?.handle, echofluxContactPageLabel, setActiveTab]
  );

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
      setUnlockedLiveStreamIds([]);
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
        if (!res.ok) {
          const msg = typeof (data as { error?: unknown }).error === "string" ? (data as { error: string }).error : "";
          showToast?.(msg || `Could not verify membership (${res.status}). Refresh and try again.`, "error");
          return;
        }
        const nextUnlockedProducts = Array.isArray((data as { unlockedProductIds?: string[] }).unlockedProductIds)
          ? (data as { unlockedProductIds: string[] }).unlockedProductIds
          : [];
        const nextUnlockedPosts =
          Array.isArray((data as { unlockedFanPostIds?: string[] }).unlockedFanPostIds)
            ? (data as { unlockedFanPostIds: string[] }).unlockedFanPostIds
            : [];
        const nextUnlockedStreams =
          Array.isArray((data as { unlockedLiveStreamIds?: string[] }).unlockedLiveStreamIds)
            ? (data as { unlockedLiveStreamIds: string[] }).unlockedLiveStreamIds
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
        setUnlockedLiveStreamIds(nextUnlockedStreams);
        setLimitedMemberAccess(
          !!(data as { limitedMemberAccess?: boolean }).limitedMemberAccess ||
            nextUnlockedProducts.length > 0 ||
            nextUnlockedPosts.length > 0 ||
            nextUnlockedStreams.length > 0
        );
        setFanPageAdminBypass(!!(data as { fanPageAdminBypass?: boolean }).fanPageAdminBypass);
      } catch {
        if (gen === entitlementFetchGen.current) {
          setSubscribed(false);
          setMembershipType(null);
          setBilledSubscriptionPriceCents(null);
          setMemberUsernameRequired(false);
          setUnlockedFanPostIds([]);
          setUnlockedLiveStreamIds([]);
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
    const gen = ++entitlementFetchGen.current;
    try {
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch(
        `/api/getFanEntitlement?creatorId=${encodeURIComponent(creator.creatorId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (gen !== entitlementFetchGen.current) return;
      if (!res.ok) {
        return;
      }
      const nextUnlockedProducts = Array.isArray((data as { unlockedProductIds?: string[] }).unlockedProductIds)
        ? (data as { unlockedProductIds: string[] }).unlockedProductIds
        : [];
      const nextUnlockedPosts =
        Array.isArray((data as { unlockedFanPostIds?: string[] }).unlockedFanPostIds)
          ? (data as { unlockedFanPostIds: string[] }).unlockedFanPostIds
          : [];
      const nextUnlockedStreams =
        Array.isArray((data as { unlockedLiveStreamIds?: string[] }).unlockedLiveStreamIds)
          ? (data as { unlockedLiveStreamIds: string[] }).unlockedLiveStreamIds
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
      setUnlockedLiveStreamIds(nextUnlockedStreams);
      setLimitedMemberAccess(
        !!(data as { limitedMemberAccess?: boolean }).limitedMemberAccess ||
          nextUnlockedProducts.length > 0 ||
          nextUnlockedPosts.length > 0 ||
          nextUnlockedStreams.length > 0
      );
      setFanPageAdminBypass(!!(data as { fanPageAdminBypass?: boolean }).fanPageAdminBypass);
    } catch {
      /* keep prior entitlement on transient failures */
    } finally {
      /**
       * `onSuccess` often calls this while the `[creatorId, isLoggedIn]` entitlement effect is still in flight.
       * That effect bumps the same gen counter — its `finally` then skips (stale gen) and never cleared bootstrap.
       * Mirror the effect’s release so paid storefronts don’t stick on the post-login Loading spinner.
       */
      if (gen === entitlementFetchGen.current) {
        setEntitlementLoading(false);
        setEntitlementBootstrapResolved(true);
        entitlementHydratingRef.current = false;
      }
    }
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

  useEffect(() => {
    if (typeof window === "undefined" || !creator?.creatorId || !isLoggedIn) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("live_stream_ticket") !== "1") return;
    if (params.get("session_id")) return;
    void refetchMemberEntitlement();
    params.delete("live_stream_ticket");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (qs ? `?${qs}` : "") + (window.location.hash || "")
    );
  }, [creator?.creatorId, isLoggedIn, refetchMemberEntitlement]);

  /** Stripe Billing Portal return: refetch membership (cancel @ period end, payment method, resume). */
  useEffect(() => {
    if (typeof window === "undefined" || !creator?.creatorId || !isLoggedIn) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing_sync") !== "1") return;
    void refetchMemberEntitlement();
    params.delete("billing_sync");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (qs ? `?${qs}` : "") + (window.location.hash || "")
    );
  }, [creator?.creatorId, isLoggedIn, refetchMemberEntitlement]);

  /**
   * Stripe Checkout cancel URL: strip `checkout_cancel` / legacy `paywall` from the address bar (fans should not
   * see “paywall” in the URL) and remember suppress auto-checkout until they choose Subscribe again.
   */
  useLayoutEffect(() => {
    if (typeof window === "undefined" || !creator?.creatorId?.trim()) return;
    const params = new URLSearchParams(window.location.search);
    const legacyPaywall = params.get("paywall") === "1";
    const checkoutCancel = params.get("checkout_cancel") === "1";
    if (!legacyPaywall && !checkoutCancel) return;
    try {
      sessionStorage.setItem(fanStorefrontSkipAutoSubscribeKey(creator.creatorId), "1");
    } catch {
      /* ignore */
    }
    params.delete("paywall");
    params.delete("checkout_cancel");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (qs ? `?${qs}` : "") + (window.location.hash || "")
    );
  }, [creator?.creatorId]);

  /** Member checkout return: apply Firestore same as webhook when session_id is present (webhook delay). */
  useEffect(() => {
    if (typeof window === "undefined" || !creator?.creatorId || !isLoggedIn || !auth.currentUser) return;
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");
    const purchaseSync = params.get("purchase_sync") === "1";
    const postUnlock = params.get("post_unlock") === "1";
    const liveStreamTicket = params.get("live_stream_ticket") === "1";
    const treatSuccess = params.get("treat_success") === "1";
    if (!sid || (!purchaseSync && !postUnlock && !liveStreamTicket && !treatSuccess)) return;

    let cancelled = false;
    checkoutReturnSyncInFlightRef.current = true;
    (async () => {
      try {
        const token = await auth.currentUser!.getIdToken(true);
        let allowPublicFallbackSync = false;
        let allowGuestClaim = false;
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
          if (code === "USE_CLAIM_GUEST") {
            allowGuestClaim = true;
            break;
          }
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
        if (!synced && allowGuestClaim) {
          const claimRes = await fetch("/api/claimGuestPurchase", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ sessionId: sid }),
          });
          const claimData = await claimRes.json().catch(() => ({}));
          if (cancelled) return;
          if (claimRes.ok) {
            synced = true;
            setTreatLinkMessage(
              (claimData as { merged?: boolean }).merged
                ? "Your purchase is linked to your account. You'll see it in your member area; you can still subscribe anytime for full access."
                : "You're all set — this purchase was already linked to your account."
            );
          } else {
            setTreatLinkMessage((claimData as { error?: string }).error || "Could not link purchase to your account.");
          }
        }
        if (!synced) {
          // Keep URL params so a refresh can retry sync.
          return;
        }
        await refetchMemberEntitlement();
        setTreatsRefreshNonce((n) => n + 1);
        setFanPurchasesRefreshNonce((n) => n + 1);
        const url = new URL(window.location.href);
        url.searchParams.delete("session_id");
        url.searchParams.delete("purchase_sync");
        url.searchParams.delete("post_unlock");
        url.searchParams.delete("live_stream_ticket");
        url.searchParams.delete("tip");
        url.searchParams.delete("treat_success");
        const qs = url.searchParams.toString();
        window.history.replaceState({}, "", url.pathname + (qs ? `?${qs}` : "") + (url.hash || ""));
      } catch (e) {
        if (!cancelled) console.warn("member checkout sync", e);
        void refetchMemberEntitlement();
      } finally {
        if (!cancelled) checkoutReturnSyncInFlightRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
      checkoutReturnSyncInFlightRef.current = false;
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

  const fetchTreats = useCallback(async (options?: { silent?: boolean }) => {
    if (!creator?.creatorId) return;
    const silent = options?.silent === true;
    if (!silent) setTreatsLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch(
        `/api/products?creatorId=${encodeURIComponent(creator.creatorId)}&context=member`,
        {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (res.ok) {
        const data = await res.json();
        setTreatsProducts(normalizeTreatProductsFromApi(data.products));
        return;
      }
      const fallback = await loadTreatProductsViaFirestore(creator.creatorId, "member");
      setTreatsProducts(normalizeTreatProductsFromApi(fallback));
    } catch {
      try {
        const fallback = await loadTreatProductsViaFirestore(creator.creatorId, "member");
        setTreatsProducts(normalizeTreatProductsFromApi(fallback));
      } catch {
        setTreatsProducts([]);
      }
    } finally {
      if (!silent) setTreatsLoading(false);
    }
  }, [creator?.creatorId]);

  useEffect(() => {
    if ((activeTab === "treats" || activeTab === "purchases") && creator?.creatorId) {
      void fetchTreats(treatsProducts.length > 0 ? { silent: true } : undefined);
    }
  }, [activeTab, creator?.creatorId, fetchTreats, treatsRefreshNonce, treatsProducts.length, unlockedProductIds]);

  const fetchFanPurchases = useCallback(
    async (limitNum: number, mode: "initial" | "more" = "initial") => {
      if (!creator?.creatorId || !isLoggedIn) return;
      const capped = Math.min(Math.max(limitNum, 10), FAN_MEMBER_PURCHASES_MAX);
      if (mode === "initial") {
        setFanPurchasesLoading(true);
        setFanPurchasesHasMore(false);
      } else setFanPurchasesLoadingMore(true);
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        const url = `/api/fanPurchases?creatorId=${encodeURIComponent(creator.creatorId)}&limit=${capped}`;
        const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const data = await res.json().catch(() => ({} as { purchases?: FanDeliveryPurchase[]; error?: string }));
        if (res.ok) {
          const list = Array.isArray(data.purchases) ? data.purchases : [];
          setFanPurchases(list);
          setFanPurchasesQueryLimit(capped);
          setFanPurchasesHasMore(list.length >= capped && capped < FAN_MEMBER_PURCHASES_MAX);
          return;
        }

      // Local/dev fallback when API route is unavailable in current runtime.
      if ((res.status === 404 || res.status === 405) && auth.currentUser?.uid) {
        const fanUid = auth.currentUser.uid;
        const fanEmail = (auth.currentUser.email || "").trim().toLowerCase();
        const ordersByFanId = query(
          collection(db, "orders"),
          where("creatorId", "==", creator.creatorId),
          where("fanId", "==", fanUid),
          limit(300)
        );
        const ordersByFanEmail =
          fanEmail &&
          query(
            collection(db, "orders"),
            where("creatorId", "==", creator.creatorId),
            where("fanEmail", "==", fanEmail),
            limit(300)
          );
        const [byIdSnap, byEmailSnap] = ordersByFanEmail
          ? await Promise.all([getDocs(ordersByFanId), getDocs(ordersByFanEmail)])
          : [await getDocs(ordersByFanId), null];
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
            streamId: typeof raw.streamId === "string" ? raw.streamId.trim() || null : null,
            productTitle: typeof raw.productTitle === "string" ? raw.productTitle : undefined,
            amountCents: Number.isFinite(Number(raw.amountCents)) ? Math.max(0, Math.round(Number(raw.amountCents))) : 0,
            status: typeof raw.status === "string" ? raw.status : "paid",
            createdAt: toIsoFromUnknownDate(raw.createdAt),
            ...fanOrderScheduleFields(normalizedType, raw),
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
            ...(() => {
              const items = orderDeliveryMediaItems({
                deliveryItems: raw.deliveryItems,
                deliveryUrl: raw.deliveryUrl,
                deliveryType: raw.deliveryType,
              });
              return {
                deliveryItems: items.length > 0 ? items : undefined,
                digitalPackFulfillment: raw.digitalPackFulfillment === true ? true : undefined,
              };
            })(),
          });
        }
        if (byEmailSnap) {
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
              streamId: typeof raw.streamId === "string" ? raw.streamId.trim() || null : null,
              productTitle: typeof raw.productTitle === "string" ? raw.productTitle : undefined,
              amountCents: Number.isFinite(Number(raw.amountCents))
                ? Math.max(0, Math.round(Number(raw.amountCents)))
                : 0,
              status: typeof raw.status === "string" ? raw.status : "paid",
              createdAt: toIsoFromUnknownDate(raw.createdAt),
              ...fanOrderScheduleFields(normalizedType, raw),
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
              ...(() => {
                const items = orderDeliveryMediaItems({
                  deliveryItems: raw.deliveryItems,
                  deliveryUrl: raw.deliveryUrl,
                  deliveryType: raw.deliveryType,
                });
                return {
                  deliveryItems: items.length > 0 ? items : undefined,
                  digitalPackFulfillment: raw.digitalPackFulfillment === true ? true : undefined,
                };
              })(),
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
              o.type === "subscription" ||
              o.type === "live_stream_ticket"
          )
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .slice(0, capped);
        setFanPurchases(fallbackRows);
        setFanPurchasesQueryLimit(capped);
        setFanPurchasesHasMore(fallbackRows.length >= capped && capped < FAN_MEMBER_PURCHASES_MAX);
        return;
      }

      showToast(data.error || "Could not load purchases.", "error");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load purchases.", "error");
    } finally {
      if (mode === "initial") setFanPurchasesLoading(false);
      else setFanPurchasesLoadingMore(false);
    }
  },
  [creator?.creatorId, isLoggedIn, showToast]);

  useEffect(() => {
    const loadPurchasesForStore =
      activeTab === "treats" && isLoggedIn && creator?.creatorId && unlockedProductIds.length > 0;
    if ((activeTab === "purchases" || loadPurchasesForStore) && isLoggedIn && creator?.creatorId) {
      void fetchFanPurchases(FAN_MEMBER_PURCHASES_PAGE, "initial");
    }
  }, [
    activeTab,
    creator?.creatorId,
    fanPurchasesRefreshNonce,
    fetchFanPurchases,
    isLoggedIn,
    unlockedProductIds.length,
  ]);

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
          `/api/products?creatorId=${encodeURIComponent(creator.creatorId)}&context=landing`,
          { cache: "no-store" }
        );
        if (res.ok) {
          if (cancelled) return;
          const data = await res.json();
          if (!cancelled) {
            setLandingTreatsProducts(normalizeTreatProductsFromApi(data.products));
          }
          return;
        }
        const fallback = await loadTreatProductsViaFirestore(creator.creatorId, "landing");
        if (!cancelled) {
          setLandingTreatsProducts(normalizeTreatProductsFromApi(fallback));
        }
      } catch {
        try {
          const fallback = await loadTreatProductsViaFirestore(creator.creatorId, "landing");
          if (!cancelled) setLandingTreatsProducts(normalizeTreatProductsFromApi(fallback));
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
    landingTreatsRefreshNonce,
  ]);

  /** Legacy landing-store checkout returned before sign-in; prompt before claim can run. */
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
    if (checkoutReturnSyncInFlightRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");
    const ok = params.get("treat_success") === "1";
    if (
      params.get("purchase_sync") === "1" ||
      params.get("post_unlock") === "1" ||
      params.get("live_stream_ticket") === "1"
    ) {
      return;
    }
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
              const nextUnlockedStreams =
                Array.isArray((ent as { unlockedLiveStreamIds?: string[] }).unlockedLiveStreamIds)
                  ? (ent as { unlockedLiveStreamIds: string[] }).unlockedLiveStreamIds
                  : [];
              setSubscribed(!!(ent as { subscribed?: boolean }).subscribed);
              setUnlockedProductIds(nextUnlockedProducts);
              setUnlockedFanPostIds(nextUnlockedPosts);
              setUnlockedLiveStreamIds(nextUnlockedStreams);
              setLimitedMemberAccess(
                !!(ent as { limitedMemberAccess?: boolean }).limitedMemberAccess ||
                  nextUnlockedProducts.length > 0 ||
                  nextUnlockedPosts.length > 0 ||
                  nextUnlockedStreams.length > 0
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

  const startSubscriptionCheckout = async (opts?: { auto?: boolean }): Promise<boolean> => {
    const isAuto = opts?.auto === true;
    if (!creator?.creatorId || !auth.currentUser) {
      if (isAuto) return false;
      setFanAuthPaidDetailsStep(false);
      setFanAuthView("signup");
      setFanAuthOpen(true);
      return false;
    }
    try {
      sessionStorage.removeItem(fanStorefrontSkipAutoSubscribeKey(creator.creatorId));
    } catch {
      /* ignore */
    }
    if (isAuto) {
      autoSubscribeRedirectingRef.current = true;
    }
    if (!creatorStorefrontActive) {
      showToast(storefrontSuspendedMessage, "info");
      return false;
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
            u.searchParams.set("checkout_cancel", "1");
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
      return true;
    } catch (e) {
      if (!isAuto) {
        showToast(e instanceof Error ? e.message : "Could not open checkout.", "error");
      } else {
        showToast(
          e instanceof Error ? e.message : "Could not open checkout. Tap Join to try again.",
          "info",
        );
      }
      return false;
    } finally {
      setSubscribing(false);
      if (isAuto) {
        autoSubscribeRedirectingRef.current = false;
      }
    }
  };

  const handleSubscribe = async () => {
    if (creator?.monetization?.freeAccessEnabled !== true && auth.currentUser) {
      setFanAuthPaidDetailsStep(true);
      setFanAuthView("signup");
      setFanAuthOpen(true);
      return;
    }
    await startSubscriptionCheckout();
  };

  const handleJoinFree = async () => {
    if (!creatorStorefrontActive) {
      showToast(storefrontSuspendedMessage, "info");
      return;
    }
    if (!creator?.creatorId || !auth.currentUser) {
      setFanAuthPaidDetailsStep(false);
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
        setUnlockedLiveStreamIds(
          Array.isArray((ent as { unlockedLiveStreamIds?: string[] }).unlockedLiveStreamIds)
            ? (ent as { unlockedLiveStreamIds: string[] }).unlockedLiveStreamIds
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

  const formatRemaining = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds || 0));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const runFanCancelAtPeriodEnd = async () => {
    if (!creator?.creatorId || !auth.currentUser) return;
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
      setCancelMembershipMessage("Membership cancellation is scheduled. You keep access until the end of this billing period.");
      setMembershipManageModalOpen(false);
    } catch (e) {
      setCancelMembershipMessage(e instanceof Error ? e.message : "Failed to cancel membership.");
    } finally {
      setCancelMembershipLoading(false);
    }
  };

  const handleScheduleCancelFromModal = async () => {
    if (!creator?.creatorId || !auth.currentUser) return;
    if (
      !window.confirm(
        "Schedule cancellation at the end of your current billing period? You'll keep full access until then and won't be charged again.",
      )
    ) {
      return;
    }
    await runFanCancelAtPeriodEnd();
  };

  const handleOpenBillingPortal = async () => {
    if (!creator?.creatorId || !auth.currentUser) return;
    setBillingPortalLoading(true);
    setBillingPortalError(null);
    try {
      const token = await auth.currentUser.getIdToken(true);
      /** Stripe portal does not pass session_id; flag lets us refetch entitlement immediately on return (webhook latency). */
      const returnUrl =
        typeof window !== "undefined"
          ? (() => {
              const u = new URL(window.location.href);
              u.searchParams.set("billing_sync", "1");
              return u.toString();
            })()
          : "";
      const res = await fetch("/api/createFanBillingPortalSession", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ creatorId: creator.creatorId, returnUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Could not open billing portal");
      const url = (data as { url?: string }).url;
      if (!url) throw new Error("No portal URL returned");
      window.location.href = url;
    } catch (e) {
      setBillingPortalError(e instanceof Error ? e.message : "Could not open billing portal");
    } finally {
      setBillingPortalLoading(false);
    }
  };

  const handleOpenProfile = () => {
    setProfileMenuOpen(false);
    setActiveTab("profile");
    if (creator?.handle?.trim()) {
      applyFanStorefrontMemberUrl("profile", { showLanding: false, creatorHandle: creator.handle });
    }
  };

  const openFanHelpChooser = () => {
    setProfileMenuOpen(false);
    setFanHelpFlow("chooser");
  };

  const closeFanHelpFlow = () => setFanHelpFlow("closed");

  const handleLogout = async () => {
    setProfileMenuOpen(false);
    try {
      clearLocalPushRegistrationState();
      await auth.signOut();
      setIsLoggedIn(false);
      setMembershipType(null);
      if (creator?.handle) window.location.href = `/${creator.handle}`;
    } catch {
      showToast("Could not log out. Try again.", "error");
    }
  };

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!isLoggedIn || !uid || previewMember) {
      setMemberProfileDocSynced(false);
      return;
    }
    let cancelled = false;
    const userRef = doc(db, "users", uid);
    const applyFallbackFromAuth = () => {
      const dn = auth.currentUser?.displayName || "";
      setProfileDraft({
        firstName: dn ? dn.split(/\s+/)[0] : "",
        lastName: dn.includes(" ") ? dn.split(/\s+/).slice(1).join(" ") : "",
        photoURL: auth.currentUser?.photoURL || "",
      });
      setProfileInitial({
        firstName: dn ? dn.split(/\s+/)[0] : "",
        lastName: dn.includes(" ") ? dn.split(/\s+/).slice(1).join(" ") : "",
        photoURL: auth.currentUser?.photoURL || "",
      });
      setUsernameDraft("");
      setUsernameInitial("");
      setUsernameState("idle");
      setUsernameMsg("");
      setMemberProfileDocSynced(true);
    };
    const unsub = onSnapshot(
      userRef,
      (snap) => {
        if (cancelled) return;
        setMemberProfileDocSynced(true);
        const d = (snap.data() || {}) as Record<string, unknown>;
        const parsed = parseFanMemberProfileFromUserDoc(
          d,
          snap.exists(),
          auth.currentUser?.displayName,
          auth.currentUser?.photoURL
        );
        const { isDirty, usernameDraft: ud, usernameInitial: ui } = profileUserDocSyncRef.current;
        if (!isDirty) {
          setProfileDraft({
            firstName: parsed.firstName,
            lastName: parsed.lastName,
            photoURL: parsed.photoURL,
          });
          setProfileInitial({
            firstName: parsed.firstName,
            lastName: parsed.lastName,
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
  }, [isLoggedIn, auth.currentUser?.uid, previewMember]);

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
      const photoTrim = (profileDraft.photoURL || "").trim();
      await setDoc(
        doc(db, "users", auth.currentUser.uid),
        {
          firstName,
          lastName,
          displayName,
          bio: deleteField(),
          memberBio: deleteField(),
          ...(photoTrim
            ? { photoURL: photoTrim, avatar: photoTrim }
            : { photoURL: deleteField(), avatar: deleteField() }),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      await updateProfile(auth.currentUser, {
        displayName,
        photoURL: photoTrim ? photoTrim : null,
      });
      try {
        await reload(auth.currentUser);
      } catch {
        /* ignore reload failures */
      }
      if (nextUsername) {
        setUsernameInitial(nextUsername);
        setUsernameState("current");
        setUsernameMsg("Your current username.");
      } else {
        setUsernameInitial("");
        setUsernameState("idle");
        setUsernameMsg("");
      }
      setProfileDraft({
        firstName,
        lastName,
        photoURL: photoTrim ? photoTrim : "",
      });
      setProfileInitial({
        firstName,
        lastName,
        photoURL: photoTrim ? photoTrim : "",
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
        clearLocalPushRegistrationState();
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

  const fetchDmThreadAndMessages = useCallback(async (opts?: { silent?: boolean; threadId?: string; messageLimit?: number }) => {
    if (!creator?.creatorId || !auth.currentUser || activeTab !== "messages") return;
    const silent = opts?.silent === true;
    const messageLimit = Math.min(Math.max(opts?.messageLimit ?? dmMessageLimitRef.current, 1), 200);
    const requestedThreadId = typeof opts?.threadId === "string" ? opts.threadId.trim() : "";
    // Silent refreshes should not invalidate an in-flight foreground load token.
    const gen = silent ? dmThreadFetchGen.current : ++dmThreadFetchGen.current;
    if (!silent) {
      setDmLoading(true);
      dmScrollBottomAfterForegroundLoadRef.current = true;
    }
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
          `/api/fanDmMessages?threadId=${encodeURIComponent(withCreator.id)}&limit=${messageLimit}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (gen !== dmThreadFetchGen.current) return;
        const msgData = await msgRes.json().catch(() => ({}));
        const incomingMsgs = Array.isArray(msgData.messages) ? (msgData.messages as FanDmMessage[]) : [];
        const shouldPinAfterUpdate =
          dmScrollBottomAfterForegroundLoadRef.current ||
          dmAutoStickToBottomRef.current ||
          dmIsNearBottom(dmMessagesListRef.current);
        setDmMessages((prev) => {
          if (fanDmMessagesEqualish(prev, incomingMsgs)) return prev;
          if (shouldPinAfterUpdate) dmForceScrollBottomRef.current = true;
          return incomingMsgs;
        });
        if (msgRes.ok) {
          setDmHasMoreOlder((msgData as { hasMoreOlder?: boolean }).hasMoreOlder === true);
          if (typeof opts?.messageLimit === "number") setDmMessageLimit(messageLimit);
          const responseFanId =
            typeof (msgData as { fanId?: unknown }).fanId === "string"
              ? (msgData as { fanId: string }).fanId.trim()
              : undefined;
          void fanDmMarkReadAfterOpen({
            threadId: withCreator.id,
            responseFanId,
            authUid: auth.currentUser?.uid ?? null,
            getIdToken: () => auth.currentUser!.getIdToken().then((t) => t || null),
          });
        }
        const raw = msgData.labels as { fan?: unknown; creator?: unknown } | undefined;
        const nextLabels =
          raw && typeof raw.fan === "string" && typeof raw.creator === "string"
            ? { fan: raw.fan, creator: raw.creator }
            : null;
        setDmLabels((prev) =>
          prev?.fan === nextLabels?.fan && prev?.creator === nextLabels?.creator ? prev : nextLabels
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

  const loadMoreFanDmMessages = useCallback(async () => {
    if (!dmHasMoreOlder || dmLoadingOlder) return;
    if (dmMessages.length === 0) return;
    const next = Math.min(dmMessageLimit + 50, 200);
    if (next <= dmMessageLimit) return;
    const listEl = dmMessagesListRef.current;
    const prevScrollHeight = listEl?.scrollHeight ?? 0;
    const prevScrollTop = listEl?.scrollTop ?? 0;
    setDmLoadingOlder(true);
    try {
      await fetchDmThreadAndMessages({ silent: true, messageLimit: next });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = dmMessagesListRef.current;
          if (!el || prevScrollHeight <= 0) return;
          el.scrollTop = el.scrollHeight - prevScrollHeight + prevScrollTop;
        });
      });
    } finally {
      setDmLoadingOlder(false);
    }
  }, [dmHasMoreOlder, dmLoadingOlder, dmMessageLimit, dmMessages.length, fetchDmThreadAndMessages]);

  useEffect(() => {
    setDmThread(null);
    setDmMessages([]);
    setDmLabels(null);
    setDmLiveSession(null);
    setDmPreferredSessionId(null);
    setDmMessageLimit(50);
    setDmHasMoreOlder(false);
  }, [creator?.creatorId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const threadId = new URLSearchParams(window.location.search).get("threadId")?.trim();
    if (!threadId) return;
    setDmPreferredThreadId(threadId);
    setActiveTab("messages");
  }, []);

  useEffect(() => {
    if (activeTab === "messages" && creator?.creatorId && isLoggedIn) {
      void fetchDmThreadAndMessages({ messageLimit: 50 });
    }
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
    let timeoutId: number | undefined;

    const isSessionLive = (s: DmLiveSession | null) =>
      s != null && (s.status === "active" || s.status === "paused");

    const tick = async (): Promise<boolean> => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return false;
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
        if (cancelled) return false;
        const next = (data as { session?: DmLiveSession | null }).session || null;
        const pref = dmPreferredSessionId?.trim();
        if (next && pref && next.id === pref) {
          setDmPreferredSessionId(null);
        }
        if (!isSessionLive(next)) {
          setDmLiveSession(null);
          return false;
        }
        setDmLiveSession(next);
        return true;
      } catch {
        if (!cancelled) setDmLiveSession(null);
        return false;
      }
    };

    const schedule = (delayMs: number) => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        void tick().then((live) => {
          if (cancelled) return;
          schedule(live ? 1000 : 5000);
        });
      }, delayMs);
    };

    void tick().then((live) => {
      if (!cancelled) schedule(live ? 1000 : 5000);
    });

    const resync = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      void tick().then((live) => {
        if (cancelled) return;
        schedule(live ? 1000 : 5000);
      });
    };
    window.addEventListener("focus", resync);
    document.addEventListener("visibilitychange", resync);

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      window.removeEventListener("focus", resync);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [activeTab, creator?.creatorId, isLoggedIn, dmThread?.id, dmPreferredSessionId, auth.currentUser]);

  useEffect(() => {
    if (activeTab !== "messages") {
      setDmPendingAttachments([]);
      setDmPendingAttachmentUploading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setDmPendingAttachments([]);
    setDmPendingAttachmentUploading(false);
  }, [creator?.creatorId]);

  useLayoutEffect(() => {
    if (activeTab !== "messages" || dmLoading) return;
    const listEl = dmMessagesListRef.current;
    if (!listEl) {
      if (dmScrollBottomAfterForegroundLoadRef.current) dmScrollBottomAfterForegroundLoadRef.current = false;
      return;
    }
    if (dmScrollBottomAfterForegroundLoadRef.current) {
      dmScrollBottomAfterForegroundLoadRef.current = false;
      listEl.scrollTop = listEl.scrollHeight;
      dmAutoStickToBottomRef.current = true;
      return;
    }

    if (dmForceScrollBottomRef.current) {
      dmForceScrollBottomRef.current = false;
      listEl.scrollTop = listEl.scrollHeight;
      dmAutoStickToBottomRef.current = true;
      return;
    }

    if (dmComposerFocusedRef.current) return;

    if (!dmAutoStickToBottomRef.current) return;
    if (!dmIsNearBottom(listEl)) {
      dmAutoStickToBottomRef.current = false;
      return;
    }
    // Only adjust scroll on the DM list — scrollIntoView can scroll ancestor/page and feel like a "jump".
    listEl.scrollTop = listEl.scrollHeight;
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

  const sendDmWithPayload = async (content: string, attachments: DmAttachmentItem[]) => {
    if (!creator?.creatorId || !auth.currentUser) return;
    if (!content.trim() && attachments.length === 0) return;
    setDmSending(true);
    const prevInput = dmInput;
    setDmInput("");
    try {
      const token = await auth.currentUser.getIdToken(true);
      const body: Record<string, unknown> = {
        creatorId: creator.creatorId,
        fanId: auth.currentUser.uid,
        content: content.trim(),
      };
      if (dmThread && dmThread.creatorId === creator.creatorId) {
        body.threadId = dmThread.id;
      }
      if (attachments.length === 1) {
        body.attachmentUrl = attachments[0].url;
        body.attachmentType = attachments[0].type;
      } else if (attachments.length > 1) {
        body.attachments = attachments.map((a) => ({ url: a.url, type: a.type }));
      }
      const res = await fetch("/api/fanDmSend", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to send");
      dmForceScrollBottomRef.current = true;
      await fetchDmThreadAndMessages({ silent: true });
      setDmPendingAttachments([]);
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
    if (!dmInput.trim() && dmPendingAttachments.length === 0) return;
    await sendDmWithPayload(dmInput.trim(), dmPendingAttachments);
  };

  const removeDmPendingAttachmentAt = (index: number) => {
    setDmPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const onDmFileSelected: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length || !auth.currentUser) return;
    const room = DM_MAX_ATTACHMENTS_PER_MESSAGE - dmPendingAttachments.length;
    if (room <= 0) {
      showToast?.(`You can add up to ${DM_MAX_ATTACHMENTS_PER_MESSAGE} files per message.`, "info");
      return;
    }
    const slice = files.slice(0, room);
    if (slice.length < files.length) {
      showToast?.(`Only ${room} more file(s) allowed this message (max ${DM_MAX_ATTACHMENTS_PER_MESSAGE}).`, "info");
    }
    const allowed = slice;
    if (!allowed.length) return;
    setDmPendingAttachmentUploading(true);
    try {
      const uploaded: DmAttachmentItem[] = [];
      for (const file of allowed) {
        const { url, attachmentType: type } = await uploadFanDmAttachment(auth.currentUser.uid, file);
        uploaded.push({ url, type });
      }
      setDmPendingAttachments((prev) => [...prev, ...uploaded]);
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
          setDmPendingAttachments((prev) => {
            if (prev.length >= DM_MAX_ATTACHMENTS_PER_MESSAGE) {
              showToast?.(`Max ${DM_MAX_ATTACHMENTS_PER_MESSAGE} attachments per message.`, "info");
              return prev;
            }
            return [...prev, { url, type: "audio" as const }];
          });
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
  const memberVisualTheme = useMemo(
    () => storefrontMemberThemeColors(creator?.theme, { primary: defaultPrimary, background: defaultBg }),
    [creator?.theme]
  );

  // Membership gating values must be computed before any early return to keep hook order stable.
  const creatorRequiresPaidMembership = creator?.monetization?.freeAccessEnabled !== true;
  const creatorStorefrontActive = creator?.storefrontActive !== false;
  const storefrontSuspendedMessage =
    creator?.storefrontSuspendedMessage?.trim() || STOREFRONT_SUSPENDED_PUBLIC_MESSAGE;

  useEffect(() => {
    if (!creatorStorefrontActive && activeTab === "treats") {
      setActiveTab("feed");
    }
  }, [creatorStorefrontActive, activeTab]);

  const hasPaidMembershipBase = subscribed && membershipType === "paid";
  const paidPageUnsubscribedBase = creatorRequiresPaidMembership && membershipType !== "paid";
  const hasAccessByCurrentMembershipBase =
    subscribed && (creator?.monetization?.freeAccessEnabled === true || hasPaidMembershipBase);
  const hasUnlockedPurchases =
    unlockedProductIds.length > 0 || unlockedFanPostIds.length > 0 || unlockedLiveStreamIds.length > 0;
  const deliveredOrPurchasedProductIdSet = useMemo(() => {
    const out = new Set<string>();
    for (const o of fanPurchases) {
      if (typeof o.productId === "string" && o.productId.trim()) out.add(o.productId.trim());
    }
    return out;
  }, [fanPurchases]);
  /** Order delivery URLs for owned digital packs (fallback when /api/products was fetched without auth). */
  const packDeliveryItemsByProductId = useMemo(() => {
    const out = new Map<string, import("../types").DigitalPackMediaItem[]>();
    for (const o of fanPurchases) {
      const pid = typeof o.productId === "string" ? o.productId.trim() : "";
      if (!pid) continue;
      const items = parseDigitalPackMediaItems(o.deliveryItems);
      if (items.length === 0) continue;
      const prev = out.get(pid);
      if (!prev || items.length >= prev.length) out.set(pid, items);
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
  const needsPaidUpgrade = fanPageAdminBypass || previewMember ? false : needsPaidUpgradeBase;
  const purchaseOnlyAccess = fanPageAdminBypass ? false : purchaseOnlyAccessBase;
  const hasAccessByCurrentMembership = fanPageAdminBypass
    ? true
    : hasAccessByCurrentMembershipBase || purchaseOnlyAccess;
  const forceCreatorPreviewLanding = forcePublicLanding && isViewingOwnStorefront;
  const hasMemberAreaAccess = hasAccessByCurrentMembership || purchaseOnlyAccess;
  /** Paid wall: show unified membership modal (active = portal + cancel; lapsed = subscribe again + portal). */
  const showMembershipHubEntry =
    !fanPageAdminBypass &&
    creatorRequiresPaidMembership &&
    creator?.monetization?.freeAccessEnabled !== true &&
    hasMemberAreaAccess;
  const canViewFeed =
    fanPageAdminBypass || previewMember || !creatorRequiresPaidMembership || hasPaidMembership;
  const showLanding = previewMember
    ? false
    : forceCreatorPreviewLanding || !isLoggedIn || !hasMemberAreaAccess;
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
    if (!fanAuthPendingHubNavRef.current) return;
    if (previewMember || isViewingOwnStorefront) {
      fanAuthPendingHubNavRef.current = false;
      return;
    }
    if (showLanding) {
      fanAuthPendingHubNavRef.current = false;
      return;
    }
    if (!entitlementBootstrapResolved || !creator?.handle?.trim()) return;

    fanAuthPendingHubNavRef.current = false;
    const h = creator.handle.trim();
    const stripSearchKeys = ["landing", "login", "signup"] as const;

    if (hasPaidMembership || !creatorRequiresPaidMembership) {
      setActiveTab("feed");
      applyFanStorefrontMemberUrl("feed", {
        showLanding: false,
        creatorHandle: h,
        stripSearchKeys: [...stripSearchKeys],
      });
      return;
    }

    if (purchaseOnlyAccess || paidPageUnsubscribed) {
      setActiveTab("purchases");
      applyFanStorefrontMemberUrl("purchases", {
        showLanding: false,
        creatorHandle: h,
        stripSearchKeys: [...stripSearchKeys],
      });
      return;
    }

    if (!canViewFeed) {
      setActiveTab("purchases");
      applyFanStorefrontMemberUrl("purchases", {
        showLanding: false,
        creatorHandle: h,
        stripSearchKeys: [...stripSearchKeys],
      });
      return;
    }

    setActiveTab("feed");
    applyFanStorefrontMemberUrl("feed", {
      showLanding: false,
      creatorHandle: h,
      stripSearchKeys: [...stripSearchKeys],
    });
  }, [
    entitlementBootstrapResolved,
    showLanding,
    previewMember,
    isViewingOwnStorefront,
    fanPageAdminBypass,
    hasPaidMembership,
    creatorRequiresPaidMembership,
    purchaseOnlyAccess,
    paidPageUnsubscribed,
    canViewFeed,
    creator?.handle,
  ]);

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
      if (
        pending.get("purchase_sync") === "1" ||
        pending.get("post_unlock") === "1" ||
        pending.get("live_stream_ticket") === "1" ||
        pending.get("tip") === "success"
      ) {
        return;
      }
    }
    if (
      !previewMember &&
      (purchaseOnlyAccess || paidPageUnsubscribed) &&
      !["tip", "purchases", "profile"].includes(activeTab)
    ) {
      setActiveTab("purchases");
      if (creator?.handle?.trim()) {
        applyFanStorefrontMemberUrl("purchases", { showLanding: false, creatorHandle: creator.handle });
      }
    }
    if (typeof window !== "undefined" && creator?.creatorId?.trim()) {
      try {
        if (sessionStorage.getItem(fanStorefrontSkipAutoSubscribeKey(creator.creatorId)) === "1") {
          return;
        }
      } catch {
        /* ignore */
      }
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
    creator?.creatorId,
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
      if (p.type === "new_post") {
        goTab("feed");
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
      if (p.type === "creator_new_purchase") {
        goTab("purchases");
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
      if (p.type === "live_session_scheduled") {
        goTab("purchases");
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

  /** Fan signed in — sync hub URL/state; does not close FanAuthModal (used before Stripe continuation step). */
  const syncFanAuthSessionToHub = useCallback(() => {
    if (!creator) return;
    /** Auth state listener can lag one tick behind `signIn*`; avoid full-page `holdForAuthResolution` spinner after modal login. */
    if (auth.currentUser) {
      setAuthResolved(true);
      setFanAuthUid(auth.currentUser.uid);
    }
    setIsLoggedIn(true);
    if (creator.monetization?.freeAccessEnabled === true) {
      const nextTab: FanStorefrontMemberTab = "feed";
      setActiveTab(nextTab);
      if (typeof window !== "undefined" && creator.handle?.trim()) {
        applyFanStorefrontMemberUrl(nextTab, {
          showLanding: false,
          creatorHandle: creator.handle,
          stripSearchKeys: ["landing", "login", "signup"],
        });
      }
      setSubscribed(true);
      setMembershipType("free");
      return;
    }
    fanAuthPendingHubNavRef.current = true;
    if (typeof window !== "undefined" && creator.handle?.trim()) {
      const parsed = parseHandleFromPath();
      const fromPath = parsed.memberNavSlug ? memberPathSlugToTab(parsed.memberNavSlug) : null;
      const nextTab: FanStorefrontMemberTab = fromPath ?? "feed";
      setActiveTab(nextTab);
      applyFanStorefrontMemberUrl(nextTab, {
        showLanding: false,
        creatorHandle: creator.handle,
        stripSearchKeys: ["landing", "login", "signup"],
      });
    }
  }, [creator]);

  if (loading) {
    const loadingPrimary = memberVisualTheme.primary;
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
            <h1 className="text-xl font-semibold mb-2">{geoBlocked ? "Unavailable in your region" : "Not found"}</h1>
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
  /** Never fall back to creator storefront avatar — that showed the creator on the member menu when the fan had no photo. */
  const draftMemberPhoto = (profileDraft.photoURL || "").trim();
  const baselineMemberPhotoFromProfile = (profileInitial.photoURL || "").trim();
  /** Cleared in the form before save — keep initials in chrome (avoid stale baseline / OAuth fallback). */
  const photoRemovedUnsaved =
    isProfileDirty &&
    !(profileDraft.photoURL || "").trim() &&
    !!baselineMemberPhotoFromProfile;
  /** Same source as profile hero (`profileDraft.photoURL`) once Firestore has synced — never show baseline alone while draft photo is cleared. */
  const memberAvatarStored = photoRemovedUnsaved
    ? ""
    : memberProfileDocSynced
      ? draftMemberPhoto
      : draftMemberPhoto || baselineMemberPhotoFromProfile;
  /** OAuth/social photo only until Firestore sync — cleared Firestore photo must win over stale Auth.photoURL. */
  const oauthPhotoFallback =
    memberProfileDocSynced ? "" : (auth.currentUser?.photoURL || "").trim();
  const memberAvatar = (memberAvatarStored || oauthPhotoFallback).trim();
  const memberAvatarInitial = (() => {
    const fn = (profileDraft.firstName || "").trim();
    const ln = (profileDraft.lastName || "").trim();
    if (fn && ln) return (fn[0]! + ln[0]!).toUpperCase();
    if (fn) return fn.slice(0, 2).toUpperCase();
    const dn = (auth.currentUser?.displayName || "").trim();
    if (dn) {
      const parts = dn.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
      return dn.slice(0, 2).toUpperCase();
    }
    const em = (auth.currentUser?.email || "U").trim();
    return em.charAt(0).toUpperCase();
  })();
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
  const tipFooterEmojiResolved = resolveTipFooterEmoji(landingContent);
  const avatarCropStyle: React.CSSProperties = getAvatarCropStyle(creator.avatarObjectPosition);
  const creatorDmPrimary = formatCreatorDmBubblePrimaryLine(displayName, creator.handle);
  const creatorDmSecondary = formatCreatorDmBubbleSecondaryLine(displayName, creator.handle);
  const sjHeartEmojiCtx: SjHeartEmojiAccessContext = { creatorHandle: creator.handle };

  // Member hub colors — merged storefront theme from getCreatorByHandle (same source fans see on landing).
  const bg = memberVisualTheme.background;
  const primary = memberVisualTheme.primary;
  const memberThemeBorder = memberVisualTheme.border;
  const memberThemeText = memberVisualTheme.text;
  const memberThemeAccentHover = memberVisualTheme.accentHover;
  const profileFieldLabelColor =
    "color-mix(in srgb, var(--fan-primary, #6366f1) 72%, var(--fan-text, #1f2937) 28%)";
  const memberSinceLabel = (() => {
    const raw = auth.currentUser?.metadata?.creationTime;
    if (!raw) return "Unknown";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  })();
  const fanFacingSiteBrand = getFanFacingSiteTitle();
  const fanPanelSupportEmail =
    (import.meta.env.VITE_FAN_SUPPORT_EMAIL as string | undefined)?.trim() || "";
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
  // Nav tabs: order from sectionsOrder, filtered by sections (Messages always available when section is on).
  /** `?preview=member` — show full shell like a subscribed member (ignore purchase-only / paywall nav). */
  const baseMemberTabKeys = (sectionsOrder || ["feed", "treats", "tip", "messages"])
    .filter((key) => key !== "about" && key !== "saved" && (sections as Record<string, boolean>)?.[key] !== false)
    .filter((key) => creatorStorefrontActive || key !== "treats")
    .filter((key) => previewMember || !purchaseOnlyAccess || key === "treats" || key === "tip");
  const memberTabKeys = (() => {
    const keys = [...baseMemberTabKeys];
    if (!keys.includes("purchases")) {
      const treatsIdx = keys.indexOf("treats");
      const insertAt = treatsIdx >= 0 ? treatsIdx + 1 : keys.length;
      keys.splice(insertAt, 0, "purchases");
    }
    if (!previewMember && (purchaseOnlyAccess || paidPageUnsubscribed)) {
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
  // Do not force guest CTAs for normal fan sessions just because landing-preview flag is active.
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
                  <img
                    src={creatorAvatar}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover"
                    style={avatarCropStyle}
                    {...storefrontImageDownloadGuardProps}
                  />
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
      : `/${creator.handle}`;

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
            setFanAuthPaidDetailsStep(false);
            setFanAuthOpen(true);
          }}
          subscribing={subscribing}
          joiningFree={joiningFree}
          isLoggedIn={showGuestAuthCtasOnLanding ? false : isLoggedIn}
          onLogout={showGuestAuthCtasOnLanding ? undefined : handleLogout}
          primeLandingIntentBeforeLogoNavigation={showGuestAuthCtasOnLanding}
          publicTreatsOnLanding={creatorStorefrontActive && creator.publicTreatsOnLanding === true}
          sectionsTreatsEnabled={creatorStorefrontActive && creator.sections?.treats !== false}
          storefrontSuspended={!creatorStorefrontActive}
          storefrontSuspendedMessage={storefrontSuspendedMessage}
          landingTreatProducts={landingTreatsProducts}
          landingTreatsLoading={landingTreatsLoading}
          onRefreshLandingTreats={() => setLandingTreatsRefreshNonce((n) => n + 1)}
          treatLinkAccountMessage={treatLinkMessage}
          termsHref={storefrontTermsPath}
          privacyHref={storefrontPrivacyPath}
          homeHref={storefrontHomePath}
        />
        {fanAuthOpen && (
          <FanAuthModal
            isOpen={fanAuthOpen}
            onClose={() => {
              setFanAuthOpen(false);
              setFanAuthPaidDetailsStep(false);
            }}
            onSignupContinue={
              creator.monetization?.freeAccessEnabled === true
                ? undefined
                : async () => startSubscriptionCheckout({ auto: true })
            }
            startPaidMembershipDetailsStep={fanAuthPaidDetailsStep}
            onAuthSessionReady={syncFanAuthSessionToHub}
            onSuccess={() => {
              syncFanAuthSessionToHub();
              /** Free storefront: entitlement fetch can lag behind join; without this, showLanding stays true and fans stay on the landing page after "You're in!". */
              if (creator.monetization?.freeAccessEnabled === true) {
                setSubscribed(true);
                setMembershipType("free");
              }
              void refetchMemberEntitlement();
              setFanAuthOpen(false);
              setFanAuthPaidDetailsStep(false);
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
        {toast && <Toast message={toast.message} type={toast.type} />}
      </>
    );
  }

  const globalFont = memberVisualTheme.fontFamily || "Inter, sans-serif";

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
        "--fan-accent-hover": memberThemeAccentHover,
        "--fan-bg": bg,
        "--fan-text": memberThemeText,
        "--fan-border": memberThemeBorder,
      } as React.CSSProperties}
    >
      <FanHubHelpChooserModal
        isOpen={fanHelpFlow === "chooser"}
        onClose={closeFanHelpFlow}
        fanBrand={fanFacingSiteBrand}
        creatorDisplayName={typeof displayName === "string" ? displayName : ""}
        primaryColor={primary}
        onChooseReport={() => setFanHelpFlow("report")}
        onChooseContact={() => setFanHelpFlow("contact")}
      />
      <ReportProblemModal
        isOpen={fanHelpFlow === "report"}
        onClose={closeFanHelpFlow}
        onBack={() => setFanHelpFlow("chooser")}
        layout="contactPage"
        showDiagnosticsUi={false}
        pageLabelForReporting={echofluxContactPageLabel}
        additionalDiagnosticsLines={fanHubSupportDiagnosticsExtras}
        hubCreatorId={creator?.creatorId ?? null}
        accentHex={primary}
        contactEmail="contact@insightmediagroupllc.com"
        supportName="Insight Media Group LLC"
        panelSupportEmail={null}
        mode="inApp"
        onSubmitInApp={submitSupportProblem}
        onSubmitted={() => {
          setFanHelpFlow("closed");
          setActiveTab("profile");
          if (creator.handle?.trim()) {
            applyFanStorefrontMemberUrl("profile", { showLanding: false, creatorHandle: creator.handle });
          }
        }}
      />
      <ReportProblemModal
        isOpen={fanHelpFlow === "contact"}
        onClose={closeFanHelpFlow}
        onBack={() => setFanHelpFlow("chooser")}
        layout="contactPage"
        showDiagnosticsUi={false}
        mode="platform"
        platformInboxBucket="contact"
        pageLabelForReporting={echofluxContactPageLabel}
        additionalDiagnosticsLines={fanHubSupportDiagnosticsExtras}
        hubCreatorId={creator?.creatorId ?? null}
        accentHex={primary}
        supportName={fanFacingSiteBrand}
        panelSupportEmail={fanPanelSupportEmail || null}
        onSubmitted={() => {
          setFanHelpFlow("closed");
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
      {membershipManageModalOpen && creator ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="fan-membership-manage-title"
        >
          <div
            className="w-full max-w-lg rounded-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: "#fff", color: theme?.text || "#1f2937" }}
          >
            <h2 id="fan-membership-manage-title" className="text-lg font-bold mb-2">
              {hasPaidMembership ? "Manage your membership" : "Membership & billing"}
            </h2>
            {hasPaidMembership ? (
              <p className="text-sm mb-4 opacity-90 leading-relaxed">
                Update your payment method, cancel, or keep your subscription in Stripe&apos;s secure customer portal — or
                schedule cancellation at the end of your current period without leaving this page.
              </p>
            ) : (
              <p className="text-sm mb-4 opacity-90 leading-relaxed">
                You don&apos;t have an active paid membership right now. Subscribe again to unlock the full member hub, or
                open Stripe to update cards and view past invoices. Returning members can often resume from the portal as
                well.
              </p>
            )}

            {billingPortalError ? (
              <p
                className="text-sm mb-3 rounded-lg px-3 py-2"
                style={{ backgroundColor: "color-mix(in srgb, #b91c1c 12%, white)", color: "#991b1b" }}
              >
                {billingPortalError}
              </p>
            ) : null}

            <div className="flex flex-col gap-3">
              {!hasPaidMembership ? (
                <button
                  type="button"
                  className="w-full px-4 py-3 rounded-xl text-sm font-semibold text-white border-0 disabled:opacity-50"
                  style={{ backgroundColor: primary }}
                  disabled={billingPortalLoading || subscribing || joiningFree}
                  onClick={() => {
                    void startSubscriptionCheckout();
                  }}
                >
                  {subscribing ? "Opening…" : "Subscribe again"}
                </button>
              ) : null}

              <button
                type="button"
                className={`w-full px-4 py-3 rounded-xl text-sm font-semibold border disabled:opacity-50 ${
                  hasPaidMembership ? "text-white border-0" : ""
                }`}
                style={
                  hasPaidMembership
                    ? { backgroundColor: primary }
                    : { borderColor: `${primary}66`, color: primary, backgroundColor: `${primary}0a` }
                }
                disabled={billingPortalLoading || cancelMembershipLoading}
                onClick={() => {
                  void handleOpenBillingPortal();
                }}
              >
                {billingPortalLoading ? "Opening…" : "Open Stripe customer portal"}
              </button>
              <p className="text-xs opacity-75 -mt-1 mb-1">
                Stripe handles card updates, cancellation, and resuming your plan. You&apos;ll return here when you&apos;re
                done.
              </p>

              {hasPaidMembership ? (
                <div className="border-t border-gray-200 my-1 pt-3">
                  <button
                    type="button"
                    className="w-full px-4 py-3 rounded-xl text-sm font-semibold border disabled:opacity-50"
                    style={{ borderColor: `${primary}66`, color: primary, backgroundColor: `${primary}0a` }}
                    disabled={cancelMembershipLoading || billingPortalLoading}
                    onClick={() => {
                      void handleScheduleCancelFromModal();
                    }}
                  >
                    {cancelMembershipLoading ? "Updating…" : "Cancel at end of billing period (in app)"}
                  </button>
                  <p className="text-xs opacity-75 mt-2">
                    Schedules cancel at period end in Stripe immediately. You keep access until the date shown after you
                    confirm.
                  </p>
                </div>
              ) : null}

              <button
                type="button"
                className="w-full px-4 py-2.5 rounded-xl text-sm font-medium border mt-1"
                style={{ borderColor: `${primary}44`, color: primary }}
                disabled={billingPortalLoading || cancelMembershipLoading}
                onClick={() => setMembershipManageModalOpen(false)}
              >
                {hasPaidMembership ? "Keep my membership — close" : "Close"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {/* Member Header — witme wordmark only (no creator avatar / community subtitle) */}
      <header
        className="storefront-member-header storefront-member-header--leftnav"
        data-witme-member-header="wordmark-only"
        style={{
          backgroundColor: `color-mix(in srgb, ${primary} 8%, ${bg})`,
          borderBottom: `1px solid color-mix(in srgb, ${primary} 20%, ${memberThemeBorder})`,
        }}
      >
        <div className="storefront-member-header-row flex items-center justify-between px-4 sm:px-6 py-3 gap-2 min-w-0 max-w-[1360px] mx-auto w-full">
          <div className="storefront-header-left storefront-header-left--witme-wordmark flex items-center min-h-0 min-w-0">
            <WitmeHeaderLogo color={primary} className="h-10 w-auto max-w-[220px] shrink-0 sm:h-11" />
          </div>
          <nav className="storefront-header-nav">
            {memberTabKeys.map((key) => {
              const isTip = key === "tip";
              const storeTabInactive = key === "treats" && !creatorStorefrontActive;
              return (
                <Fragment key={key}>
                <button
                  type="button"
                  disabled={storeTabInactive}
                  onClick={() => {
                    if (storeTabInactive) return;
                    setActiveTabWithUrl(key as typeof activeTab);
                  }}
                  className={`storefront-nav-btn ${isTip ? "storefront-nav-tip" : ""} ${activeTab === key ? "active" : ""} ${storeTabInactive ? "opacity-50 cursor-not-allowed" : ""}`}
                  title={
                    storeTabInactive
                      ? "Store is closed while this creator renews EchoFlux"
                      : key === "saved"
                        ? "Saved posts"
                        : undefined
                  }
                  aria-disabled={storeTabInactive || undefined}
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
                {key === "messages" ? (
                  <MemberHubSocialLinksButton
                    socialLinks={creator?.socialLinks}
                    primary={primary}
                    variant="storefront"
                  />
                ) : null}
                </Fragment>
              );
            })}
            {!memberTabKeys.includes("messages") ? (
              <MemberHubSocialLinksButton
                socialLinks={creator?.socialLinks}
                primary={primary}
                variant="storefront"
              />
            ) : null}
          </nav>
          <div className="storefront-header-actions">
            {isLoggedIn && (
              <FanHubNotificationBell
                accentColor={primary}
                iconColor={theme?.text || "#6f4858"}
                className="storefront-header-notify-bell"
                onNavigate={handleFanHubNotificationNavigate}
                hidden={memberSuppressDmNotifications}
                showToast={showToast}
                enablePushOptIn={hasMemberAreaAccess && !previewMember}
                pushOptInCreatorName={typeof displayName === "string" ? displayName : ""}
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
                {memberAvatar && !memberProfilePhotoLoadFailed ? (
                  <img
                    src={memberAvatar}
                    alt=""
                    className="storefront-profile-menu-avatar"
                    style={avatarCropStyle}
                    onError={() => setMemberProfilePhotoLoadFailed(true)}
                    {...storefrontImageDownloadGuardProps}
                  />
                ) : (
                  <span className="storefront-profile-menu-avatar storefront-profile-menu-avatar-fallback">{memberAvatarInitial}</span>
                )}
              </button>
              {profileMenuOpen && (
                <div className="storefront-profile-menu-dropdown" role="menu">
                  <button type="button" role="menuitem" className="storefront-profile-menu-item" onClick={handleOpenProfile}>
                    Your profile
                  </button>
                  <button type="button" role="menuitem" className="storefront-profile-menu-item" onClick={openFanHelpChooser}>
                    Get in touch
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
                unlockedLiveStreamIds={unlockedLiveStreamIds}
                liveStreamPaidMemberTicketSkip={subscribed && membershipType === "paid"}
                fanPageAdminBypass={fanPageAdminBypass}
                previewMember={previewMember}
                onOpenSaved={() => setActiveTabWithUrl("saved")}
                tipsEnabled={creator.sections?.tip !== false}
                tipHeading={tipMemberCopy.heading}
                tipSubline={tipMemberCopy.subline}
                hubViewerComposeAvatarUrl={
                  fanAuthUid
                    ? memberProfilePhotoLoadFailed || !(memberAvatar || "").trim()
                      ? ""
                      : memberAvatar.trim()
                    : undefined
                }
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
                unlockedLiveStreamIds={unlockedLiveStreamIds}
                liveStreamPaidMemberTicketSkip={subscribed && membershipType === "paid"}
                fanPageAdminBypass={fanPageAdminBypass}
                previewMember={previewMember}
                onBackToFeed={() => setActiveTabWithUrl("feed")}
                hubViewerComposeAvatarUrl={
                  fanAuthUid
                    ? memberProfilePhotoLoadFailed || !(memberAvatar || "").trim()
                      ? ""
                      : memberAvatar.trim()
                    : undefined
                }
              />
            )}
            {activeTab === "treats" &&
              (previewMember || (!paidPageUnsubscribed && !purchaseOnlyAccess)) && (
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
                      const isPurchasingThis = purchasingId === productRowId;
                      /** Entitlement includes prior purchase; fans may buy again until quantity sells out (server-enforced). */
                      const buyLabel =
                        isPurchasingThis ? "Processing…" : owned ? "Buy again" : "Purchase";
                      const categoryLine = getTreatProductTypeDisplayLabel(p);
                      if (isDigitalPackProductType(p.type)) {
                        const packProduct = owned
                          ? mergeOwnedDigitalPackFulfillment(
                              p,
                              packDeliveryItemsByProductId.get(productRowId)
                            )
                          : p;
                        return (
                          <FanMemberDigitalPackTreatCard
                            key={`member-treat-${productRowId}-${index}`}
                            product={packProduct}
                            categoryLine={categoryLine}
                            owned={owned}
                            soldOut={soldOut}
                            isPurchasing={isPurchasingThis}
                            buyLabel={buyLabel}
                            priceLabel={formatPrice(p.priceCents)}
                            remainingLabel={hasLimit ? `${remaining} left` : null}
                            primaryColor={primary}
                            onPurchase={() => handlePurchase(productRowId)}
                            imageGuardProps={storefrontImageDownloadGuardProps}
                            videoGuardProps={storefrontVideoDownloadGuardProps}
                            audioGuardProps={storefrontAudioDownloadGuardProps}
                          />
                        );
                      }

                      return (
                        <div key={`member-treat-${productRowId}-${index}`} className="fan-member-treat-card">
                          {categoryLine ? <p className="fan-member-treat-type">{categoryLine}</p> : null}
                          <h3 className="fan-member-treat-title">{p.title}</h3>
                          {p.description ? (
                            <p className="fan-member-treat-desc">{p.description}</p>
                          ) : null}
                          <p className="fan-member-treat-price">{formatPrice(p.priceCents)}</p>
                          {hasLimit ? (
                            <p className="fan-member-treat-desc" style={{ marginTop: "-0.2rem" }}>
                              {remaining} left
                            </p>
                          ) : null}
                          <div className="fan-member-treat-action">
                            {soldOut ? (
                              <span className="fan-member-treat-owned">Sold out</span>
                            ) : (
                              <button
                                type="button"
                                disabled={isPurchasingThis}
                                onClick={() => handlePurchase(productRowId)}
                                className="fan-member-treat-buy"
                                style={{ backgroundColor: primary }}
                              >
                                {buyLabel}
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
                ) : (
                  <div
                    className={
                      memberPurchasesListCompact
                        ? "fan-member-purchases-compact"
                        : "fan-member-purchases-list fan-member-purchases-list--cards"
                    }
                  >
                    {fanPurchasesDisplayRows.map((o) => (
                      <FanMemberPurchaseRow
                        key={`order-${o.id}`}
                        o={o}
                        creatorId={creator?.creatorId}
                        primary={primary}
                        expanded={!memberPurchasesListCompact}
                      />
                    ))}
                    {legacyUnlockedTreatPurchases.map((p) => {
                      const categoryLine = getTreatProductTypeDisplayLabel(p);
                      const legacyBody = (
                        <>
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
                        </>
                      );
                      if (memberPurchasesListCompact) {
                        return (
                          <details key={p.id} className="fan-member-purchase-compact">
                            <summary className="fan-member-purchase-compact-summary">
                              {categoryLine ? (
                                <span className="fan-member-purchase-compact-type">{categoryLine}</span>
                              ) : (
                                <span className="fan-member-purchase-compact-type">Product</span>
                              )}
                              <span className="fan-member-purchase-compact-title">{p.title}</span>
                              <span className="fan-member-purchase-compact-status">Purchased</span>
                              <span className="fan-member-purchase-compact-price">
                                {formatPrice(p.priceCents)}
                              </span>
                            </summary>
                            <div className="fan-member-purchase-compact-body">
                              <div className="fan-member-purchase-expanded-card">{legacyBody}</div>
                            </div>
                          </details>
                        );
                      }
                      return (
                        <article
                          key={p.id}
                          className="fan-member-purchase-row fan-member-purchase-row--card fan-member-purchase-row--expanded"
                        >
                          <header className="fan-member-purchase-card-header">
                            <div className="fan-member-purchase-card-header__main">
                              {categoryLine ? (
                                <p className="fan-member-purchase-card-category">{categoryLine}</p>
                              ) : null}
                              <h3 className="fan-member-purchase-card-title">{p.title}</h3>
                            </div>
                            <div className="fan-member-purchase-card-header__aside">
                              <span className="fan-member-purchase-card-status">Purchased</span>
                              <span className="fan-member-purchase-compact-price">
                                {formatPrice(p.priceCents)}
                              </span>
                            </div>
                          </header>
                          <div className="fan-member-purchase-row__body fan-member-purchase-row__body--expanded">
                            {legacyBody}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                {isLoggedIn && fanPurchasesHasMore && fanPurchases.length > 0 ? (
                  <div className="mt-6 flex justify-center px-2 pb-2">
                    <button
                      type="button"
                      className="fan-member-treat-buy px-6 py-2.5 text-sm font-medium disabled:opacity-55"
                      style={{ backgroundColor: primary }}
                      disabled={fanPurchasesLoading || fanPurchasesLoadingMore}
                      onClick={() =>
                        void fetchFanPurchases(
                          Math.min(fanPurchasesQueryLimit + FAN_MEMBER_PURCHASES_PAGE, FAN_MEMBER_PURCHASES_MAX),
                          "more"
                        )
                      }
                    >
                      {fanPurchasesLoadingMore ? "Loading more…" : "Load more purchases"}
                    </button>
                  </div>
                ) : null}
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
                      {dmMessages.length > 0 && (dmHasMoreOlder || dmLoadingOlder) ? (
                        <div className="fan-member-dm-load-older">
                          <button
                            type="button"
                            className="fan-member-dm-load-older__btn"
                            disabled={dmLoadingOlder || !dmHasMoreOlder || dmMessageLimit >= 200}
                            onClick={() => void loadMoreFanDmMessages()}
                          >
                            {dmLoadingOlder
                              ? "Loading…"
                              : dmHasMoreOlder && dmMessageLimit < 200
                                ? "Load older messages"
                                : "No more messages"}
                          </button>
                        </div>
                      ) : null}
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
                          const msgAttachments = getMessageAttachments(m);
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
                                        {msgAttachments.length ? (
                                          <DmMessageAttachmentStack attachments={msgAttachments} />
                                        ) : null}
                                        {m.content?.trim() ? renderTextWithCustomEmoji(m.content, sjHeartEmojiCtx) : null}
                                        {!m.content?.trim() && msgAttachments.length === 0 ? (
                                          <span className="italic opacity-70">(empty message)</span>
                                        ) : null}
                                      </div>
                                      {timeStr ? (
                                        <div className={`fh-dm-bubble__foot ${isFan ? "fh-dm-bubble__foot--me" : ""}`}>
                                          {timeStr}
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
                      <div aria-hidden className="shrink-0 h-px w-full" />
                    </div>
                    <div className="fan-member-messages-compose-wrap">
                      {dmRecordingVoice && dmVoiceMeterStream ? (
                        <div className="w-full space-y-1">
                          <RecordingDurationLabel active={dmRecordingVoice} />
                          <AudioLevelMeter key={`dm-fan-voice-${dmVoiceMeterKey}`} stream={dmVoiceMeterStream} barColor={primary} />
                        </div>
                      ) : null}
                      {dmPendingAttachmentUploading ? (
                        <div className="fh-dm-pending-attach">
                          <p className="fh-dm-pending-attach__uploading">Uploading attachment…</p>
                        </div>
                      ) : null}
                      {dmPendingAttachments.length > 0 ? (
                        <div className="fh-dm-pending-attach">
                          <div className="flex flex-wrap gap-2">
                            {dmPendingAttachments.map((a, idx) => (
                              <div key={`${a.url}-${idx}`} className="fh-dm-pending-attach__inner relative">
                                {a.type === "image" ? (
                                  <img
                                    src={a.url}
                                    alt=""
                                    className="fh-dm-pending-attach__thumb"
                                    {...storefrontImageDownloadGuardProps}
                                  />
                                ) : a.type === "video" ? (
                                  <video
                                    src={a.url}
                                    className="fh-dm-pending-attach__thumb"
                                    muted
                                    playsInline
                                    preload="metadata"
                                    {...storefrontVideoDownloadGuardProps}
                                  />
                                ) : (
                                  <div className="fh-dm-pending-attach__voice-label">
                                    <span className="fh-dm-pending-attach__voice-icon" aria-hidden>
                                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
                                        <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                                      </svg>
                                    </span>
                                    Voice
                                  </div>
                                )}
                                <button
                                  type="button"
                                  className="fh-dm-pending-attach__remove"
                                  aria-label="Remove attachment"
                                  onClick={() => removeDmPendingAttachmentAt(idx)}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                          <p className="fh-dm-pending-attach__hint">
                            Up to {DM_MAX_ATTACHMENTS_PER_MESSAGE} per message. Add a caption if you like, then Send.
                          </p>
                        </div>
                      ) : null}
                      <div className="fan-member-messages-compose">
                      <input
                        ref={dmFileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        className="hidden"
                        onChange={onDmFileSelected}
                      />
                      <div className="fh-dm-compose-actions">
                        <button
                          type="button"
                          className="fh-dm-compose-icon"
                          title="Photos or videos (multiple)"
                          aria-label="Upload photos or videos"
                          disabled={
                            dmSending ||
                            fanBanned ||
                            dmPendingAttachmentUploading ||
                            dmPendingAttachments.length >= DM_MAX_ATTACHMENTS_PER_MESSAGE
                          }
                          onClick={() => dmFileInputRef.current?.click()}
                        >
                          <DmPhotoIcon />
                        </button>
                        <button
                          type="button"
                          className={`fh-dm-compose-icon ${dmRecordingVoice ? "fh-dm-compose-icon--recording" : ""}`}
                          title={dmRecordingVoice ? "Stop recording" : "Voice message"}
                          aria-label={dmRecordingVoice ? "Stop recording" : "Record voice"}
                          disabled={
                            dmSending ||
                            fanBanned ||
                            dmPendingAttachmentUploading ||
                            dmPendingAttachments.length >= DM_MAX_ATTACHMENTS_PER_MESSAGE
                          }
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
                            if (dmInput.trim() || dmPendingAttachments.length > 0) void sendDm();
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
                          (!dmInput.trim() && dmPendingAttachments.length === 0)
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
                tipFooterEmoji={tipFooterEmojiResolved}
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
                    <p className="fan-profile-stat-value">{supportThreadCount}</p>
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
                              draggable={false}
                              onContextMenu={(e) => e.preventDefault()}
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
                {hasMemberAreaAccess && !previewMember ? (
                  <div className="fan-member-about-section">
                    <h3 className="fan-member-about-heading">Notifications</h3>
                    <div
                      className="fan-profile-panel"
                      style={{
                        borderColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 24%, transparent)",
                      }}
                    >
                      <BrowserPushSettings
                        variant="member"
                        creatorDisplayName={typeof displayName === "string" ? displayName : ""}
                        showToast={showToast}
                      />
                    </div>
                  </div>
                ) : null}
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
                        disabled={joiningFree || subscribing || !creatorStorefrontActive}
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
                        disabled={subscribing || !creatorStorefrontActive}
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
                    {showMembershipHubEntry ? (
                      <button
                        type="button"
                        onClick={() => {
                          setBillingPortalError(null);
                          setMembershipManageModalOpen(true);
                        }}
                        className="storefront-cancel-membership-btn"
                        style={{
                          color: primary,
                          borderColor: `${primary}66`,
                          backgroundColor: `${primary}0f`,
                        }}
                      >
                        {hasPaidMembership ? "Manage subscription" : "Membership & billing"}
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
                        borderColor: `color-mix(in srgb, ${primary} 28%, transparent)`,
                        backgroundColor: `color-mix(in srgb, ${primary} 06%, white)`,
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
                  <SupportThreadsPanel
                    accentHex={primary}
                    selectThreadId={supportTicketFocusId}
                    showToast={(message, type) => showToast?.(message, type)}
                    onOpenHelp={() => setFanHelpFlow("chooser")}
                    helpButtonLabel="Help"
                    heading="Support threads"
                    supportLabel={fanFacingSiteBrand}
                    replyPlaceholder={`Reply to ${fanFacingSiteBrand} support…`}
                    description={
                      <>
                        Conversation with {displayName || "this creator"} belongs in{" "}
                        <strong className="font-semibold">Messages</strong>. Use{" "}
                        <strong className="font-semibold">Help</strong> for billing or site questions, or technical issues
                        with this hub — then follow up here by thread.
                      </>
                    }
                    emptyStateHint={
                      <>
                        No threads yet. Open <strong className="font-semibold">Help</strong> to report a problem or contact{" "}
                        {fanFacingSiteBrand}.
                      </>
                    }
                    onThreadsChange={(rows) => setSupportThreadCount(rows.length)}
                  />
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
