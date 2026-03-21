import React, { useState, useEffect, useCallback, useRef } from "react";
import { auth } from "../firebaseConfig";
import type { TreatProduct, FanDmThread, FanDmMessage, StorefrontSocialLinks, StorefrontLandingContent, StorefrontLegal, CreatorMonetization, TextStyle } from "../types";
import { FanLandingPage } from "./FanLandingPage";
import { FanMemberFeed, FanMemberSaved } from "./FanMemberFeed";
import { MemberUsernameGateModal } from "./MemberUsernameGateModal";
import { DEFAULT_PRIVACY_POLICY, DEFAULT_TERMS_OF_SERVICE } from "../constants";
import { useAutosizeTextarea } from "../src/hooks/useAutosizeTextarea";
import { formatDmShortTime } from "../src/lib/fanHubDisplay";
import { getAvatarCropStyle } from "../src/lib/avatarCrop";

export type StorefrontCreator = {
  creatorId: string;
  handle: string;
  displayName: string;
  bio?: string;
  avatar?: string;
  avatarObjectPosition?: string;
  logo?: string;
  heroImage?: string;
  heroTagline?: string;
  heroPromise?: string;
  socialLinks?: StorefrontSocialLinks;
  landingContent?: StorefrontLandingContent;
  legal?: StorefrontLegal;
  theme: { primary: string; background: string; text?: string; buttonStyle?: string; fontFamily?: string };
  heroLayout?: "default" | "centered" | "split" | "splitRight";
  sections: { feed: boolean; treats: boolean; tip?: boolean; messages: boolean; about?: boolean };
  sectionsOrder?: string[];
  rules?: { boundariesText?: string };
  spicyMode?: boolean;
  monetization?: CreatorMonetization;
  feedSettings?: { hideLikeCounts?: boolean; hideComments?: boolean; hideLikes?: boolean };
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
};

/** Called when App has already determined path is a storefront (/{handle} or /u/{handle} or /link/{handle}). */
function parseHandleFromPath(): { handle: string | null; subpage: "terms" | "privacy" | null } {
  if (typeof window === "undefined") return { handle: null, subpage: null };
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const parts = path.slice(1).split("/").filter(Boolean);
  const legacyMatch = path.match(/^\/(?:u|link)\/([^/]+)/);
  const handleSegment = legacyMatch ? legacyMatch[1] : parts[0];
  if (!handleSegment) return { handle: null, subpage: null };
  
  // Check for /handle/terms or /handle/privacy subpages
  const subpageSegment = parts[1]?.toLowerCase();
  const subpage = (subpageSegment === "terms" || subpageSegment === "privacy") ? subpageSegment : null;
  
  try {
    return { 
      handle: decodeURIComponent(handleSegment).replace("@", "").toLowerCase().trim(),
      subpage 
    };
  } catch {
    return { 
      handle: handleSegment.replace("@", "").toLowerCase().trim(),
      subpage 
    };
  }
}

const TIP_PRESET_AMOUNTS = [5, 10, 25, 50, 100, 250];

interface TipSectionProps {
  creatorId: string;
  displayName: string;
  primary: string;
  tipSelectedPreset: number | null;
  setTipSelectedPreset: (v: number | null) => void;
  tipCustomAmount: string;
  setTipCustomAmount: (v: string) => void;
  tipLoading: boolean;
  setTipLoading: (v: boolean) => void;
}

function TipSection({
  creatorId,
  displayName,
  primary,
  tipSelectedPreset,
  setTipSelectedPreset,
  tipCustomAmount,
  setTipCustomAmount,
  tipLoading,
  setTipLoading,
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
    if (cents < 100 || cents > 100000) return;
    setTipLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const base = typeof window !== "undefined" ? window.location.origin : "";
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
          successUrl: `${base}${window.location.pathname}?tip=success`,
          cancelUrl: `${base}${window.location.pathname}?tip=cancel`,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      alert(data.error || "Checkout failed. Please try again.");
    } catch {
      alert("Something went wrong. Please try again.");
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
        <h2 className="tip-hero-title">Show Your Love</h2>
        <p className="tip-hero-subtitle">No minimum — send what you like.</p>
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
  const [handle, setHandle] = useState<string | null>(() => parseHandleFromPath().handle);
  const [legalSubpage, setLegalSubpage] = useState<"terms" | "privacy" | null>(() => parseHandleFromPath().subpage);
  const [creator, setCreator] = useState<StorefrontCreator | null>(null);
  const [subscribed, setSubscribed] = useState<boolean>(false);
  const [memberUsernameRequired, setMemberUsernameRequired] = useState(false);
  const [cancelMembershipLoading, setCancelMembershipLoading] = useState(false);
  const [cancelMembershipMessage, setCancelMembershipMessage] = useState<string | null>(null);
  const [entitlementLoading, setEntitlementLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"feed" | "treats" | "messages" | "tip" | "saved" | "about">("feed");
  const [tipSelectedPreset, setTipSelectedPreset] = useState<number | null>(null);
  const [tipCustomAmount, setTipCustomAmount] = useState("");
  const [tipLoading, setTipLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(!!auth.currentUser);
  const [unlockedProductIds, setUnlockedProductIds] = useState<string[]>([]);
  const [treatsProducts, setTreatsProducts] = useState<TreatProduct[]>([]);
  const [treatsLoading, setTreatsLoading] = useState(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [joiningFree, setJoiningFree] = useState(false);
  const [dmThread, setDmThread] = useState<FanDmThread | null>(null);
  const [dmMessages, setDmMessages] = useState<FanDmMessage[]>([]);
  const [dmLoading, setDmLoading] = useState(false);
  const [dmSending, setDmSending] = useState(false);
  const [dmInput, setDmInput] = useState("");
  const dmMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const { ref: dmTextareaRef } = useAutosizeTextarea(dmInput);
  const [fanBanned, setFanBanned] = useState(false);
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null);

  useEffect(() => {
    const { handle: h, subpage } = parseHandleFromPath();
    setHandle(h);
    setLegalSubpage(subpage);
  }, []);

  useEffect(() => {
    if (!handle) {
      setError("Invalid handle");
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/getCreatorByHandle?handle=${encodeURIComponent(handle)}`);
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError((body as { error?: string }).error || "Creator not found");
          setCreator(null);
          setLoading(false);
          return;
        }
        const data = await res.json();
        setCreator(data as StorefrontCreator);
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
  }, [handle]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setIsLoggedIn(!!u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!creator?.creatorId || !isLoggedIn) {
      setSubscribed(false);
      setMemberUsernameRequired(false);
      return;
    }

    let cancelled = false;
    setEntitlementLoading(true);

    (async () => {
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
        const res = await fetch(
          `/api/getFanEntitlement?creatorId=${encodeURIComponent(creator.creatorId)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        if (cancelled) return;
        const data = await res.json().catch(() => ({}));
        setSubscribed(!!(data as { subscribed?: boolean }).subscribed);
        setMemberUsernameRequired(!!(data as { memberUsernameRequired?: boolean }).memberUsernameRequired);
        setUnlockedProductIds(Array.isArray((data as { unlockedProductIds?: string[] }).unlockedProductIds) ? (data as { unlockedProductIds: string[] }).unlockedProductIds : []);
      } catch {
        if (!cancelled) {
          setSubscribed(false);
          setMemberUsernameRequired(false);
        }
      } finally {
        if (!cancelled) setEntitlementLoading(false);
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
      const res = await fetch(`/api/products?creatorId=${encodeURIComponent(creator.creatorId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setTreatsProducts(Array.isArray(data.products) ? data.products : []);
    } catch {
      setTreatsProducts([]);
    } finally {
      setTreatsLoading(false);
    }
  }, [creator?.creatorId]);

  useEffect(() => {
    if (activeTab === "treats" && creator?.creatorId) fetchTreats();
  }, [activeTab, creator?.creatorId, fetchTreats]);

  const handleSubscribe = async () => {
    if (!creator?.creatorId || !auth.currentUser) {
      window.location.href = "/?login=1";
      return;
    }
    setSubscribing(true);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch("/api/createFanCheckoutSession", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          creatorId: creator.creatorId,
          type: "subscription",
          successUrl: window.location.href,
          cancelUrl: window.location.href,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Checkout failed");
      const url = (data as { url?: string }).url;
      if (url) window.location.href = url;
    } catch {
      // could toast
    } finally {
      setSubscribing(false);
    }
  };

  const handleJoinFree = async () => {
    if (!creator?.creatorId || !auth.currentUser) {
      window.location.href = "/?login=1";
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
      try {
        const token2 = await auth.currentUser.getIdToken(true);
        const entRes = await fetch(
          `/api/getFanEntitlement?creatorId=${encodeURIComponent(creator.creatorId)}`,
          { headers: { Authorization: `Bearer ${token2}` } }
        );
        const ent = await entRes.json().catch(() => ({}));
        setMemberUsernameRequired(!!(ent as { memberUsernameRequired?: boolean }).memberUsernameRequired);
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
    setPurchasingId(productId);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch("/api/createFanCheckoutSession", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          creatorId: creator.creatorId,
          type: "product",
          productId,
          successUrl: window.location.href,
          cancelUrl: window.location.href,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Checkout failed");
      const url = (data as { url?: string }).url;
      if (url) window.location.href = url;
    } catch {
      // could toast
    } finally {
      setPurchasingId(null);
    }
  };

  const formatPrice = (cents: number) => "$" + (cents / 100).toFixed(2);

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

  const fetchDmThreadAndMessages = useCallback(async () => {
    if (!creator?.creatorId || !auth.currentUser || activeTab !== "messages") return;
    setDmLoading(true);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const [threadsRes, bannedRes] = await Promise.all([
        fetch("/api/fanDmThreads?as=fan", { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/checkFanBanned?creatorId=${encodeURIComponent(creator.creatorId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const threadsData = await threadsRes.json().catch(() => ({}));
      const bannedData = await bannedRes.json().catch(() => ({}));
      setFanBanned(!!(bannedData as { banned?: boolean }).banned);
      const threads = (threadsData.threads as FanDmThread[]) || [];
      const withCreator = threads.find((t) => t.creatorId === creator.creatorId);
      setDmThread(withCreator || null);
      if (withCreator) {
        const msgRes = await fetch(
          `/api/fanDmMessages?threadId=${encodeURIComponent(withCreator.id)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const msgData = await msgRes.json().catch(() => ({}));
        setDmMessages(Array.isArray(msgData.messages) ? msgData.messages : []);
      } else {
        setDmMessages([]);
      }
    } catch {
      setDmThread(null);
      setDmMessages([]);
    } finally {
      setDmLoading(false);
    }
  }, [creator?.creatorId, activeTab]);

  useEffect(() => {
    if (activeTab === "messages" && creator?.creatorId && isLoggedIn) fetchDmThreadAndMessages();
  }, [activeTab, creator?.creatorId, isLoggedIn, fetchDmThreadAndMessages]);

  useEffect(() => {
    if (activeTab !== "messages" || dmLoading) return;
    requestAnimationFrame(() => dmMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, [activeTab, dmMessages, dmLoading]);

  const reportMessage = async (messageId: string) => {
    if (!dmThread || !auth.currentUser) return;
    setReportingMessageId(messageId);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch("/api/reportMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          threadId: dmThread.id,
          messageId,
          reason: "Reported by fan",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to report");
      }
      await fetchDmThreadAndMessages();
    } catch {
      // could toast
    } finally {
      setReportingMessageId(null);
    }
  };

  const sendDm = async () => {
    if (!creator?.creatorId || !auth.currentUser || !dmInput.trim()) return;
    setDmSending(true);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const body: Record<string, string> = {
        creatorId: creator.creatorId,
        fanId: auth.currentUser.uid,
        content: dmInput.trim(),
      };
      if (dmThread) body.threadId = dmThread.id;
      const res = await fetch("/api/fanDmSend", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to send");
      setDmInput("");
      await fetchDmThreadAndMessages();
      requestAnimationFrame(() => dmMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch {
      // could toast
    } finally {
      setDmSending(false);
    }
  };

  /* Neutral theme defaults - creators should customize */
  const defaultBg = "#fafafa";
  const defaultPrimary = "#6366f1";

  if (loading) {
    return (
      <div className="stormij-theme storefront-landing-wrap min-h-screen flex items-center justify-center">
        <div className="text-center" style={{ color: "var(--text-muted)" }}>
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-[var(--accent)] border-t-transparent mx-auto mb-3" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !creator) {
    return (
      <div className="stormij-theme storefront-landing-wrap min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-4" style={{ color: "var(--text)" }}>
          <h1 className="text-xl font-semibold mb-2">Not found</h1>
          <p style={{ color: "var(--text-muted)" }}>{error || "This creator page doesn't exist."}</p>
        </div>
      </div>
    );
  }

  const { theme, displayName, avatar, logo, bio, sections, sectionsOrder, rules, landingContent } = creator;
  const avatarCropStyle: React.CSSProperties = getAvatarCropStyle(creator.avatarObjectPosition);

  // Member view background - uses creator theme or neutral default
  const bg = theme?.background || defaultBg;
  const primary = theme?.primary || defaultPrimary;

  // Nav tabs: order from sectionsOrder, filtered by sections; always include Saved at the end
  const memberTabKeys = (sectionsOrder || ["feed", "treats", "tip", "messages", "about"])
    .filter((key) => key !== "saved" && (sections as Record<string, boolean>)?.[key] !== false)
    .concat("saved");
  const navLabels: Record<string, string> = {
    feed: "Home",
    treats: "Treats",
    tip: "Tip",
    messages: "Messages",
    saved: "Saved",
    about: "About",
  };

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
                {avatar && (
                  <img src={avatar} alt="" className="w-10 h-10 rounded-full object-cover" style={avatarCropStyle} />
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
    );
  }

  // Check for ?preview=member query param to allow previewing member view
  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const previewMember = urlParams?.get("preview") === "member";

  const showLanding = previewMember ? false : (!isLoggedIn || !subscribed);

  if (showLanding) {
    return (
      <FanLandingPage
        creator={creator}
        onSubscribe={handleSubscribe}
        onJoinFree={handleJoinFree}
        onLogin={() => { window.location.href = "/?login=1"; }}
        subscribing={subscribing}
        joiningFree={joiningFree}
        isLoggedIn={isLoggedIn}
      />
    );
  }

  const globalFont = theme?.fontFamily || "Inter, sans-serif";

  return (
    <div
      className="min-h-screen stormij-theme"
      style={{ 
        fontFamily: globalFont,
        backgroundColor: bg,
        "--fan-primary": primary,
        "--fan-bg": bg,
        "--fan-text": theme?.text || "#1f2937",
      } as React.CSSProperties}
    >
      {memberUsernameRequired && creator && !previewMember && (
        <MemberUsernameGateModal
          creatorId={creator.creatorId}
          creatorDisplayName={displayName}
          primaryColor={primary}
          textColor={theme?.text}
          onComplete={() => setMemberUsernameRequired(false)}
        />
      )}
      {/* Member Header */}
      <header
        className="storefront-member-header"
        style={{ backgroundColor: `${primary}14` }}
      >
        <div className="storefront-header-left">
          {logo ? (
            <img src={logo} alt={displayName} className="storefront-header-logo" />
          ) : avatar ? (
            <img src={avatar} alt="" className="storefront-header-avatar" style={avatarCropStyle} />
          ) : (
            <div className="storefront-header-avatar storefront-header-avatar-fallback" style={{ background: primary }}>
              {displayName?.charAt(0) || "?"}
            </div>
          )}
          {!logo && <span className="storefront-header-name">{displayName}</span>}
        </div>
        <nav className="storefront-header-nav">
          {memberTabKeys.map((key) => {
            const isTip = key === "tip";
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
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
                <span>{navLabels[key] || key}</span>
              </button>
            );
          })}
          <div className="storefront-header-actions">
            <button
              type="button"
              onClick={handleCancelMembership}
              disabled={cancelMembershipLoading}
              className="storefront-cancel-membership-btn"
              title="Cancel membership at end of billing period"
            >
              {cancelMembershipLoading ? "Canceling…" : "Cancel membership"}
            </button>
          </div>
        </nav>
      </header>

      {cancelMembershipMessage && (
        <div className="storefront-cancel-message" role="alert" style={{ backgroundColor: `${primary}18`, color: theme?.text || "#1f2937" }}>
          {cancelMembershipMessage}
        </div>
      )}

      {!entitlementLoading && (
        <div className="fan-member-content">
            {activeTab === "feed" && (
              <FanMemberFeed
                creatorId={creator.creatorId}
                displayName={displayName}
                avatar={avatar}
                avatarObjectPosition={creator.avatarObjectPosition}
                primary={primary}
                feedSettings={creator.feedSettings}
                fanId={auth.currentUser?.uid}
              />
            )}
            {activeTab === "saved" && (
              <FanMemberSaved
                creatorId={creator.creatorId}
                displayName={displayName}
                avatar={avatar}
                avatarObjectPosition={creator.avatarObjectPosition}
                primary={primary}
                feedSettings={creator.feedSettings}
                fanId={auth.currentUser?.uid}
              />
            )}
            {activeTab === "treats" && (
              <div className="fan-member-treats">
                {treatsLoading ? (
                  <p className="fan-member-loading">Loading treats...</p>
                ) : treatsProducts.length === 0 ? (
                  <p className="fan-member-empty">No treats in the store yet.</p>
                ) : (
                  <div className="fan-member-treats-grid">
                    {treatsProducts.map((p) => {
                      const owned = unlockedProductIds.includes(p.id);
                      return (
                        <div key={p.id} className="fan-member-treat-card">
                          <p className="fan-member-treat-type">{p.type.replace(/_/g, " ")}</p>
                          <h3 className="fan-member-treat-title">{p.title}</h3>
                          {p.description && (
                            <p className="fan-member-treat-desc">{p.description}</p>
                          )}
                          <p className="fan-member-treat-price">{formatPrice(p.priceCents)}</p>
                          <div className="fan-member-treat-action">
                            {owned ? (
                              <span className="fan-member-treat-owned">Purchased</span>
                            ) : (
                              <button
                                type="button"
                                disabled={!!purchasingId}
                                onClick={() => handlePurchase(p.id)}
                                className="fan-member-treat-buy"
                                style={{ backgroundColor: primary }}
                              >
                                {purchasingId === p.id ? "Processing…" : "Purchase"}
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
            {activeTab === "messages" && (
              <div className="fan-member-messages">
                {!isLoggedIn ? (
                  <p className="fan-member-empty">Log in to message {displayName}.</p>
                ) : dmLoading ? (
                  <p className="fan-member-loading">Loading...</p>
                ) : fanBanned ? (
                  <p className="fan-member-banned">You cannot message this creator.</p>
                ) : (
                  <>
                    <p className="fan-member-messages-title">Conversation with {displayName}</p>
                    <div className="fan-member-messages-list">
                      {dmMessages.length === 0 ? (
                        <p className="fan-member-messages-empty">No messages yet. Say hi below.</p>
                      ) : (
                        dmMessages.map((m) => (
                          <div
                            key={m.id}
                            className={`fan-member-message ${m.senderId === auth.currentUser?.uid ? "fan-member-message-sent" : "fan-member-message-received"}`}
                          >
                            <span className="fan-member-message-content">{m.content}</span>
                            {formatDmShortTime(m.createdAt) && (
                              <span className="fan-member-message-time">{formatDmShortTime(m.createdAt)}</span>
                            )}
                            {m.senderId !== auth.currentUser?.uid && (
                              <button
                                type="button"
                                onClick={() => reportMessage(m.id)}
                                disabled={!!reportingMessageId || !!m.reported}
                                className="fan-member-message-report"
                              >
                                {m.reported ? "Reported" : reportingMessageId === m.id ? "Reporting…" : "Report"}
                              </button>
                            )}
                          </div>
                        ))
                      )}
                      <div ref={dmMessagesEndRef} aria-hidden />
                    </div>
                    <div className="fan-member-messages-compose">
                      <textarea
                        ref={dmTextareaRef}
                        rows={1}
                        value={dmInput}
                        onChange={(e) => setDmInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void sendDm();
                          }
                        }}
                        placeholder="Type a message… (Shift+Enter for newline)"
                        className="fan-member-messages-input"
                      />
                      <button
                        type="button"
                        disabled={dmSending || !dmInput.trim()}
                        onClick={sendDm}
                        className="fan-member-messages-send"
                        style={{ backgroundColor: primary }}
                      >
                        {dmSending ? "Sending…" : "Send"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {activeTab === "tip" && (
              <TipSection
                creatorId={creator.creatorId}
                displayName={displayName}
                primary={primary}
                tipSelectedPreset={tipSelectedPreset}
                setTipSelectedPreset={setTipSelectedPreset}
                tipCustomAmount={tipCustomAmount}
                setTipCustomAmount={setTipCustomAmount}
                tipLoading={tipLoading}
                setTipLoading={setTipLoading}
              />
            )}
            {activeTab === "about" && (
              <div className="fan-member-about">
                <h2 className="fan-member-about-title">About {displayName}</h2>
                {bio && (
                  <div className="fan-member-about-section">
                    <p className="fan-member-about-bio">{bio}</p>
                  </div>
                )}
                {(rules?.boundariesText ?? landingContent?.boundaryText) && (
                  <div className="fan-member-about-section">
                    <h3 className="fan-member-about-heading">Community guidelines</h3>
                    <p className="fan-member-about-text">{rules?.boundariesText || landingContent?.boundaryText}</p>
                  </div>
                )}
                {!bio && !rules?.boundariesText && !landingContent?.boundaryText && (
                  <p className="fan-member-empty">No about or guidelines added yet.</p>
                )}
              </div>
            )}
        </div>
      )}
    </div>
  );
};
