import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAppContext } from "./AppContext";
import { auth, db } from "../firebaseConfig";
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc, orderBy, limit } from "firebase/firestore";
import type { TreatProduct, TreatProductType } from "../types";
import { SparklesIcon, CalendarIcon } from "./icons/UIIcons";

function formatPrice(cents: number): string {
  return "$" + (cents / 100).toFixed(2);
}

function formatScheduledDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatScheduledTime(timeStr: string): string {
  if (!timeStr || !timeStr.trim()) return "";
  const [h, min] = timeStr.split(":").map(Number);
  const hour = h ?? 0;
  const minute = min ?? 0;
  if (hour === 0 && minute === 0) return "12:00 AM";
  if (hour < 12) return `${hour}:${String(minute).padStart(2, "0")} AM`;
  if (hour === 12) return `12:${String(minute).padStart(2, "0")} PM`;
  return `${hour - 12}:${String(minute).padStart(2, "0")} PM`;
}

type ScheduledPurchase = {
  id: string;
  productName: string;
  scheduledDate?: string;
  scheduledTime?: string;
  scheduledAt?: Date;
  status: string;
};

type UpcomingSession = {
  id: string;
  durationMinutes: number;
  scheduledStart?: Date;
  status: string;
  memberEmail?: string;
};

type ViewMode = "fan" | "manage";

const GiftIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 12 20 22 4 22 4 12" />
    <rect x="2" y="7" width="20" height="5" />
    <line x1="12" y1="22" x2="12" y2="7" />
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const VideoIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

// Default images by treat type - auto-assigned when no custom image is set
const DEFAULT_TREAT_IMAGES: Record<string, string> = {
  // Video calls - pink/romantic aesthetic
  live_video_5m: "https://images.unsplash.com/photo-1596558450268-9c27524ba856?w=400&h=300&fit=crop",
  live_video_10m: "https://images.unsplash.com/photo-1596558450268-9c27524ba856?w=400&h=300&fit=crop",
  live_video_15m: "https://images.unsplash.com/photo-1596558450268-9c27524ba856?w=400&h=300&fit=crop",
  live_video_30m: "https://images.unsplash.com/photo-1596558450268-9c27524ba856?w=400&h=300&fit=crop",
  live_video_45m: "https://images.unsplash.com/photo-1596558450268-9c27524ba856?w=400&h=300&fit=crop",
  live_video_60m: "https://images.unsplash.com/photo-1596558450268-9c27524ba856?w=400&h=300&fit=crop",
  // Live chat - cozy texting vibe
  live_chat_5m: "https://images.unsplash.com/photo-1534536281715-e28d76689b4d?w=400&h=300&fit=crop",
  live_chat_15m: "https://images.unsplash.com/photo-1534536281715-e28d76689b4d?w=400&h=300&fit=crop",
  live_chat_30m: "https://images.unsplash.com/photo-1534536281715-e28d76689b4d?w=400&h=300&fit=crop",
  live_chat_45m: "https://images.unsplash.com/photo-1534536281715-e28d76689b4d?w=400&h=300&fit=crop",
  live_chat_60m: "https://images.unsplash.com/photo-1534536281715-e28d76689b4d?w=400&h=300&fit=crop",
  live_chat_1h: "https://images.unsplash.com/photo-1534536281715-e28d76689b4d?w=400&h=300&fit=crop",
  // Voice notes - pink neon aesthetic
  voice_note_30s: "https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=400&h=300&fit=crop",
  voice_note_60s: "https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=400&h=300&fit=crop",
  // Private video reply - pink heart/love aesthetic
  private_video_reply: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=400&h=300&fit=crop",
  // Chat session
  chat_session: "https://images.unsplash.com/photo-1516321165247-4aa89a48be28?w=400&h=300&fit=crop",
  // Birthday message - celebration themed
  birthday_message: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=400&h=300&fit=crop",
  // Overthinking response - thoughtful/cozy
  overthinking_response: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&h=300&fit=crop",
  // Random checkin - surprise/hello
  random_checkin: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=400&h=300&fit=crop",
  // Tips - heart/appreciation themed
  tip: "https://images.unsplash.com/photo-1518568814500-bf0f8d125f46?w=400&h=300&fit=crop",
  // Unlock media - lock/exclusive
  unlock_media: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop",
  // Bundle - gift/package
  bundle: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400&h=300&fit=crop",
  // Custom - sparkle/special
  custom: "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=400&h=300&fit=crop",
};

function getTreatImage(product: TreatProduct): string | null {
  // Use custom image if set
  if (product.imageUrl) return product.imageUrl;
  // Fall back to default image for this type
  return DEFAULT_TREAT_IMAGES[product.type] || null;
}

export const TreatsStore: React.FC = () => {
  const { user, showToast } = useAppContext();
  const creatorId = user?.id;
  const [products, setProducts] = useState<TreatProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TreatProduct | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("fan");
  const [purchaseLoading, setPurchaseLoading] = useState<string | null>(null);

  const [scheduledTreats, setScheduledTreats] = useState<ScheduledPurchase[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSession[]>([]);

  const fetchProducts = useCallback(async () => {
    if (!creatorId) return;
    setLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch(
        `/api/products?creatorId=${encodeURIComponent(creatorId)}&includeArchived=true`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to load products");
      }
      const data = await res.json();
      setProducts((data.products as TreatProduct[]) || []);
    } catch (e) {
      console.warn("Products API error (may need backend running):", e);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [creatorId]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    if (!db || !creatorId) {
      setScheduledTreats([]);
      return;
    }
    const q = query(
      collection(db, "purchases"),
      where("creatorId", "==", creatorId),
      where("scheduleStatus", "==", "scheduled")
    );
    return onSnapshot(
      q,
      (snap) => {
        const list: ScheduledPurchase[] = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            productName: (data.productName as string) || "Treat",
            scheduledDate: data.scheduledDate as string | undefined,
            scheduledTime: data.scheduledTime as string | undefined,
            scheduledAt: data.scheduledAt?.toDate?.() as Date | undefined,
            status: (data.scheduleStatus as string) || "scheduled",
          });
        });
        list.sort((a, b) => {
          const ta = a.scheduledAt?.getTime() ?? 0;
          const tb = b.scheduledAt?.getTime() ?? 0;
          return ta - tb;
        });
        setScheduledTreats(list);
      },
      () => setScheduledTreats([])
    );
  }, [creatorId]);

  useEffect(() => {
    if (!db || !creatorId) {
      setUpcomingSessions([]);
      return;
    }
    const q = query(
      collection(db, "chatSessions"),
      where("creatorId", "==", creatorId)
    );
    return onSnapshot(
      q,
      (snap) => {
        const now = Date.now();
        const list: UpcomingSession[] = [];
        snap.forEach((d) => {
          const data = d.data();
          const status = (data.status as string) || "pending";
          if (status === "ended" || status === "cancelled") return;
          const scheduledStart = data.scheduledStart?.toDate?.() as Date | undefined;
          const start = scheduledStart?.getTime() ?? 0;
          if (start > now || status === "active") {
            list.push({
              id: d.id,
              durationMinutes: (data.durationMinutes as number) || 15,
              scheduledStart,
              status,
              memberEmail: data.memberEmail as string | undefined,
            });
          }
        });
        list.sort((a, b) => {
          const ta = a.scheduledStart?.getTime() ?? 0;
          const tb = b.scheduledStart?.getTime() ?? 0;
          return ta - tb;
        });
        setUpcomingSessions(list);
      },
      () => setUpcomingSessions([])
    );
  }, [creatorId]);

  const handleCreate = async (payload: {
    type: TreatProductType;
    title: string;
    description?: string;
    priceCents: number;
    mediaUrl?: string;
    visible: boolean;
    quantityLimit?: number;
  }) => {
    if (!creatorId) return;
    setSaving(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          creatorId,
          type: payload.type,
          title: payload.title,
          description: payload.description || undefined,
          priceCents: payload.priceCents,
          mediaUrl: payload.mediaUrl,
          visible: payload.visible,
          quantityLimit: payload.quantityLimit,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to create");
      showToast?.("Product added", "success");
      setShowForm(false);
      fetchProducts();
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : "Failed to create product", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (
    productId: string,
    updates: Partial<{ title: string; description: string; priceCents: number; mediaUrl: string; visible: boolean; archived: boolean; type: TreatProductType; quantityLimit: number }>
  ) => {
    setSaving(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch(`/api/products?id=${encodeURIComponent(productId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to update");
      showToast?.("Updated", "success");
      setEditing(null);
      fetchProducts();
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : "Failed to update", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!window.confirm("Delete this product? This cannot be undone.")) return;
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch(`/api/products?id=${encodeURIComponent(productId)}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to delete");
      }
      showToast?.("Product deleted", "success");
      setEditing(null);
      fetchProducts();
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : "Failed to delete", "error");
    }
  };

  const handleMarkDelivered = async (purchaseId: string) => {
    try {
      await updateDoc(doc(db, "purchases", purchaseId), {
        scheduleStatus: "delivered",
        deliveredAt: new Date(),
      });
      showToast?.("Marked as delivered", "success");
    } catch {
      showToast?.("Failed to update", "error");
    }
  };

  const handlePurchase = async (productId: string) => {
    const product = visibleProducts.find((p) => p.id === productId);
    if (!product) return;
    const soldOut = typeof product.quantityLimit === "number" && product.quantityLimit > 0 && (product.soldCount ?? 0) >= product.quantityLimit;
    if (soldOut) return;
    
    setPurchaseLoading(productId);
    try {
      showToast?.("Purchase flow coming soon!", "info");
    } finally {
      setPurchaseLoading(null);
    }
  };

  const displayedProducts = useMemo(() => {
    const filtered = showArchived ? products : products.filter((p) => !p.archived);
    return filtered;
  }, [products, showArchived]);

  const visibleProducts = useMemo(() => products.filter((p) => !p.archived && p.visible), [products]);

  // Demo treats for preview when no real products exist
  const demoTreats: TreatProduct[] = useMemo(() => [
    {
      id: "demo-1",
      creatorId: creatorId || "",
      type: "voice_note_30s",
      title: "30-Second Voice Note",
      description: "I'll say your name. Keep it short. Keep it personal.",
      priceCents: 1500,
      visible: true,
      archived: false,
      quantityLimit: 10,
      soldCount: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "demo-2",
      creatorId: creatorId || "",
      type: "voice_note_60s",
      title: "60-Second Voice Note",
      description: "More direct. Slightly longer. Still chill.",
      priceCents: 2500,
      visible: true,
      archived: false,
      quantityLimit: 8,
      soldCount: 8,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "demo-3",
      creatorId: creatorId || "",
      type: "private_video_reply",
      title: "Private Video Reply",
      description: "Ask me something. I'll respond privately.",
      priceCents: 4500,
      visible: true,
      archived: false,
      quantityLimit: 12,
      soldCount: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "demo-4",
      creatorId: creatorId || "",
      type: "live_video_5m",
      title: "5-Min Video Call",
      description: "Quick face-to-face time. Say hi, ask a question, or just vibe.",
      priceCents: 4999,
      visible: true,
      archived: false,
      durationMinutes: 5,
      quantityLimit: 10,
      soldCount: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "demo-5",
      creatorId: creatorId || "",
      type: "live_video_10m",
      title: "10-Min Video Call",
      description: "More time to chat. Perfect for a real conversation.",
      priceCents: 7999,
      visible: true,
      archived: false,
      durationMinutes: 10,
      quantityLimit: 8,
      soldCount: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "demo-6",
      creatorId: creatorId || "",
      type: "live_video_15m",
      title: "15-Min Video Call",
      description: "The full experience. Let's really connect.",
      priceCents: 9999,
      visible: true,
      archived: false,
      durationMinutes: 15,
      quantityLimit: 5,
      soldCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "demo-7",
      creatorId: creatorId || "",
      type: "birthday_message",
      title: "Birthday Message",
      description: "Custom video. Don't make it weird.",
      priceCents: 5000,
      visible: true,
      archived: false,
      quantityLimit: 6,
      soldCount: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "demo-8",
      creatorId: creatorId || "",
      type: "custom",
      title: "Random Check-In",
      description: "A short message from me when you least expect it.",
      priceCents: 2000,
      visible: true,
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ], [creatorId]);

  // Use demo treats if no real products exist
  const displayTreats = visibleProducts.length > 0 ? visibleProducts : demoTreats;
  const isShowingDemo = visibleProducts.length === 0;

  if (!creatorId) {
    return (
      <main className="treats-main">
        <p className="treats-empty">Sign in to view the treats store.</p>
      </main>
    );
  }

  return (
    <main className="treats-main">
      <div className="treats-top-row">
        <section className="treats-store-header">
          <h1 className="treats-title">Treats</h1>
          <p className="treats-subhead">Personal messages, voice notes, and more — just for you.</p>
        </section>

        <div className="treats-view-toggle">
          <button
            type="button"
            className={`treats-view-btn${viewMode === "fan" ? " active" : ""}`}
            onClick={() => setViewMode("fan")}
          >
            <GiftIcon />
            Store
          </button>
          <button
            type="button"
            className={`treats-view-btn${viewMode === "manage" ? " active" : ""}`}
            onClick={() => setViewMode("manage")}
          >
            <SettingsIcon />
            Manage
          </button>
        </div>
      </div>

      {viewMode === "fan" ? (
        <>
          {upcomingSessions.length > 0 && (
            <section className="treats-scheduled-section">
              <h2 className="treats-section-title">Upcoming chat sessions</h2>
              <div className="treats-scheduled-list">
                {upcomingSessions.map((s) => (
                  <div key={s.id} className="treats-scheduled-card treats-scheduled-session">
                    <p className="treats-scheduled-card-title">
                      Live chat ({s.durationMinutes} min)
                      {s.status === "active" && <span className="treats-live-badge">Live Now</span>}
                    </p>
                    <p className="treats-scheduled-card-meta">
                      {s.scheduledStart
                        ? s.scheduledStart.toLocaleString(undefined, {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })
                        : "Time pending"}
                    </p>
                    {s.memberEmail && (
                      <p className="treats-scheduled-card-sub">{s.memberEmail}</p>
                    )}
                    <button type="button" className="treats-scheduled-card-btn">
                      Open chat session
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {scheduledTreats.length > 0 && (
            <section className="treats-scheduled-section">
              <h2 className="treats-section-title">Scheduled for delivery</h2>
              <div className="treats-scheduled-list">
                {scheduledTreats.map((p) => (
                  <div key={p.id} className="treats-scheduled-card treats-scheduled-treat">
                    <p className="treats-scheduled-card-title">{p.productName}</p>
                    <p className="treats-scheduled-card-meta">
                      {p.scheduledDate && formatScheduledDate(p.scheduledDate)}
                      {p.scheduledTime && ` at ${formatScheduledTime(p.scheduledTime)}`}
                    </p>
                    <button
                      type="button"
                      className="treats-scheduled-card-action"
                      onClick={() => handleMarkDelivered(p.id)}
                    >
                      <CheckCircleIcon /> Mark delivered
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {loading ? (
            <p className="treats-loading">Loading…</p>
          ) : (
            <>
              {isShowingDemo && (
                <div className="treats-demo-banner">
                  <span>Preview Mode</span> — These are sample treats. Add your own in Manage.
                </div>
              )}
              <div className="treats-grid treats-grid-fan">
                {displayTreats.map((p) => {
                  const soldOut = typeof p.quantityLimit === "number" && p.quantityLimit > 0 && (p.soldCount ?? 0) >= p.quantityLimit;
                  const qtyLeft = typeof p.quantityLimit === "number" && p.quantityLimit > 0
                    ? p.quantityLimit - (p.soldCount ?? 0)
                    : null;
                  const isVideoCall = p.type.startsWith("live_video_");
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`treat-card treat-card-fan${soldOut ? " sold-out" : ""}${isShowingDemo ? " demo" : ""}${isVideoCall ? " treat-card-video" : ""}${getTreatImage(p) ? " has-image" : ""}`}
                      disabled={soldOut || purchaseLoading !== null || isShowingDemo}
                      onClick={() => !isShowingDemo && handlePurchase(p.id)}
                    >
                      {getTreatImage(p) && (
                        <div className="treat-card-image">
                          <img src={getTreatImage(p)!} alt={p.title} loading="lazy" />
                        </div>
                      )}
                      <div className="treat-card-inner">
                        <div className="treat-card-header">
                          <h2 className="treat-card-title">
                            {isVideoCall && <VideoIcon />}
                            {p.title}
                          </h2>
                          <span className="treat-card-price">{formatPrice(p.priceCents)}</span>
                        </div>
                        {p.description && <p className="treat-card-desc">{p.description}</p>}
                        <div className="treat-card-footer">
                          <span className={`treat-card-qty${soldOut ? " treat-card-qty-sold" : ""}`}>
                            {soldOut ? "Sold out" : qtyLeft !== null ? `${qtyLeft} left` : "Available"}
                          </span>
                          {!soldOut && (
                            <span className="treat-card-cta">
                              {purchaseLoading === p.id ? "…" : "Purchase"}
                            </span>
                          )}
                        </div>
                      </div>
                  </button>
                );
              })}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="treats-manage-toolbar">
            <label className="treats-archive-toggle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show archived
            </label>
            <button
              type="button"
              className="treats-add-btn"
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              <SparklesIcon className="w-5 h-5" />
              Add product
            </button>
          </div>

          {loading ? (
            <p className="treats-loading">Loading…</p>
          ) : (
            <>
              {displayedProducts.length === 0 && (
                <div className="treats-demo-banner">
                  <span>Preview Mode</span> — These are sample treats. Add your own above.
                </div>
              )}
              <div className="treats-manage-list">
                {(displayedProducts.length > 0 ? displayedProducts : demoTreats).map((p) => {
                  const isDemo = displayedProducts.length === 0;
                  const isEditing = editing?.id === p.id;
                  const qtyLeft = typeof p.quantityLimit === "number" ? p.quantityLimit - (p.soldCount || 0) : null;

                  return (
                    <div
                      key={p.id}
                      className={`treat-manage-card${p.archived ? " archived" : ""}${isDemo ? " demo" : ""}${isEditing ? " editing" : ""}`}
                    >
                      {isEditing ? (
                        <InlineEditForm
                          product={p}
                          onSave={(payload) =>
                            handleUpdate(p.id, {
                              type: payload.type,
                              title: payload.title,
                              description: payload.description,
                              priceCents: payload.priceCents,
                              mediaUrl: payload.mediaUrl,
                              imageUrl: payload.imageUrl,
                              visible: payload.visible,
                              quantityLimit: payload.quantityLimit,
                            })
                          }
                          onCancel={() => setEditing(null)}
                          saving={saving}
                        />
                      ) : (
                        <>
                          {getTreatImage(p) && (
                            <div className="treat-manage-card-image">
                              <img src={getTreatImage(p)!} alt={p.title} />
                            </div>
                          )}
                          <div className="treat-manage-card-content">
                            <h3 className="treat-manage-card-title">{p.title}</h3>
                            <div className="treat-manage-card-meta">
                              <span className="treat-manage-card-price">{formatPrice(p.priceCents)}</span>
                              {qtyLeft !== null && (
                                <>
                                  <span className="treat-manage-card-sep">·</span>
                                  <span className="treat-manage-card-qty">{qtyLeft} left</span>
                                </>
                              )}
                            </div>
                            {p.description && <p className="treat-manage-card-desc">{p.description}</p>}
                          </div>
                          <div className="treat-manage-card-actions">
                            <button
                              type="button"
                              className="treat-manage-btn"
                              disabled={isDemo}
                              onClick={() => !isDemo && handleUpdate(p.id, { visible: !p.visible })}
                            >
                              {p.visible ? "Hide" : "Show"}
                            </button>
                            <button
                              type="button"
                              className="treat-manage-btn"
                              onClick={() => {
                                setShowForm(false);
                                setEditing(p);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="treat-manage-btn danger"
                              disabled={isDemo}
                              onClick={() => !isDemo && handleDelete(p.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {showForm && (
        <ProductForm
          product={null}
          onSave={handleCreate}
          onClose={() => {
            setShowForm(false);
          }}
          saving={saving}
        />
      )}
    </main>
  );
};

const InlineEditForm: React.FC<{
  product: TreatProduct;
  onSave: (payload: {
    type: TreatProductType;
    title: string;
    description?: string;
    priceCents: number;
    mediaUrl?: string;
    imageUrl?: string;
    visible: boolean;
    quantityLimit?: number;
  }) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}> = ({ product, onSave, onCancel, saving }) => {
  const [title, setTitle] = useState(product.title);
  const [priceDollars, setPriceDollars] = useState(String(product.priceCents / 100));
  const [description, setDescription] = useState(product.description ?? "");
  const [imageUrl, setImageUrl] = useState(product.imageUrl ?? "");
  const [quantityLimit, setQuantityLimit] = useState(product.quantityLimit ? String(product.quantityLimit) : "");

  const defaultImage = DEFAULT_TREAT_IMAGES[product.type];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onSave({
      type: product.type,
      title: title.trim(),
      description: description.trim() || undefined,
      priceCents: Math.round(parseFloat(priceDollars || "0") * 100),
      mediaUrl: product.mediaUrl,
      imageUrl: imageUrl.trim() || undefined,
      visible: product.visible,
      quantityLimit: quantityLimit ? parseInt(quantityLimit, 10) : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="treat-inline-form">
      <div className="treat-inline-field">
        <label>Name</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Product name"
        />
      </div>
      <div className="treat-inline-field">
        <label>Price ($)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={priceDollars}
          onChange={(e) => setPriceDollars(e.target.value)}
          placeholder="0.00"
        />
      </div>
      <div className="treat-inline-field">
        <label>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What does the fan get?"
        />
      </div>
      <div className="treat-inline-field">
        <label>Card Image URL {defaultImage && "(leave blank for default)"}</label>
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder={defaultImage ? "Using default image for this type" : "https://example.com/image.jpg"}
        />
        {(imageUrl || defaultImage) && (
          <div className="treat-image-preview">
            <img src={imageUrl || defaultImage} alt="Preview" />
          </div>
        )}
      </div>
      <div className="treat-inline-field">
        <label>Quantity left (decremented on each purchase)</label>
        <input
          type="number"
          min="0"
          step="1"
          value={quantityLimit}
          onChange={(e) => setQuantityLimit(e.target.value)}
          placeholder="Unlimited"
        />
      </div>
      <div className="treat-inline-actions">
        <button type="submit" className="treat-inline-save" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="treat-inline-cancel" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
};

const ProductForm: React.FC<{
  product: TreatProduct | null;
  onSave: (payload: {
    type: TreatProductType;
    title: string;
    description?: string;
    priceCents: number;
    mediaUrl?: string;
    visible: boolean;
    quantityLimit?: number;
  }) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}> = ({ product, onSave, onClose, saving }) => {
  const type: TreatProductType = "custom";
  const [title, setTitle] = useState(product?.title ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [priceCents, setPriceCents] = useState(product ? String(product.priceCents) : "");
  const [mediaUrl, setMediaUrl] = useState(product?.mediaUrl ?? "");
  const [quantityLimit, setQuantityLimit] = useState(product?.quantityLimit ? String(product.quantityLimit) : "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(priceCents) * 100) || 0;
    if (!title.trim()) return;
    await onSave({
      type,
      title: title.trim(),
      description: description.trim() || undefined,
      priceCents: cents,
      mediaUrl: mediaUrl.trim() || undefined,
      visible: true,
      quantityLimit: quantityLimit ? parseInt(quantityLimit, 10) : undefined,
    });
  };

  return (
    <div className="treats-form-backdrop" onClick={onClose}>
      <div className="treats-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="treats-form-header">
          <h2>{product ? "Edit product" : "Add product"}</h2>
          <button type="button" className="treats-form-close" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="treats-form-body">
          <div className="treats-form-field">
            <label>Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g. 30-Second Voice Note"
            />
          </div>
          <div className="treats-form-field">
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What does the fan get?"
            />
          </div>
          <div className="treats-form-row">
            <div className="treats-form-field">
              <label>Price ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={priceCents !== "" ? (Number(priceCents) / 100).toFixed(2) : ""}
                onChange={(e) => setPriceCents(String(Math.round((parseFloat(e.target.value || "0") || 0) * 100)))}
                placeholder="0.00"
              />
            </div>
            <div className="treats-form-field">
              <label>Quantity limit</label>
              <input
                type="number"
                min="0"
                step="1"
                value={quantityLimit}
                onChange={(e) => setQuantityLimit(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
          </div>
          {type === "unlock_media" && (
            <div className="treats-form-field">
              <label>Media URL</label>
              <input
                type="url"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          )}
          <div className="treats-form-actions">
            <button type="button" className="treats-form-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="treats-form-submit" disabled={saving || !title.trim()}>
              {saving ? "Saving..." : product ? "Update" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
