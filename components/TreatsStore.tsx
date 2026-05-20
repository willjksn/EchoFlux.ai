import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAppContext } from "./AppContext";
import { auth, db } from "../firebaseConfig";
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  deleteField,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { TreatProduct, TreatProductType } from "../types";
import { SparklesIcon, CalendarIcon, ArrowUpIcon, ArrowDownIcon } from "./icons/UIIcons";
import { useCreatorStoreCopy } from "../src/hooks/useCreatorStoreCopy";
import { creatorIdFirestoreQueryVariants, normalizeCreatorId } from "../src/lib/creatorIdNormalize";
import {
  defaultTreatProductTypeLabel,
  getTreatProductTypeDisplayLabel,
  TREAT_PRODUCT_TYPE_DISPLAY_MAX_LEN,
} from "../src/lib/treatProductTypeLabel";
import { EmojiButton } from "./EmojiPicker";
import { canUseSjHeartEmoji } from "../src/lib/customEmoji";
import { useCreatorHandle } from "../src/hooks/useCreatorHandle";
import { renderTitleWithEmojiSpans } from "../src/lib/renderTitleWithEmojiSpans";

function formatPrice(cents: number | null | undefined): string {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  return "$" + (n / 100).toFixed(2);
}

/** Safe dollars string for treat form inputs (handles missing / odd API types). */
function treatProductToPriceDollarString(product: TreatProduct | null | undefined): string {
  if (!product) return "";
  const raw = (product as { priceCents?: unknown }).priceCents;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return "";
  return (n / 100).toFixed(2);
}

/** Firestore rejects `undefined` in update payloads. */
function firestoreSafePatch(raw: Record<string, unknown>): Record<string, any> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Direct Firestore updates: unlimited = remove field (same semantics as API PATCH). */
function toFirestoreProductPatch(updates: Record<string, unknown>, updatedAtIso: string): Record<string, any> {
  const next: Record<string, unknown> = { ...updates, updatedAt: updatedAtIso };
  if (next.quantityLimit === null) {
    next.quantityLimit = deleteField();
  }
  if (next.typeDisplayLabel === null) {
    next.typeDisplayLabel = deleteField();
  }
  return firestoreSafePatch(next);
}

function compareTreatProducts(a: TreatProduct, b: TreatProduct): number {
  const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (orderDiff !== 0) return orderDiff;
  const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return bTime - aTime;
}

function sortTreatProducts(list: TreatProduct[]): TreatProduct[] {
  return [...list].sort(compareTreatProducts);
}

function treatProductQuantityString(product: TreatProduct | null | undefined): string {
  if (product == null) return "";
  const q = product.quantityLimit;
  if (q == null) return "";
  return String(q);
}

/** Blank → unlimited (`null`). Use `null` (not `undefined`) in PATCH bodies so JSON includes the key. */
function parseTreatQuantityLimitInput(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

function toOptionalNonNegativeInt(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return undefined;
}

/** Map Firestore product doc → TreatProduct (API + client fallback). */
function firestoreDocToTreatProduct(d: QueryDocumentSnapshot): TreatProduct {
  const x = d.data();
  const createdRaw = x.createdAt;
  const updatedRaw = x.updatedAt;
  const createdAt =
    createdRaw && typeof (createdRaw as { toDate?: () => Date }).toDate === "function"
      ? (createdRaw as { toDate: () => Date }).toDate().toISOString()
      : String(createdRaw ?? "");
  const updatedAt =
    updatedRaw && typeof (updatedRaw as { toDate?: () => Date }).toDate === "function"
      ? (updatedRaw as { toDate: () => Date }).toDate().toISOString()
      : String(updatedRaw ?? "");
  const rawC = String(x.creatorId ?? "");
  const quantityLimit = toOptionalNonNegativeInt(x.quantityLimit);
  const soldCount = toOptionalNonNegativeInt(x.soldCount);
  return {
    id: d.id,
    creatorId: normalizeCreatorId(rawC) || rawC,
    type: ((x.type as TreatProductType) || "custom") as TreatProductType,
    title: String(x.title ?? ""),
    description: typeof x.description === "string" ? x.description : undefined,
    priceCents: Number(x.priceCents) || 0,
    mediaUrl: typeof x.mediaUrl === "string" ? x.mediaUrl : undefined,
    imageUrl: typeof x.imageUrl === "string" ? x.imageUrl : undefined,
    archived: !!x.archived,
    visible: x.visible !== false,
    showOnLandingPage: x.showOnLandingPage !== false,
    showInMemberStore: x.showInMemberStore !== false,
    sortOrder: typeof x.sortOrder === "number" ? x.sortOrder : undefined,
    quantityLimit,
    soldCount,
    createdAt,
    updatedAt,
  };
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

const SettingsIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const TreatsStore: React.FC = () => {
  const { user, showToast } = useAppContext();
  /** Prefer Auth uid (canonical); strip accidental `--collection=` suffix from profile ids. */
  const creatorIdRaw = auth.currentUser?.uid ?? user?.id;
  const creatorId =
    creatorIdRaw !== undefined && creatorIdRaw !== null && String(creatorIdRaw).trim() !== ""
      ? normalizeCreatorId(String(creatorIdRaw)) || String(creatorIdRaw).trim()
      : undefined;
  const [products, setProducts] = useState<TreatProduct[]>([]);
  const [loading, setLoading] = useState(true);
  /** Defer purchases/sessions listeners until products request finishes so the tab feels fast. */
  const [treatsDataReady, setTreatsDataReady] = useState(false);
  const [editing, setEditing] = useState<TreatProduct | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Row-level PATCH (publish / placement) so other cards don’t disable or flash. */
  const [patchingId, setPatchingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("fan");
  const [purchaseLoading, setPurchaseLoading] = useState<string | null>(null);
  const storeCopy = useCreatorStoreCopy(creatorId);
  const creatorHandleFromDoc = useCreatorHandle(creatorId);
  const includeSjHeartEmoji = useMemo(
    () =>
      canUseSjHeartEmoji({
        creatorHandle: creatorHandleFromDoc,
        viewerIsAdmin: user?.role === "Admin",
      }),
    [creatorHandleFromDoc, user?.role],
  );

  const [scheduledTreats, setScheduledTreats] = useState<ScheduledPurchase[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSession[]>([]);

  /** Match FanStorefrontView: Stripe replaces `{CHECKOUT_SESSION_ID}`; `purchase_sync` triggers /api/syncFanCheckoutSession after return. */
  const buildTreatsStoreSuccessUrl = useCallback((returnHref: string) => {
    try {
      const u = new URL(returnHref);
      const p = new URLSearchParams(u.search.startsWith("?") ? u.search.slice(1) : u.search);
      p.set("store_purchase", "success");
      p.set("purchase_sync", "1");
      const enc = p.toString();
      u.search = enc ? `${enc}&session_id={CHECKOUT_SESSION_ID}` : `purchase_sync=1&session_id={CHECKOUT_SESSION_ID}`;
      return u.toString();
    } catch {
      return returnHref;
    }
  }, []);

  const fetchProducts = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!creatorId) return;
    const quiet = opts?.quiet === true;
    if (!quiet) {
      setLoading(true);
      setTreatsDataReady(false);
    }
    try {
      // Avoid getIdToken(true) here — forced refresh adds seconds on every Store tab visit.
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch(
        `/api/products?creatorId=${encodeURIComponent(creatorId)}&includeArchived=true`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (res.ok) {
        const data = await res.json();
        let prods = (data.products as TreatProduct[]) || [];
        if (
          prods.length === 0 &&
          user?.id &&
          auth.currentUser?.uid &&
          user.id !== auth.currentUser.uid
        ) {
          const res2 = await fetch(
            `/api/products?creatorId=${encodeURIComponent(user.id)}&includeArchived=true`,
            { headers: token ? { Authorization: `Bearer ${token}` } : {} }
          );
          if (res2.ok) {
            const d2 = await res2.json();
            const p2 = (d2.products as TreatProduct[]) || [];
            if (p2.length > 0) {
              console.warn(
                "[TreatsStore] Products loaded with profile user.id (Auth uid had none). Check `products.creatorId` in Firestore.",
                { authUid: auth.currentUser.uid, profileUserId: user.id }
              );
              prods = p2;
            }
          }
        }
        setProducts(prods);
        return;
      }
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || `Failed to load products (${res.status})`);
    } catch (e) {
      console.warn("Products API error (trying Firestore fallback):", e);
      if (!db) {
        setProducts([]);
        return;
      }
      try {
        const loadFs = async (cid: string) => {
          const qs = query(collection(db, "products"), where("creatorId", "==", cid));
          const snap = await getDocs(qs);
          return snap.docs.map(firestoreDocToTreatProduct);
        };
        const firstNonEmpty = (rowSets: TreatProduct[][]) => {
          for (const rows of rowSets) if (rows.length > 0) return rows;
          return [] as TreatProduct[];
        };

        let list: TreatProduct[] = firstNonEmpty(
          await Promise.all(creatorIdFirestoreQueryVariants(creatorId).map(loadFs))
        );
        if (
          list.length === 0 &&
          user?.id &&
          auth.currentUser?.uid &&
          user.id !== auth.currentUser.uid
        ) {
          list = firstNonEmpty(
            await Promise.all(creatorIdFirestoreQueryVariants(user.id).map(loadFs))
          );
        }
        list.sort((a, b) => {
          const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
          if (orderDiff !== 0) return orderDiff;
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });
        setProducts(list);
      } catch (fe) {
        console.warn("Firestore products load failed:", fe);
        setProducts([]);
      }
    } finally {
      if (!quiet) {
        setLoading(false);
        setTreatsDataReady(true);
      }
    }
  }, [creatorId, user?.id]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  /** Creator fan-preview checkout returns here; webhook may lag — same sync as member storefront. */
  useEffect(() => {
    if (typeof window === "undefined" || !creatorId || !auth.currentUser) return;
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");
    if (!sid || params.get("purchase_sync") !== "1") return;
    let cancelled = false;
    (async () => {
      try {
        const token = await auth.currentUser!.getIdToken(true);
        const res = await fetch("/api/syncFanCheckoutSession", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId: sid, creatorId }),
        });
        if (cancelled) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (import.meta.env.DEV) console.warn("TreatsStore syncFanCheckoutSession", res.status, data);
          return;
        }
        const url = new URL(window.location.href);
        url.searchParams.delete("session_id");
        url.searchParams.delete("purchase_sync");
        const qs = url.searchParams.toString();
        window.history.replaceState({}, "", url.pathname + (qs ? `?${qs}` : "") + (url.hash || ""));
        void fetchProducts({ quiet: true });
      } catch (e) {
        if (import.meta.env.DEV) console.warn("TreatsStore checkout sync", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creatorId, fetchProducts]);

  /** After returning from Stripe Checkout (member product). */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("store_purchase") !== "success") return;
    showToast?.("Payment successful. Thank you!", "success");
    params.delete("store_purchase");
    const qs = params.toString();
    const path = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", path);
  }, [showToast]);

  useEffect(() => {
    if (!creatorId) {
      setTreatsDataReady(false);
      setScheduledTreats([]);
      setUpcomingSessions([]);
    }
  }, [creatorId]);

  useEffect(() => {
    if (!db || !creatorId || !treatsDataReady) {
      if (!creatorId || !treatsDataReady) setScheduledTreats([]);
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
            productName: (data.productName as string) || "Product",
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
  }, [creatorId, treatsDataReady]);

  useEffect(() => {
    if (!db || !creatorId || !treatsDataReady) {
      if (!creatorId || !treatsDataReady) setUpcomingSessions([]);
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
  }, [creatorId, treatsDataReady]);

  const createProductViaFirestore = useCallback(
    async (payload: {
      type: TreatProductType;
      title: string;
      description?: string;
      priceCents: number;
      mediaUrl?: string;
      visible: boolean;
      showOnLandingPage?: boolean;
      showInMemberStore?: boolean;
      quantityLimit?: number | null;
      typeDisplayLabel?: string | null;
    }) => {
      if (!db || !creatorId || !auth.currentUser) return false;
      const now = new Date().toISOString();
      const docData: Record<string, unknown> = {
        creatorId,
        type: payload.type,
        title: payload.title,
        description: payload.description?.trim() ? payload.description.trim() : null,
        priceCents: Math.max(0, payload.priceCents),
        mediaUrl: payload.mediaUrl?.trim() ? payload.mediaUrl.trim() : null,
        imageUrl: null,
        archived: false,
        visible: payload.visible,
        showOnLandingPage: payload.showOnLandingPage !== false,
        showInMemberStore: payload.showInMemberStore !== false,
        sortOrder: 0,
        soldCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      if (payload.quantityLimit != null && Number.isFinite(payload.quantityLimit)) {
        docData.quantityLimit = Math.max(0, Math.floor(payload.quantityLimit));
      }
      const label =
        typeof payload.typeDisplayLabel === "string"
          ? payload.typeDisplayLabel.trim().slice(0, TREAT_PRODUCT_TYPE_DISPLAY_MAX_LEN)
          : "";
      if (label) docData.typeDisplayLabel = label;
      await addDoc(collection(db, "products"), docData);
      return true;
    },
    [creatorId]
  );

  const handleCreate = async (payload: {
    type: TreatProductType;
    title: string;
    description?: string;
    priceCents: number;
    mediaUrl?: string;
    visible: boolean;
    showOnLandingPage?: boolean;
    showInMemberStore?: boolean;
    quantityLimit?: number | null;
    typeDisplayLabel?: string | null;
  }) => {
    if (!creatorId) return;
    setSaving(true);
    const labelTrim =
      typeof payload.typeDisplayLabel === "string"
        ? payload.typeDisplayLabel.trim().slice(0, TREAT_PRODUCT_TYPE_DISPLAY_MAX_LEN)
        : "";
    const bodyObj: Record<string, unknown> = {
      creatorId,
      type: payload.type,
      title: payload.title,
      description: payload.description || undefined,
      priceCents: payload.priceCents,
      mediaUrl: payload.mediaUrl,
      visible: payload.visible,
      showOnLandingPage: payload.showOnLandingPage !== false,
      showInMemberStore: payload.showInMemberStore !== false,
      quantityLimit: payload.quantityLimit,
    };
    if (labelTrim) bodyObj.typeDisplayLabel = labelTrim;
    const body = JSON.stringify(bodyObj);

    const finishOk = (msg: string) => {
      showToast?.(msg, "success");
      setShowForm(false);
      void fetchProducts();
    };

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      let res: Response;
      try {
        res = await fetch("/api/products", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body,
        });
      } catch {
        if (await createProductViaFirestore(payload)) {
          finishOk("Product added (saved directly — API unreachable; use Vercel dev or DEV_API_PROXY for API mode).");
          return;
        }
        throw new Error("Network error and could not save to database.");
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        finishOk("Product added");
        return;
      }

      if ((res.status >= 500 || res.status === 404) && (await createProductViaFirestore(payload))) {
        finishOk("Product added (saved directly — API unavailable).");
        return;
      }

      throw new Error((data as { error?: string }).error || `Failed to create (${res.status})`);
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : "Failed to create product", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (
    productId: string,
    updates: Partial<{
      title: string;
      description: string;
      priceCents: number;
      mediaUrl: string;
      imageUrl: string;
      visible: boolean;
      showOnLandingPage: boolean;
      showInMemberStore: boolean;
      archived: boolean;
      type: TreatProductType;
      typeDisplayLabel: string | null;
      /** Pass null to clear limit (unlimited). Omit field only when not changing quantity. */
      quantityLimit: number | null;
      sortOrder: number;
    }>,
    options?: { useGlobalSaving?: boolean; quietUi?: boolean }
  ) => {
    const quietUi = options?.quietUi === true;
    const useGlobalSaving = options?.useGlobalSaving !== false;
    if (!quietUi) {
      if (useGlobalSaving) setSaving(true);
      else setPatchingId(productId);
    }
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      let res: Response;
      try {
        res = await fetch(`/api/products?id=${encodeURIComponent(productId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(updates),
        });
      } catch {
        if (db) {
          const patch = toFirestoreProductPatch({ ...updates }, new Date().toISOString());
          await updateDoc(doc(db, "products", productId), patch);
          if (useGlobalSaving) showToast?.("Updated (direct database — API unreachable)", "success");
          if (!quietUi) setEditing(null);
          void fetchProducts({ quiet: !useGlobalSaving });
          return;
        }
        throw new Error("Network error");
      }
      const data = (await res.json().catch(() => ({}))) as { product?: TreatProduct; error?: string };
      if (res.ok && data.product) {
        setProducts((prev) =>
          prev.map((pr) => {
            if (pr.id !== productId) return pr;
            const merged = { ...pr, ...data.product! } as TreatProduct;
            // Avoid stale limit when unlimited: JSON may omit undefined; always honor PATCH intent.
            if (Object.prototype.hasOwnProperty.call(updates, "quantityLimit")) {
              const ql = data.product!.quantityLimit;
              merged.quantityLimit = ql != null && typeof ql === "number" ? ql : undefined;
            }
            if (Object.prototype.hasOwnProperty.call(updates, "typeDisplayLabel")) {
              const lab = data.product!.typeDisplayLabel;
              merged.typeDisplayLabel =
                typeof lab === "string" && lab.trim() ? lab.trim().slice(0, TREAT_PRODUCT_TYPE_DISPLAY_MAX_LEN) : undefined;
            }
            return merged;
          })
        );
        if (useGlobalSaving) showToast?.("Updated", "success");
        if (!quietUi) setEditing(null);
        return;
      }
      if (res.ok) {
        void fetchProducts({ quiet: true });
        if (useGlobalSaving) showToast?.("Updated", "success");
        if (!quietUi) setEditing(null);
        return;
      }
      if ((res.status >= 500 || res.status === 404) && db) {
        const patch = toFirestoreProductPatch({ ...updates }, new Date().toISOString());
        await updateDoc(doc(db, "products", productId), patch);
        if (useGlobalSaving) showToast?.("Updated (direct database)", "success");
        if (!quietUi) setEditing(null);
        void fetchProducts({ quiet: true });
        return;
      }
      throw new Error(data.error || "Failed to update");
    } catch (e) {
      if (!quietUi) {
        showToast?.(e instanceof Error ? e.message : "Failed to update", "error");
        void fetchProducts({ quiet: true });
      }
      throw e;
    } finally {
      if (!quietUi) {
        setSaving(false);
        setPatchingId(null);
      }
    }
  };

  const reorderDisplayedProduct = async (productId: string, delta: -1 | 1) => {
    if (editing != null) return;
    const filtered = showArchived ? products : products.filter((p) => !p.archived);
    const sorted = sortTreatProducts(filtered);
    const idx = sorted.findIndex((p) => p.id === productId);
    const j = idx + delta;
    if (idx < 0 || j < 0 || j >= sorted.length) return;

    const row = [...sorted];
    [row[idx], row[j]] = [row[j], row[idx]];

    const patches = row
      .map((p, i) => ({ id: p.id, sortOrder: i }))
      .filter(({ id, sortOrder }) => {
        const p = products.find((x) => x.id === id);
        return (p?.sortOrder ?? 0) !== sortOrder;
      });

    if (patches.length === 0) return;

    setProducts((prev) =>
      prev.map((p) => {
        const patch = patches.find((x) => x.id === p.id);
        return patch ? { ...p, sortOrder: patch.sortOrder } : p;
      })
    );

    setSaving(true);
    try {
      for (const { id, sortOrder } of patches) {
        await handleUpdate(id, { sortOrder }, { useGlobalSaving: false, quietUi: true });
      }
      showToast?.("Order saved", "success");
    } catch {
      showToast?.("Could not save order", "error");
      void fetchProducts({ quiet: true });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!window.confirm("Delete this product? This cannot be undone.")) return;
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      let res: Response;
      try {
        res = await fetch(`/api/products?id=${encodeURIComponent(productId)}`, {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch {
        if (db) {
          await deleteDoc(doc(db, "products", productId));
          showToast?.("Product deleted (direct database)", "success");
          setEditing(null);
          void fetchProducts({ quiet: true });
          return;
        }
        throw new Error("Network error");
      }
      if (res.ok) {
        showToast?.("Product deleted", "success");
        setEditing(null);
        void fetchProducts({ quiet: true });
        return;
      }
      if ((res.status >= 500 || res.status === 404) && db) {
        await deleteDoc(doc(db, "products", productId));
        showToast?.("Product deleted (direct database)", "success");
        setEditing(null);
        void fetchProducts({ quiet: true });
        return;
      }
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || "Failed to delete");
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
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const soldOut =
      typeof product.quantityLimit === "number" &&
      product.quantityLimit > 0 &&
      (product.soldCount ?? 0) >= product.quantityLimit;
    if (soldOut) return;
    if (!auth.currentUser) {
      showToast?.("Sign in to complete checkout.", "info");
      return;
    }
    const checkoutCreatorId = (product.creatorId && String(product.creatorId).trim()) || creatorId;
    if (!checkoutCreatorId) return;

    setPurchaseLoading(productId);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const returnUrl = window.location.href;
      const successUrl = buildTreatsStoreSuccessUrl(returnUrl);
      const res = await fetch("/api/createFanCheckoutSession", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          creatorId: checkoutCreatorId,
          type: "product",
          productId,
          successUrl,
          cancelUrl: returnUrl,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) {
        showToast?.(data.error || "Checkout failed", "error");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      showToast?.("No checkout URL returned", "error");
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : "Checkout failed", "error");
    } finally {
      setPurchaseLoading(null);
    }
  };

  const displayedProducts = useMemo(() => {
    const filtered = showArchived ? products : products.filter((p) => !p.archived);
    return sortTreatProducts(filtered);
  }, [products, showArchived]);

  const visibleProducts = useMemo(
    () => products.filter((p) => !p.archived && p.visible && p.showInMemberStore !== false),
    [products]
  );

  /**
   * Member-tab storefront uses visibility + showInMemberStore. This screen only ever loads `products`
   * for the signed-in creator, so when that filter yields nothing we still show the same non-archived
   * rows as Manage (matches the grid you see on stormijxo / Studio Store preview).
   */
  const displayTreats = visibleProducts;
  const nonArchivedProducts = useMemo(() => products.filter((p) => !p.archived), [products]);
  const fanStoreGridItems = useMemo(() => {
    let base: TreatProduct[];
    if (displayTreats.length > 0) base = displayTreats;
    else if (nonArchivedProducts.length > 0) base = nonArchivedProducts;
    else base = displayTreats;
    return sortTreatProducts(base);
  }, [displayTreats, nonArchivedProducts]);

  if (!creatorId) {
    return (
      <main className="treats-main">
        <p className="treats-empty">Sign in to manage your store.</p>
      </main>
    );
  }

  return (
    <main className="treats-main">
      <div className={`treats-top-row${viewMode === "fan" ? " treats-top-row--fan-only" : ""}`}>
        {viewMode === "manage" ? (
          <section className="treats-store-header">
            <h1 className="treats-title">Store</h1>
            <p className="treats-subhead">
              Manage products, pricing, and visibility. Use <strong>Store</strong> preview to see what fans see (name and copy come from My Page).
            </p>
          </section>
        ) : null}

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

          <div className="treats-fan-shell">
            <div className="treats-stormij-panel">
              <header className="treats-stormij-panel-header">
                <h2 className="treats-stormij-panel-title">{storeCopy.memberStoreTitle}</h2>
                <p className="treats-stormij-panel-sub">{storeCopy.memberStoreSubtitle}</p>
                <div className="treats-stormij-panel-rule" aria-hidden />
              </header>
              {loading ? (
                <p className="treats-stormij-panel-state">{storeCopy.memberStoreLoadingMessage}</p>
              ) : fanStoreGridItems.length === 0 ? (
                <p className="treats-stormij-panel-state treats-stormij-panel-state--empty">
                  {storeCopy.memberStoreEmptyMessage}
                </p>
              ) : (
                <div className="treats-stormij-grid">
                  {fanStoreGridItems.map((p) => {
                    const limit = toOptionalNonNegativeInt(p.quantityLimit);
                    const sold = toOptionalNonNegativeInt(p.soldCount) ?? 0;
                    const soldOut = typeof limit === "number" && limit > 0 && sold >= limit;
                    const qtyLeft = typeof limit === "number" && limit > 0 ? Math.max(0, limit - sold) : null;
                    const cardCategory = getTreatProductTypeDisplayLabel(p);
                    return (
                      <article
                        key={p.id}
                        className={`treats-stormij-card${soldOut ? " treats-stormij-card--sold-out" : ""}`}
                      >
                        {cardCategory ? <p className="treats-stormij-card-type">{cardCategory}</p> : null}
                        <div className="treats-stormij-card-row1">
                          <h3 className="treats-stormij-card-title">
                            {renderTitleWithEmojiSpans(p.title, "treats-stormij-card-title-emoji", {
                              textClassName: "treats-stormij-card-title-text",
                            })}
                          </h3>
                          <div className="treats-stormij-card-price-block">
                            <span className="treats-stormij-card-price">{formatPrice(p.priceCents)}</span>
                            <span className="treats-stormij-card-heart" aria-hidden>
                              ♡
                            </span>
                          </div>
                        </div>
                        {p.description ? (
                          <p className="treats-stormij-card-desc">{p.description}</p>
                        ) : null}
                        <div className="treats-stormij-card-footer">
                          <span className="treats-stormij-card-stock">
                            {soldOut ? "Sold out" : qtyLeft !== null ? `${qtyLeft} left` : "Available"}
                          </span>
                          <button
                            type="button"
                            className="treats-stormij-card-purchase"
                            disabled={soldOut || purchaseLoading !== null}
                            onClick={() => void handlePurchase(p.id)}
                          >
                            {purchaseLoading === p.id ? "…" : soldOut ? "Sold out" : "Purchase"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="treats-manage-toolbar">
            <button
              type="button"
              className={`treats-archive-btn${showArchived ? " treats-archive-btn--active" : ""}`}
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? "Hide archived" : "Show archived"}
            </button>
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
          <p className="treats-reorder-hint">
            In <strong>Manage</strong>, use the arrows on each card to set the order fans see in the store preview and on your live page.
          </p>

          {loading ? (
            <p className="treats-loading">Loading…</p>
          ) : displayedProducts.length === 0 ? (
            <div className="treats-empty treats-empty--onboarding">
              <p className="treats-empty-title">Your store is ready — add your first product</p>
              <p className="treats-empty-hint">
                Use <strong>Add product</strong> to set a title, price, and image. Turn on “Show on landing” or “Member store” so fans can buy.
              </p>
              <p className="treats-empty-hint">
                Customize headlines and the public store card on{" "}
                <button
                  type="button"
                  className="treats-empty-link"
                  onClick={() => window.location.assign("/studio?tab=myPage")}
                >
                  My Page
                </button>
                .
              </p>
            </div>
          ) : (
            <div className="treats-manage-list">
              {displayedProducts.map((p, cardIndex) => {
                const isEditing = editing?.id === p.id;
                const limit = toOptionalNonNegativeInt(p.quantityLimit);
                const sold = toOptionalNonNegativeInt(p.soldCount) ?? 0;
                const qtyLeft =
                  typeof limit === "number" && limit > 0 ? Math.max(0, limit - sold) : null;
                const reorderBusy = saving || patchingId !== null;
                const atFirst = cardIndex === 0;
                const atLast = cardIndex >= displayedProducts.length - 1;
                const cardCategory = getTreatProductTypeDisplayLabel(p);

                return (
                  <div
                    key={p.id}
                    className={`treat-manage-card${p.archived ? " archived" : ""}${isEditing ? " editing" : ""}`}
                  >
                    {isEditing ? (
                      <InlineEditForm
                        key={p.id}
                        product={p}
                        includeSjHeartEmoji={includeSjHeartEmoji}
                        onSave={(payload) =>
                          handleUpdate(p.id, {
                            type: payload.type,
                            title: payload.title,
                            description: payload.description,
                            priceCents: payload.priceCents,
                            imageUrl: payload.imageUrl,
                            visible: payload.visible,
                            quantityLimit: payload.quantityLimit,
                            typeDisplayLabel: payload.typeDisplayLabel,
                          })
                        }
                        onCancel={() => setEditing(null)}
                        saving={saving}
                      />
                    ) : (
                      <>
                        <div className="treat-manage-card-order" aria-label="Reorder product">
                          <button
                            type="button"
                            className="treat-manage-card-order-btn"
                            title="Move up"
                            disabled={reorderBusy || atFirst}
                            onClick={() => void reorderDisplayedProduct(p.id, -1)}
                          >
                            <ArrowUpIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className="treat-manage-card-order-btn"
                            title="Move down"
                            disabled={reorderBusy || atLast}
                            onClick={() => void reorderDisplayedProduct(p.id, 1)}
                          >
                            <ArrowDownIcon className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="treat-manage-card-content">
                          {cardCategory ? <p className="treat-manage-card-kind">{cardCategory}</p> : null}
                          <h3 className="treat-manage-card-title">
                            {renderTitleWithEmojiSpans(p.title, "treat-manage-card-title-emoji", {
                              textClassName: "treat-manage-card-title-text",
                            })}
                          </h3>
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
                        <div className="treat-manage-card-right">
                          <div className="treat-manage-card-actions treat-manage-card-actions--row">
                            <button
                              type="button"
                              className="treat-manage-btn"
                              disabled={patchingId === p.id}
                              onClick={() =>
                                void handleUpdate(p.id, { visible: !p.visible }, { useGlobalSaving: false })
                              }
                            >
                              {p.visible ? "Unpublish" : "Publish"}
                            </button>
                            <button
                              type="button"
                              className="treat-manage-btn"
                              disabled={patchingId === p.id}
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
                              disabled={patchingId === p.id}
                              onClick={() => handleDelete(p.id)}
                            >
                              Delete
                            </button>
                          </div>
                          <div
                            className={`treat-manage-placement${!p.visible ? " treat-manage-placement--disabled" : ""}`}
                            aria-disabled={!p.visible}
                          >
                            <span className="treat-manage-placement-label">Show where</span>
                            <div className="treat-manage-toggle-row">
                              <button
                                type="button"
                                className={`treat-manage-toggle${p.showOnLandingPage !== false ? " treat-manage-toggle--on" : ""}`}
                                disabled={!p.visible || patchingId === p.id}
                                onClick={() =>
                                  void handleUpdate(
                                    p.id,
                                    { showOnLandingPage: !(p.showOnLandingPage !== false) },
                                    { useGlobalSaving: false }
                                  )
                                }
                              >
                                Landing store
                                <span className="treat-manage-toggle-state">
                                  {p.showOnLandingPage !== false ? "On" : "Off"}
                                </span>
                              </button>
                              <button
                                type="button"
                                className={`treat-manage-toggle${p.showInMemberStore !== false ? " treat-manage-toggle--on" : ""}`}
                                disabled={!p.visible || patchingId === p.id}
                                onClick={() =>
                                  void handleUpdate(
                                    p.id,
                                    { showInMemberStore: !(p.showInMemberStore !== false) },
                                    { useGlobalSaving: false }
                                  )
                                }
                              >
                                Member tab
                                <span className="treat-manage-toggle-state">
                                  {p.showInMemberStore !== false ? "On" : "Off"}
                                </span>
                              </button>
                            </div>
                            {!p.visible ? (
                              <p className="treat-manage-placement-hint">Publish the treat to choose where it appears.</p>
                            ) : null}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {showForm && (
        <ProductForm
          key="treats-add-product"
          product={null}
          includeSjHeartEmoji={includeSjHeartEmoji}
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
  includeSjHeartEmoji: boolean;
  onSave: (payload: {
    type: TreatProductType;
    title: string;
    description?: string;
    priceCents: number;
    mediaUrl?: string;
    imageUrl?: string;
    visible: boolean;
    quantityLimit?: number | null;
    typeDisplayLabel?: string | null;
  }) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}> = ({ product, includeSjHeartEmoji, onSave, onCancel, saving }) => {
  const [title, setTitle] = useState(product.title);
  const [priceDollars, setPriceDollars] = useState(() => treatProductToPriceDollarString(product));
  const [description, setDescription] = useState(product.description ?? "");
  const [imageUrl, setImageUrl] = useState(product.imageUrl ?? "");
  const [quantityLimit, setQuantityLimit] = useState(() => treatProductQuantityString(product));
  const [typeDisplayLabel, setTypeDisplayLabel] = useState(() => product.typeDisplayLabel ?? "");

  const onInlinePriceChange = (raw: string) => {
    if (raw === "") {
      setPriceDollars("");
      return;
    }
    if (/^\d*\.?\d*$/.test(raw)) setPriceDollars(raw);
  };
  const onInlineQtyChange = (raw: string) => {
    if (raw === "") {
      setQuantityLimit("");
      return;
    }
    if (/^\d+$/.test(raw)) setQuantityLimit(raw);
  };

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
      quantityLimit: parseTreatQuantityLimitInput(quantityLimit),
      typeDisplayLabel:
        typeDisplayLabel.trim().slice(0, TREAT_PRODUCT_TYPE_DISPLAY_MAX_LEN) || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="treat-inline-form">
      <div className="treat-inline-field">
        <label>Name</label>
        <div className="treat-inline-input-row">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Product name"
          />
          <EmojiButton
            includeSjHeartEmoji={includeSjHeartEmoji}
            onSelect={(emoji) => setTitle((t) => t + emoji)}
          />
        </div>
      </div>
      <div className="treat-inline-field">
        <label>Card category line (optional)</label>
        <div className="treat-inline-input-row">
          <input
            type="text"
            value={typeDisplayLabel}
            maxLength={TREAT_PRODUCT_TYPE_DISPLAY_MAX_LEN}
            onChange={(e) => setTypeDisplayLabel(e.target.value)}
            placeholder={`e.g. ${defaultTreatProductTypeLabel(product.type)}`}
          />
          <EmojiButton
            includeSjHeartEmoji={includeSjHeartEmoji}
            onSelect={(emoji) =>
              setTypeDisplayLabel((prev) =>
                `${prev}${emoji}`.slice(0, TREAT_PRODUCT_TYPE_DISPLAY_MAX_LEN),
              )
            }
          />
        </div>
        <p className="treat-inline-hint">
          Optional line above the title on landing and member store. Leave blank to hide it.
        </p>
      </div>
      <div className="treat-inline-field">
        <label>Price ($)</label>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={priceDollars}
          onChange={(e) => onInlinePriceChange(e.target.value)}
          placeholder="0.00"
        />
      </div>
      <div className="treat-inline-field">
        <label>Description</label>
        <div className="treat-inline-input-row treat-inline-input-row--multiline">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What does the fan get?"
          />
          <span className="treat-inline-emoji-anchor">
            <EmojiButton
              includeSjHeartEmoji={includeSjHeartEmoji}
              onSelect={(emoji) => setDescription((d) => d + emoji)}
            />
          </span>
        </div>
      </div>
      <div className="treat-inline-field">
        <label>Card image URL (optional)</label>
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://…"
        />
      </div>
      <div className="treat-inline-field">
        <label>Quantity left (decremented on each purchase)</label>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={quantityLimit}
          onChange={(e) => onInlineQtyChange(e.target.value)}
          placeholder="Unlimited (leave blank)"
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
  includeSjHeartEmoji: boolean;
  onSave: (payload: {
    type: TreatProductType;
    title: string;
    description?: string;
    priceCents: number;
    mediaUrl?: string;
    visible: boolean;
    showOnLandingPage?: boolean;
    showInMemberStore?: boolean;
    quantityLimit?: number | null;
    typeDisplayLabel?: string | null;
  }) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}> = ({ product, includeSjHeartEmoji, onSave, onClose, saving }) => {
  const type: TreatProductType = product?.type ?? "custom";
  const [title, setTitle] = useState(() => product?.title ?? "");
  const [description, setDescription] = useState(() => product?.description ?? "");
  /** Dollar string while typing — do not normalize on every keystroke (breaks cursor / decimals). */
  const [priceDollars, setPriceDollars] = useState(() => treatProductToPriceDollarString(product));
  const [mediaUrl, setMediaUrl] = useState(() => (product?.mediaUrl != null ? String(product.mediaUrl) : ""));
  const [quantityLimit, setQuantityLimit] = useState(() => treatProductQuantityString(product));
  const [typeDisplayLabel, setTypeDisplayLabel] = useState(() => product?.typeDisplayLabel ?? "");

  const onPriceDollarsChange = (raw: string) => {
    if (raw === "") {
      setPriceDollars("");
      return;
    }
    // Allow typing partial values: "", "1", "12.", "12.5", "0.99"
    if (/^\d*\.?\d*$/.test(raw)) {
      setPriceDollars(raw);
    }
  };

  const onQuantityChange = (raw: string) => {
    if (raw === "") {
      setQuantityLimit("");
      return;
    }
    if (/^\d+$/.test(raw)) {
      setQuantityLimit(raw);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(priceDollars || "0") * 100) || 0;
    if (!title.trim()) return;
    await onSave({
      type,
      title: title.trim(),
      description: description.trim() || undefined,
      priceCents: cents,
      mediaUrl: String(mediaUrl ?? "").trim() || undefined,
      visible: true,
      quantityLimit: parseTreatQuantityLimitInput(quantityLimit),
      typeDisplayLabel:
        typeDisplayLabel.trim().slice(0, TREAT_PRODUCT_TYPE_DISPLAY_MAX_LEN) || null,
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
            <div className="treat-inline-input-row">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g. 30-Second Voice Note"
              />
              <EmojiButton
                includeSjHeartEmoji={includeSjHeartEmoji}
                onSelect={(emoji) => setTitle((t) => t + emoji)}
              />
            </div>
          </div>
          <div className="treats-form-field">
            <label>Card category line (optional)</label>
            <div className="treat-inline-input-row">
              <input
                type="text"
                value={typeDisplayLabel}
                maxLength={TREAT_PRODUCT_TYPE_DISPLAY_MAX_LEN}
                onChange={(e) => setTypeDisplayLabel(e.target.value)}
                placeholder={`e.g. ${defaultTreatProductTypeLabel(type)}`}
              />
              <EmojiButton
                includeSjHeartEmoji={includeSjHeartEmoji}
                onSelect={(emoji) =>
                  setTypeDisplayLabel((prev) =>
                    `${prev}${emoji}`.slice(0, TREAT_PRODUCT_TYPE_DISPLAY_MAX_LEN),
                  )
                }
              />
            </div>
            <p className="treat-inline-hint">
              Leave blank to hide the line above the title on landing and member store.
            </p>
          </div>
          <div className="treats-form-field">
            <label>Description</label>
            <div className="treat-inline-input-row treat-inline-input-row--multiline">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="What does the fan get?"
              />
              <span className="treat-inline-emoji-anchor">
                <EmojiButton
                  includeSjHeartEmoji={includeSjHeartEmoji}
                  onSelect={(emoji) => setDescription((d) => d + emoji)}
                />
              </span>
            </div>
          </div>
          <div className="treats-form-row">
            <div className="treats-form-field">
              <label>Price ($)</label>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={priceDollars}
                onChange={(e) => onPriceDollarsChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                  e.preventDefault();
                  const cur = parseFloat(priceDollars || "0");
                  const base = Number.isFinite(cur) ? cur : 0;
                  const step = 0.01;
                  const next = e.key === "ArrowUp" ? base + step : Math.max(0, base - step);
                  setPriceDollars(next.toFixed(2));
                }}
                placeholder="0.00"
              />
            </div>
            <div className="treats-form-field">
              <label>Quantity limit</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={quantityLimit}
                onChange={(e) => onQuantityChange(e.target.value)}
                placeholder="Unlimited (leave blank)"
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
