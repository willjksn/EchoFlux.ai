"use client";

/**
 * Public fan landing — renders the same layout as My Page → Live preview (`StorefrontPreview`),
 * with real Sign up / Log in, subscribe, tips, and guest treats.
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { auth } from "../firebaseConfig";
import type {
  CreatorStorefrontSettings,
  StorefrontSocialLinks,
  StorefrontLandingContent,
  StorefrontLegal,
  TextStyle,
  TreatProduct,
} from "../types";
import { StorefrontPreview } from "./StorefrontPreview";
import { resolveStoreCopy } from "../src/lib/storefrontStoreCopy";
import { readFanCheckoutFetchResult, FAN_TIP_CHECKOUT_SUCCESS_QS } from "../src/lib/fanCheckoutResponse";
import { getTreatProductTypeDisplayLabel } from "../src/lib/treatProductTypeLabel";
import { isDigitalPackProductType } from "../src/lib/digitalPackProduct";
import { DigitalPackStorePreview } from "./DigitalPackStorePreview";
import {
  storefrontAudioDownloadGuardProps,
  storefrontImageDownloadGuardProps,
  storefrontVideoDownloadGuardProps,
} from "../src/lib/storefrontMediaGuard";

interface FanLandingPageProps {
  creator: {
    creatorId: string;
    displayName: string;
    handle: string;
    avatar?: string;
    avatarObjectPosition?: string;
    logo?: string;
    /** Legacy / alternate field — same as `logo` for header image */
    logoUrl?: string;
    bio?: string;
    showDisplayNameOnLanding?: boolean;
    heroImage?: string;
    heroImageUrl?: string;
    heroMedia?: {
      url: string;
      size?: "small" | "medium" | "large" | "fullBackground" | "fullBackgroundPortrait";
      backgroundPosition?: string;
      objectPosition?: string;
      landingAvatarLeft?: string;
      landingAvatarBottom?: string;
    }[];
    heroTagline?: string;
    heroPromise?: string;
    heroSubline?: string;
    heroSubline2?: string;
    socialLinks?: StorefrontSocialLinks;
    landingContent?: StorefrontLandingContent;
    legal?: StorefrontLegal;
    theme: { primary: string; background: string; text?: string; fontFamily?: string; accentHover?: string; border?: string };
    heroLayout?: "default" | "centered" | "split" | "splitRight";
    monetization?: { monthlyPrice?: number; tipsEnabled?: boolean; freeAccessEnabled?: boolean; chatEnabled?: boolean };
    spicyMode?: boolean;
    rules?: { boundariesText?: string };
    textStyles?: {
      displayName?: TextStyle;
      bio?: TextStyle;
      heroTagline?: TextStyle;
      heroPromise?: TextStyle;
      heroSubline?: TextStyle;
      heroSubline2?: TextStyle;
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
    fanAuthBranding?: CreatorStorefrontSettings["fanAuthBranding"];
    sections?: {
      feed?: boolean;
      treats?: boolean;
      tip?: boolean;
      messages?: boolean;
      about?: boolean;
    };
  };
  onSubscribe: () => void;
  onJoinFree?: () => void;
  onOpenFanAuth?: (view: "login" | "signup") => void;
  onLogout?: () => void;
  subscribing: boolean;
  joiningFree?: boolean;
  isLoggedIn: boolean;
  publicTreatsOnLanding?: boolean;
  sectionsTreatsEnabled?: boolean;
  landingTreatProducts?: TreatProduct[];
  landingTreatsLoading?: boolean;
  /** Called right before opening the guest store modal — refetch products so names match after edits. */
  onRefreshLandingTreats?: () => void;
  treatLinkAccountMessage?: string | null;
  /** Defaults to `/{handle}/terms` and `/privacy` if omitted */
  termsHref?: string;
  privacyHref?: string;
  /** Logo link target (custom domain usually `/`) */
  homeHref?: string;
  /** Full page reload loses React state — prime landing intent when the Witme logo points at the same storefront (creator preview). */
  primeLandingIntentBeforeLogoNavigation?: boolean;
  /** Creator EchoFlux lapsed — hide store preview and disable new signups. */
  storefrontSuspended?: boolean;
  storefrontSuspendedMessage?: string;
}

function buildStorefrontConfig(
  creator: FanLandingPageProps["creator"],
  publicTreatsOnLanding: boolean,
  sectionsTreatsEnabled: boolean
): Partial<CreatorStorefrontSettings> & { handle: string } {
  const logoStr =
    (creator.logo && String(creator.logo).trim()) ||
    (creator.logoUrl && String(creator.logoUrl).trim()) ||
    "";
  const heroImageStr =
    (creator.heroImage && String(creator.heroImage).trim()) ||
    (creator.heroImageUrl && String(creator.heroImageUrl).trim()) ||
    "";
  /** Match My Page `buildStorefrontPreviewConfig` so live landing gets the same hero as the builder. */
  const heroMedia =
    Array.isArray(creator.heroMedia) && creator.heroMedia.length > 0
      ? creator.heroMedia
      : heroImageStr
        ? [{ url: heroImageStr, size: "medium" as const }]
        : [];

  return {
    handle: creator.handle,
    displayName: creator.displayName,
    bio: creator.bio,
    avatar: creator.avatar,
    avatarObjectPosition: creator.avatarObjectPosition,
    logo: logoStr,
    showDisplayNameOnLanding: creator.showDisplayNameOnLanding !== false,
    heroImage: heroImageStr,
    heroImageUrl: creator.heroImageUrl,
    heroMedia: heroMedia.length > 0 ? heroMedia : undefined,
    heroTagline: creator.heroTagline,
    heroPromise: creator.heroPromise,
    heroSubline: creator.heroSubline,
    heroSubline2: creator.heroSubline2,
    heroLayout: creator.heroLayout,
    socialLinks: creator.socialLinks,
    landingContent: creator.landingContent,
    legal: creator.legal,
    theme: creator.theme,
    textStyles: creator.textStyles,
    spicyMode: creator.spicyMode,
    rules: creator.rules,
    monetization: creator.monetization,
    sections: {
      feed: creator.sections?.feed !== false,
      treats: sectionsTreatsEnabled && creator.sections?.treats !== false,
      tip: creator.sections?.tip !== false,
      messages: creator.sections?.messages !== false,
      about: false,
    },
    publicTreatsOnLanding,
    fanAuthBranding: creator.fanAuthBranding,
  };
}

export const FanLandingPage: React.FC<FanLandingPageProps> = (props) => {
  const {
    creator,
    onSubscribe,
    onJoinFree,
    onOpenFanAuth,
    onLogout,
    subscribing,
    joiningFree = false,
    isLoggedIn,
    publicTreatsOnLanding = false,
    sectionsTreatsEnabled = true,
    landingTreatProducts = [],
    landingTreatsLoading = false,
    onRefreshLandingTreats,
    treatLinkAccountMessage = null,
    termsHref: termsHrefProp,
    privacyHref: privacyHrefProp,
    homeHref,
    primeLandingIntentBeforeLogoNavigation = false,
    storefrontSuspended = false,
    storefrontSuspendedMessage,
  } = props;

  const { theme, monetization, landingContent: creatorLandingContent } = creator;
  const primary = theme?.primary || "#6366f1";

  const [tipLoading, setTipLoading] = useState(false);
  const [tipError, setTipError] = useState("");
  const [tipHandle, setTipHandle] = useState("");
  const [tipCustomAmount, setTipCustomAmount] = useState("");
  const [treatStoreOpen, setTreatStoreOpen] = useState(false);

  /** Default light so creator-themed landing matches design; system dark mode (common on mobile) no longer forces dark. Fans can still toggle in the header. */
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(`fan-dark-mode-${creator.creatorId}`);
    if (stored !== null) return stored === "true";
    return false;
  });

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(`fan-dark-mode-${creator.creatorId}`, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [creator.creatorId]);

  const termsHref = termsHrefProp ?? `/${creator.handle}/terms`;
  const privacyHref = privacyHrefProp ?? `/${creator.handle}/privacy`;

  const showLandingTreatModal = publicTreatsOnLanding && sectionsTreatsEnabled;

  const storeCopy = useMemo(() => resolveStoreCopy(creatorLandingContent), [creatorLandingContent]);

  const previewConfig = useMemo(
    () => buildStorefrontConfig(creator, publicTreatsOnLanding, sectionsTreatsEnabled),
    [creator, publicTreatsOnLanding, sectionsTreatsEnabled]
  );

  const openFanAuthLogin = () => {
    if (onOpenFanAuth) onOpenFanAuth("login");
    else window.location.href = "/?login=1";
  };
  const openFanAuthSignup = () => {
    if (onOpenFanAuth) onOpenFanAuth("signup");
    else window.location.href = "/?signup=1";
  };

  useEffect(() => {
    const resetTipUi = () => {
      setTipLoading(false);
      setTipError("");
    };
    window.addEventListener("pageshow", resetTipUi);
    return () => window.removeEventListener("pageshow", resetTipUi);
  }, []);

  useEffect(() => {
    if (!treatStoreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTreatStoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [treatStoreOpen]);

  useEffect(() => {
    if (!treatStoreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [treatStoreOpen]);

  useEffect(() => {
    if (!showLandingTreatModal) setTreatStoreOpen(false);
  }, [showLandingTreatModal]);

  useEffect(() => {
    if (typeof window === "undefined" || !creator.creatorId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tip") !== "success" || params.get("purchase_sync") !== "1") return;
    const sessionId = params.get("session_id");
    if (!sessionId) return;

    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await fetch("/api/syncFanCheckoutSessionPublic", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, creatorId: creator.creatorId }),
          });
          if (res.ok) break;
        } catch {
          // Retry briefly while Stripe/webhook state catches up after redirect.
        }
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }

      if (cancelled) return;
      const url = new URL(window.location.href);
      url.searchParams.delete("tip");
      url.searchParams.delete("purchase_sync");
      url.searchParams.delete("session_id");
      const qs = url.searchParams.toString();
      window.history.replaceState({}, "", url.pathname + (qs ? `?${qs}` : "") + (url.hash || ""));
    })();

    return () => {
      cancelled = true;
    };
  }, [creator.creatorId]);

  const startTip = async (amountCents: number) => {
    if (!amountCents || amountCents < 100 || amountCents > 100000 || tipLoading) return;
    setTipError("");
    setTipLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const base = window.location.origin;
      const res = await fetch("/api/createFanCheckoutSession", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          creatorId: creator.creatorId,
          type: "tip",
          amountCents,
          tipHandle: tipHandle.trim() || undefined,
          successUrl: `${base}${window.location.pathname}?${FAN_TIP_CHECKOUT_SUCCESS_QS}`,
          cancelUrl: `${base}${window.location.pathname}`,
        }),
      });
      const { ok, url, error } = await readFanCheckoutFetchResult(res);
      if (ok && url) {
        window.location.href = url;
        return;
      }
      setTipError(error || "Could not start checkout.");
    } catch {
      setTipError("Could not start checkout. Try again.");
    } finally {
      setTipLoading(false);
    }
  };

  const onCustomTip = () => {
    const val = Number.parseFloat(tipCustomAmount || "");
    if (!Number.isFinite(val) || val < 1 || val > 1000) {
      setTipError("Enter an amount between $1 and $1000.");
      return;
    }
    startTip(Math.round(val * 100));
  };

  const isFreeAccess = monetization?.freeAccessEnabled === true;
  const tipsEnabled = monetization?.tipsEnabled !== false;

  const effectiveText = isDarkMode ? "#f5f5f5" : theme?.text || "#1f2937";
  const suspendedNotice =
    storefrontSuspendedMessage?.trim() ||
    "This creator page is temporarily unavailable for new signups.";
  const guardedSubscribe = storefrontSuspended ? () => undefined : onSubscribe;
  const guardedJoinFree = storefrontSuspended ? undefined : onJoinFree;

  return (
    <>
      {storefrontSuspended ? (
        <div
          className="mx-auto max-w-3xl px-4 pt-4 sm:px-6"
          role="status"
        >
          <p
            className="rounded-xl border px-4 py-3 text-sm"
            style={{
              borderColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 35%, transparent)",
              backgroundColor: "color-mix(in srgb, var(--fan-primary, #6366f1) 8%, white)",
              color: effectiveText,
            }}
          >
            {suspendedNotice}
          </p>
        </div>
      ) : null}
      <StorefrontPreview
        config={previewConfig}
        previewMode="landing"
        className="!max-w-none"
        liveLanding={{
          isLoggedIn,
          isFreeAccess,
          onOpenSignup: openFanAuthSignup,
          onOpenLogin: openFanAuthLogin,
          onLogout,
          onSubscribe: guardedSubscribe,
          onJoinFree: guardedJoinFree,
          subscribing,
          joiningFree,
          isDarkMode,
          onToggleDarkMode: toggleDarkMode,
          homeHref: homeHref ?? "/",
          termsHref,
          privacyHref,
          bio: creator.bio,
          primeLandingIntentBeforeHomeNavigation: primeLandingIntentBeforeLogoNavigation,
          tipHandle,
          onTipHandleChange: setTipHandle,
          tipCustomAmount,
          onTipCustomAmountChange: setTipCustomAmount,
          onTipPresetDollars: (d) => void startTip(d * 100),
          onTipCustomSubmit: onCustomTip,
          tipLoading,
          tipError,
          tipsEnabled,
          showGuestTreatsCard: showLandingTreatModal,
          onOpenGuestTreats: () => {
            onRefreshLandingTreats?.();
            setTreatStoreOpen(true);
          },
          landingTreatsLoading,
          landingTreatProductCount: landingTreatProducts.length,
          treatLinkAccountMessage,
          onTreatLinkSignIn: openFanAuthLogin,
        }}
      />

      {treatStoreOpen && showLandingTreatModal ? (
        <div
          className="fan-landing-treat-modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10050,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: "0.5rem 0.5rem calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
          }}
          role="presentation"
          onClick={() => setTreatStoreOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fan-landing-treat-modal-title"
            className="fan-landing-treat-modal"
            style={{
              width: "100%",
              maxWidth: "min(520px, 100%)",
              maxHeight: "min(calc(100vh - 1.5rem), 720px)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              background: isDarkMode ? "#1a1a1a" : "#fff",
              color: effectiveText,
              borderTopLeftRadius: "1.25rem",
              borderTopRightRadius: "1.25rem",
              boxShadow: "0 -8px 40px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="fan-landing-treat-modal-header"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                padding: "1rem 1.25rem",
                borderBottom: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : `${primary}20`}`,
              }}
            >
              <h2 id="fan-landing-treat-modal-title" className="text-base font-bold m-0" style={{ color: primary }}>
                {storeCopy.publicStoreModalTitle}
              </h2>
              <button
                type="button"
                onClick={() => setTreatStoreOpen(false)}
                className="rounded-full px-3 py-1 text-sm font-medium"
                style={{
                  border: `1px solid ${primary}40`,
                  color: effectiveText,
                  background: isDarkMode ? "rgba(255,255,255,0.06)" : `${primary}10`,
                }}
              >
                Close
              </button>
            </div>
            <div
              className="fan-landing-treat-modal-body"
              style={{
                overflowY: "auto",
                padding: "1rem 1.25rem 1.5rem",
                WebkitOverflowScrolling: "touch",
              }}
            >
              {landingTreatsLoading ? (
                <p className="text-sm m-0" style={{ color: effectiveText }}>
                  {storeCopy.memberStoreLoadingMessage}
                </p>
              ) : landingTreatProducts.length === 0 ? (
                <p className="text-sm italic m-0" style={{ color: isDarkMode ? "rgba(255,255,255,0.5)" : `${primary}88` }}>
                  {storeCopy.publicStoreModalEmptyMessage}
                </p>
              ) : (
                <ul className="space-y-3 list-none m-0 p-0">
                  {landingTreatProducts.map((p) => {
                    const categoryLine = getTreatProductTypeDisplayLabel(p);
                    return (
                    <li
                      key={p.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl p-3"
                      style={{
                        background: isDarkMode ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.9)",
                        border: `1px solid ${primary}18`,
                      }}
                    >
                      <div>
                        {categoryLine ? (
                          <p className="text-xs font-medium uppercase tracking-wide m-0" style={{ color: primary }}>
                            {categoryLine}
                          </p>
                        ) : null}
                        <p className={`font-semibold m-0 ${categoryLine ? "mt-0.5" : ""}`} style={{ color: effectiveText }}>
                          {p.title}
                        </p>
                        {isDigitalPackProductType(p.type) ? (
                          <DigitalPackStorePreview
                            product={p}
                            fanFacing
                            compact
                            imageGuardProps={storefrontImageDownloadGuardProps}
                            videoGuardProps={storefrontVideoDownloadGuardProps}
                            audioGuardProps={storefrontAudioDownloadGuardProps}
                          />
                        ) : null}
                        {p.description ? (
                          <p className="text-xs mt-1 mb-0" style={{ color: isDarkMode ? "rgba(255,255,255,0.6)" : `${theme?.text || "#1f2937"}99` }}>
                            {p.description}
                          </p>
                        ) : null}
                        <p className="text-sm font-bold mt-1 mb-0" style={{ color: primary }}>
                          ${(p.priceCents / 100).toFixed(2)}
                        </p>
                      </div>
                      <div className="shrink-0 px-3 py-2 text-xs font-semibold rounded-lg" style={{
                        color: primary,
                        border: `1px solid ${primary}33`,
                        background: isDarkMode ? "rgba(255,255,255,0.03)" : `${primary}0f`,
                      }}>
                        Members only
                      </div>
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
