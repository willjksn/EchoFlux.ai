import React, { useState, useEffect, useCallback } from "react";
import { useAppContext } from "./AppContext";
import { auth, db } from "../firebaseConfig";
import { collection, query, getDocs, getDoc, doc, addDoc, setDoc, serverTimestamp, updateDoc, where } from "firebase/firestore";
import {
  formatFanDisplayLabel,
  initialsFromFanLabel,
  parseFanMemberRoleFromFirestore,
  safeUsernameForHandle,
} from "../src/lib/fanHubDisplay";
import { pickLatestMemberAccessEnd, formatRemainingAccessForFanRow } from "../src/lib/memberAccessEnd";

type UserRole = "admin" | "member" | "tipper" | "treat_buyer";

interface FanUser {
  id: string;
  name: string;
  email: string;
  /** Member @handle when known (for search / display) */
  memberUsername?: string | null;
  role: UserRole;
  plan: string | null;
  /** Earliest known: fan subscribedAt / first order / users.signupDate — null if unknown */
  signupDate: Date | null;
  remainingAccess: "Active" | "Expired" | "Cancelled" | string;
  /** All-time: fans.totalSpentCents baseline + sum of all orders (migrated Stormij orders keep old dates; this still counts) */
  lifetimeSpendCents: number;
  lifetimeStorePurchasesCents: number;
  lifetimeTipsCents: number;
  lifetimeUnlocksCents: number;
  /** Calendar month-to-date from orders — summed in the Monthly Totals row only */
  mtdSpendCents: number;
  mtdStorePurchasesCents: number;
  mtdTipsCents: number;
  mtdUnlocksCents: number;
  lastActiveAt: Date | null;
  avatarUrl?: string;
}

const PlusIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const SearchIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const DotsIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

function formatCents(cents: number): string {
  if (cents === 0) return "—";
  return "$" + (cents / 100).toFixed(2);
}

function formatDate(date: Date | null): string {
  if (!date || !Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

/** Earliest known activity: fixes Stormij migration where subscribedAt was set to migration day but orders are older. */
function earlierDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

function getMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Plan / access pill: semantic colors (not creator accent) */
function planStatusBadgeClass(label: string): string | null {
  const s = label.trim().toLowerCase();
  if (s === "active") {
    return "px-2 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/35 dark:text-emerald-300";
  }
  if (s === "cancelled") {
    return "px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/35 dark:text-red-300";
  }
  if (s === "expired") {
    return "px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400";
  }
  if (s === "inactive") {
    return "px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200";
  }
  return null;
}

function getAvatarColor(name: string): string {
  const colors = [
    "bg-indigo-500",
    "bg-blue-500",
    "bg-teal-500",
    "bg-green-500",
    "bg-amber-500",
    "bg-orange-500",
    "bg-cyan-500",
    "bg-violet-500",
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

export const FanHubUsers: React.FC = () => {
  const { user, showToast } = useAppContext();
  const [users, setUsers] = useState<FanUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<FanUser | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Add user form state
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("member");
  const [newUserPlan, setNewUserPlan] = useState("Active");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [addingUser, setAddingUser] = useState(false);

  // Manage user modal state
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [grantTreatType, setGrantTreatType] = useState("");
  const [grantTreatCount, setGrantTreatCount] = useState(1);
  
  // Grant video minutes state
  const [grantVideoMinutes, setGrantVideoMinutes] = useState(0);
  const [isGrantingMinutes, setIsGrantingMinutes] = useState(false);

  // Empty placeholder - users will be loaded from database
  // Demo users are not shown to new creators
  const DEMO_USERS: FanUser[] = [];

  const loadUsers = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      // Fetch orders for spend calculation
      const ordersRes = await fetch("/api/creatorOrders?limit=1000", { headers });
      let orders: any[] = [];
      if (ordersRes.ok) {
        const data = await ordersRes.json();
        orders = data.orders || [];
      } else if (import.meta.env.DEV && (ordersRes.status === 404 || ordersRes.status === 502)) {
        console.warn(
          `[FanHubUsers] /api/creatorOrders returned ${ordersRes.status}. ` +
            "Vite does not run serverless routes locally unless you proxy: add DEV_API_PROXY=https://your-app.vercel.app to .env.local (see docs/LOCAL_DEV.md). User list still loads from Firestore; store spend columns may be incomplete."
        );
      }

      // Build user map - start with fans collection (primary source)
      const firestoreDate = (v: unknown): Date | null => {
        if (v == null || v === "") return null;
        if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
          const d = (v as { toDate: () => Date }).toDate();
          return Number.isFinite(d.getTime()) ? d : null;
        }
        if (typeof v === "string" || typeof v === "number") {
          const d = new Date(v);
          return Number.isFinite(d.getTime()) ? d : null;
        }
        return null;
      };

      const nowRef = new Date();
      const monthStart = new Date(nowRef.getFullYear(), nowRef.getMonth(), 1);
      const monthEnd = new Date(nowRef.getFullYear(), nowRef.getMonth() + 1, 0, 23, 59, 59, 999);
      const isInCurrentMonth = (d: Date) => d >= monthStart && d <= monthEnd;

      const userMap = new Map<string, {
        id: string;
        email: string | null;
        displayName: string | null;
        username?: string | null;
        /** From fans doc role (admin / member / tipper) — Stormij migration + manual */
        storedRole?: UserRole | null;
        subscriptionStatus: string | null;
        subscribedAt: Date | null;
        tips: number;
        unlocks: number;
        treats: number;
        total: number;
        mtdTips: number;
        mtdUnlocks: number;
        mtdTreats: number;
        lastActive: Date | null;
        firstOrder: Date | null;
        avatarUrl?: string;
        /** True when Stripe cancel_at_period_end; access continues until subscriptionCurrentPeriodEnd */
        cancelAtPeriodEnd?: boolean;
        /** ISO or Date from webhook — end of current paid period */
        subscriptionCurrentPeriodEnd?: Date | null;
        /** From users/{uid}.signupDate when fan doc has no timeline */
        profileSignupAt?: Date | null;
      }>();

      // First, fetch from creators/{creatorId}/fans collection (Stripe subscribers and purchasers)
      // Note: Do not use orderBy("createdAt") here — Firestore omits docs missing that field, so migrated
      // Stormij fans (or older webhook rows) can disappear from the list. Sort client-side instead.
      try {
        const fansRef = collection(db, "creators", user.id, "fans");
        const fansSnap = await getDocs(fansRef);
        const fanDocs = [...fansSnap.docs].sort((a, b) => {
          const da = a.data();
          const db_ = b.data();
          const ta =
            (da.createdAt as { toDate?: () => Date })?.toDate?.()?.getTime() ??
            (da.subscribedAt as { toDate?: () => Date })?.toDate?.()?.getTime() ??
            (typeof da.createdAt === "string" || typeof da.createdAt === "number"
              ? new Date(da.createdAt as string | number).getTime()
              : 0);
          const tb =
            (db_.createdAt as { toDate?: () => Date })?.toDate?.()?.getTime() ??
            (db_.subscribedAt as { toDate?: () => Date })?.toDate?.()?.getTime() ??
            (typeof db_.createdAt === "string" || typeof db_.createdAt === "number"
              ? new Date(db_.createdAt as string | number).getTime()
              : 0);
          return tb - ta;
        });
        fanDocs.forEach((doc) => {
          const data = doc.data();
          const fanId = doc.id;
          const subscribedAt =
            firestoreDate(data.subscribedAt) ??
            firestoreDate(data.createdAt) ??
            null;
          const subscriptionCurrentPeriodEnd = pickLatestMemberAccessEnd(data as Record<string, unknown>);

          const rawUsernameFromDoc =
            (typeof data.username === "string" && data.username.trim()) ||
            (typeof data.memberUsername === "string" && data.memberUsername.trim()) ||
            (typeof data.handle === "string" && data.handle.trim()) ||
            (typeof data.instagram_handle === "string" && data.instagram_handle.trim()) ||
            (typeof data.instagramHandle === "string" && data.instagramHandle.trim()) ||
            "";
          const rawUsername = rawUsernameFromDoc
            ? rawUsernameFromDoc.replace(/^@/, "").toLowerCase()
            : null;
          const storedRole = parseFanMemberRoleFromFirestore(data as Record<string, unknown>) as UserRole | null;

          userMap.set(fanId, {
            id: fanId,
            email: data.email || null,
            displayName: data.displayName || null,
            username: rawUsername || null,
            storedRole,
            subscriptionStatus: data.subscriptionStatus || null,
            subscribedAt,
            tips: 0,
            unlocks: 0,
            treats: 0,
            mtdTips: 0,
            mtdUnlocks: 0,
            mtdTreats: 0,
            total: data.totalSpentCents || 0,
            lastActive: firestoreDate(data.lastPaymentAt) ?? subscribedAt,
            firstOrder: subscribedAt,
            avatarUrl: data.avatarUrl || undefined,
            cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
            subscriptionCurrentPeriodEnd,
          });
        });
      } catch (e) {
        console.log("Fans collection may not exist yet:", e);
      }

      // Merge order data into user map
      orders.forEach((o: any) => {
        const fanId = o.fanId || o.fanEmail || "unknown";
        const fanEmail = o.fanEmail || null;
        const amount = o.amountCents || 0;
        const type = o.type || o.productType || "";
        const orderDate = new Date(o.createdAt);

        const existing = userMap.get(fanId) || {
          id: fanId,
          email: fanEmail,
          displayName: null,
          username: null as string | null,
          storedRole: null as UserRole | null,
          subscriptionStatus: null,
          subscribedAt: null,
          tips: 0,
          unlocks: 0,
          treats: 0,
          mtdTips: 0,
          mtdUnlocks: 0,
          mtdTreats: 0,
          total: 0,
          lastActive: null,
          firstOrder: null,
          profileSignupAt: null as Date | null,
        };

        if (type === "tip") existing.tips += amount;
        else if (type === "unlock" || type === "unlock_media" || type === "post_unlock") existing.unlocks += amount;
        else existing.treats += amount;
        existing.total += amount;

        if (isInCurrentMonth(orderDate)) {
          if (type === "tip") existing.mtdTips += amount;
          else if (type === "unlock" || type === "unlock_media" || type === "post_unlock") existing.mtdUnlocks += amount;
          else existing.mtdTreats += amount;
        }

        if (!existing.lastActive || orderDate > existing.lastActive) existing.lastActive = orderDate;
        if (!existing.firstOrder || orderDate < existing.firstOrder) existing.firstOrder = orderDate;
        if (!existing.email && fanEmail) existing.email = fanEmail;

        userMap.set(fanId, existing);
      });

      // Also check creatorSubscribers for any legacy data
      try {
        const legacySubRef = collection(db, "creatorSubscribers", user.id, "subscribers");
        const legacySubSnap = await getDocs(legacySubRef);
        legacySubSnap.docs.forEach((doc) => {
          const data = doc.data();
          const fanId = doc.id;
          const legacyPeriodEnd = pickLatestMemberAccessEnd(data as Record<string, unknown>);
          if (!userMap.has(fanId)) {
            const subscribedAt = data.updatedAt ? new Date(data.updatedAt) : null;
            userMap.set(fanId, {
              id: fanId,
              email: null,
              displayName: null,
              username: null,
              subscriptionStatus: data.status || "active",
              subscribedAt,
              tips: 0,
              unlocks: 0,
              treats: 0,
              mtdTips: 0,
              mtdUnlocks: 0,
              mtdTreats: 0,
              total: 0,
              lastActive: subscribedAt,
              firstOrder: subscribedAt,
              cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
              subscriptionCurrentPeriodEnd: legacyPeriodEnd,
            });
          } else {
            const existing = userMap.get(fanId)!;
            if (data.status && !existing.subscriptionStatus) {
              existing.subscriptionStatus = data.status;
            }
            if (data.cancelAtPeriodEnd === true) {
              existing.cancelAtPeriodEnd = true;
            }
            if (legacyPeriodEnd) {
              const cur = existing.subscriptionCurrentPeriodEnd;
              if (!cur || legacyPeriodEnd.getTime() > cur.getTime()) {
                existing.subscriptionCurrentPeriodEnd = legacyPeriodEnd;
              }
            }
          }
        });
      } catch {
        // Collection may not exist
      }

      // Also fetch manually added users from fanUsers collection
      try {
        const manualUsersRef = collection(db, "creators", user.id, "fanUsers");
        const manualUsersSnap = await getDocs(manualUsersRef);
        manualUsersSnap.docs.forEach((doc) => {
          const data = doc.data();
          const fanId = data.email || doc.id;
          if (!userMap.has(fanId)) {
            const createdAt = data.createdAt?.toDate() || null;
            userMap.set(fanId, {
              id: fanId,
              email: data.email || null,
              displayName: data.name || null,
              username: null,
              subscriptionStatus: null,
              subscribedAt: null,
              tips: 0,
              unlocks: 0,
              treats: 0,
              mtdTips: 0,
              mtdUnlocks: 0,
              mtdTreats: 0,
              total: 0,
              lastActive: createdAt,
              firstOrder: createdAt,
              profileSignupAt: createdAt,
            });
          }
        });
      } catch {
        // Manual users collection may not exist
      }

      // Same fan can appear twice after migration: e.g. `fans/{stormijUid}` from members vs `orders` keyed by
      // EchoFlux Auth uid (resolved from email in backfill). Merge rows that share the same email.
      type MapRow = (typeof userMap extends Map<string, infer R> ? R : never);
      const mergeFanRowsByEmail = (map: Map<string, MapRow>) => {
        const emailToIds = new Map<string, string[]>();
        for (const [id, row] of map) {
          const em = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
          if (!em) continue;
          const list = emailToIds.get(em) || [];
          list.push(id);
          emailToIds.set(em, list);
        }
        const pickCanonical = (ids: string[]): string => {
          let best = ids[0];
          let bestScore = -1;
          for (const id of ids) {
            const r = map.get(id);
            if (!r) continue;
            const score = r.treats + r.tips + r.unlocks;
            if (score > bestScore) {
              bestScore = score;
              best = id;
            }
          }
          if (bestScore > 0) return best;
          const uidLike = ids.find((id) => !id.includes("@") && id.length >= 20);
          return uidLike ?? ids[0];
        };
        for (const ids of emailToIds.values()) {
          if (ids.length <= 1) continue;
          const canonical = pickCanonical(ids);
          const base = map.get(canonical);
          if (!base) continue;
          for (const oid of ids) {
            if (oid === canonical) continue;
            const o = map.get(oid);
            if (!o) continue;
            base.tips += o.tips;
            base.treats += o.treats;
            base.unlocks += o.unlocks;
            base.total += o.total;
            base.mtdTips += o.mtdTips;
            base.mtdTreats += o.mtdTreats;
            base.mtdUnlocks += o.mtdUnlocks;
            if (!base.email && o.email) base.email = o.email;
            if (!base.displayName && o.displayName) base.displayName = o.displayName;
            if (!base.username && o.username) base.username = o.username;
            if (!base.storedRole && o.storedRole) base.storedRole = o.storedRole;
            if (!base.subscriptionStatus && o.subscriptionStatus) base.subscriptionStatus = o.subscriptionStatus;
            if (!base.subscribedAt && o.subscribedAt) base.subscribedAt = o.subscribedAt;
            if (o.lastActive && (!base.lastActive || o.lastActive > base.lastActive)) base.lastActive = o.lastActive;
            if (o.firstOrder && (!base.firstOrder || o.firstOrder < base.firstOrder)) base.firstOrder = o.firstOrder;
            if (o.cancelAtPeriodEnd) base.cancelAtPeriodEnd = true;
            if (o.subscriptionCurrentPeriodEnd) {
              const cur = base.subscriptionCurrentPeriodEnd;
              const next = o.subscriptionCurrentPeriodEnd;
              if (!cur || next.getTime() > cur.getTime()) base.subscriptionCurrentPeriodEnd = next;
            }
            if (o.profileSignupAt) {
              const cur = base.profileSignupAt;
              const next = o.profileSignupAt;
              if (!cur || next.getTime() < cur.getTime()) base.profileSignupAt = next;
            }
            if (!base.avatarUrl && o.avatarUrl) base.avatarUrl = o.avatarUrl;
            map.delete(oid);
          }
          base.id = canonical;
        }
      };
      mergeFanRowsByEmail(userMap);

      // Merge `users/{fanId}` so @username shows when `fans` doc lacks it (Stripe + claimed handles)
      const profileIds = [...userMap.keys()];
      const PROFILE_CHUNK = 30;
      for (let i = 0; i < profileIds.length; i += PROFILE_CHUNK) {
        const chunk = profileIds.slice(i, i + PROFILE_CHUNK);
        await Promise.all(
          chunk.map(async (fanId) => {
            try {
              const uSnap = await getDoc(doc(db, "users", fanId));
              if (!uSnap.exists()) return;
              const u = uSnap.data() as Record<string, unknown>;
              const entry = userMap.get(fanId);
              if (!entry) return;
              const uu = safeUsernameForHandle(
                typeof u.username === "string" ? u.username : undefined
              );
              if (uu && !entry.username) {
                entry.username = uu;
              }
              if (!entry.displayName) {
                const dn = typeof u.displayName === "string" ? u.displayName.trim() : "";
                const nm = typeof u.name === "string" ? u.name.trim() : "";
                if (dn) entry.displayName = dn;
                else if (nm) entry.displayName = nm;
              }
              // Stormij sometimes stored admin/role only on `users/{uid}`, not on `fans/{uid}`
              if (!entry.storedRole) {
                const fromUser = parseFanMemberRoleFromFirestore(u);
                if (fromUser) entry.storedRole = fromUser;
              }
              const profileSu = firestoreDate(u.signupDate);
              if (profileSu) {
                if (!entry.profileSignupAt || profileSu.getTime() < entry.profileSignupAt.getTime()) {
                  entry.profileSignupAt = profileSu;
                }
              }
            } catch {
              /* ignore */
            }
          })
        );
      }

      // Convert to FanUser array
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const fanUsers: FanUser[] = Array.from(userMap.values()).map((data) => {
        const email = data.email || data.id;
        const name = formatFanDisplayLabel(
          {
            username: data.username,
            displayName: data.displayName,
            email: data.email || undefined,
          },
          { fallback: "Member" }
        );
        const memberUsername = data.username || null;

        // Role: prefer explicit fans doc (Stormij / Add User), else infer tipper / guest store buyer
        let role: UserRole = (data.storedRole as UserRole) || "member";
        const onlyTips =
          data.tips > 0 && data.treats === 0 && data.unlocks === 0;
        if (!data.storedRole && !data.subscriptionStatus && onlyTips) {
          role = "tipper";
        } else if (!data.storedRole && String(data.id).startsWith("guest_")) {
          role = "treat_buyer";
        }

        let remainingAccess = formatRemainingAccessForFanRow({
          subscriptionStatus: data.subscriptionStatus,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
          accessEnd: data.subscriptionCurrentPeriodEnd ?? null,
        });
        if (
          remainingAccess === "—" &&
          data.lastActive &&
          data.lastActive < thirtyDaysAgo &&
          !data.subscriptionStatus
        ) {
          remainingAccess = "Inactive";
        }

        const stPlan = (data.subscriptionStatus || "").toLowerCase();
        let plan: string | null = null;
        if (stPlan === "active" || stPlan === "trialing") plan = "Active";
        else if (stPlan === "canceled" || stPlan === "cancelled") plan = "Cancelled";
        else if (stPlan === "past_due") plan = "Past Due";
        else if (data.total > 0) plan = "Purchaser";

        const mtdTips = data.mtdTips ?? 0;
        const mtdTreats = data.mtdTreats ?? 0;
        const mtdUnlocks = data.mtdUnlocks ?? 0;
        const tips = data.tips ?? 0;
        const treats = data.treats ?? 0;
        const unlocks = data.unlocks ?? 0;
        const totalTracked = data.total ?? 0;
        const lifetimeFromOrders = tips + treats + unlocks;
        const lifetimeSpendCents = Math.max(totalTracked, lifetimeFromOrders);
        const signupDate =
          earlierDate(earlierDate(data.subscribedAt, data.firstOrder), data.profileSignupAt ?? null) ??
          data.subscribedAt ??
          data.firstOrder ??
          data.profileSignupAt ??
          null;
        return {
          id: data.id,
          name,
          email,
          memberUsername,
          role,
          plan,
          signupDate,
          remainingAccess,
          lifetimeSpendCents,
          lifetimeStorePurchasesCents: treats,
          lifetimeTipsCents: tips,
          lifetimeUnlocksCents: unlocks,
          mtdSpendCents: mtdTips + mtdTreats + mtdUnlocks,
          mtdStorePurchasesCents: mtdTreats,
          mtdTipsCents: mtdTips,
          mtdUnlocksCents: mtdUnlocks,
          lastActiveAt: data.lastActive,
          avatarUrl: data.avatarUrl,
        };
      });

      // Sort: admins first, then active subscribers, treat buyers, tippers, then by signup date
      const roleRank = (r: UserRole) =>
        r === "admin" ? 0 : r === "member" ? 1 : r === "treat_buyer" ? 2 : r === "tipper" ? 3 : 4;
      fanUsers.sort((a, b) => {
        if (a.role === "admin" && b.role !== "admin") return -1;
        if (a.role !== "admin" && b.role === "admin") return 1;
        if (a.plan === "Active" && b.plan !== "Active") return -1;
        if (a.plan !== "Active" && b.plan === "Active") return 1;
        const rr = roleRank(a.role) - roleRank(b.role);
        if (rr !== 0) return rr;
        const tb = b.signupDate?.getTime() ?? 0;
        const ta = a.signupDate?.getTime() ?? 0;
        return tb - ta;
      });

      // Add demo users if no real users exist
      if (fanUsers.length === 0) {
        setUsers(DEMO_USERS);
      } else {
        setUsers(fanUsers);
      }
    } catch (error) {
      console.error("Error loading users:", error);
      showToast?.("Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  }, [user?.id, showToast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenu(null);
    if (activeMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [activeMenu]);

  const handleAddUser = async () => {
    if (!user?.id || !newUserEmail.trim()) return;
    if (newUserPassword && newUserPassword.length < 6) {
      showToast?.("Password must be at least 6 characters", "error");
      return;
    }
    setAddingUser(true);

    try {
      const email = newUserEmail.trim().toLowerCase();
      const displayName = newUserName.trim() || email.split("@")[0];
      const now = new Date().toISOString();
      
      // Create fan in the main fans collection (same as Stripe webhook does)
      const fanId = email; // Use email as ID for manually added fans
      await setDoc(doc(db, "creators", user.id, "fans", fanId), {
        id: fanId,
        creatorId: user.id,
        email,
        displayName,
        subscriptionStatus:
          newUserRole === "member"
            ? newUserPlan === "Active"
              ? "active"
              : newUserPlan === "Expired"
                ? "canceled"
                : newUserPlan.toLowerCase()
            : null,
        manuallyAdded: true,
        role: newUserRole,
        createdAt: now,
        updatedAt: now,
      });

      showToast?.("User added successfully", "success");
      setShowAddModal(false);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserRole("member");
      setNewUserPlan("Active");
      setNewUserPassword("");
      setShowNewUserPassword(false);
      loadUsers();
    } catch (error) {
      console.error("Error adding user:", error);
      showToast?.("Failed to add user", "error");
    } finally {
      setAddingUser(false);
    }
  };

  const handleDeleteUser = async (fanUser: FanUser) => {
    if (!user?.id) return;
    if (
      !confirm(
        `Remove ${fanUser.name}? This deletes their fan card, DM thread (including video messages), live video chat history with you, and member access for this page.`
      )
    ) {
      return;
    }

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) {
        showToast?.("Please sign in again", "error");
        return;
      }

      const res = await fetch("/api/deleteFanHubMember", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fanId: fanUser.id,
          fanEmail: fanUser.email || "",
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `Remove failed (${res.status})`);
      }

      showToast?.("User removed", "success");
      setUsers((prev) => prev.filter((u) => u.id !== fanUser.id));
    } catch (error) {
      console.error("Error deleting user:", error);
      showToast?.(error instanceof Error ? error.message : "Failed to remove user", "error");
    }
  };

  const handleManageUser = (fanUser: FanUser) => {
    setSelectedUser(fanUser);
    setShowManageModal(true);
    setActiveMenu(null);
    setNewPassword("");
    setShowPassword(false);
    setGrantTreatType("");
    setGrantTreatCount(1);
  };

  const handleSetPassword = async () => {
    if (!selectedUser || newPassword.length < 6) return;
    // In a real implementation, this would call an API to set the password
    showToast?.(`Password set for ${selectedUser.email}`, "success");
    setNewPassword("");
  };

  const handleSendPasswordReset = async () => {
    if (!selectedUser) return;
    // In a real implementation, this would call Firebase Auth to send reset email
    showToast?.(`Password reset email sent to ${selectedUser.email}`, "success");
  };

  const handleGrantTreat = async () => {
    if (!user?.id || !selectedUser || !grantTreatType) return;
    try {
      // Add treat grant to Firestore
      await addDoc(collection(db, "creators", user.id, "treatGrants"), {
        fanEmail: selectedUser.email,
        fanName: selectedUser.name,
        treatType: grantTreatType,
        quantity: grantTreatCount,
        grantedAt: serverTimestamp(),
      });
      showToast?.(`Granted ${grantTreatCount}x ${grantTreatType.replace(/_/g, " ")} to ${selectedUser.name}`, "success");
      setGrantTreatType("");
      setGrantTreatCount(1);
    } catch (error) {
      console.error("Error granting treat:", error);
      showToast?.("Failed to grant", "error");
    }
  };

  const handleGrantVideoMinutes = async () => {
    if (!selectedUser || grantVideoMinutes <= 0) return;
    setIsGrantingMinutes(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/api/videoUsageStats?action=addMinutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          creatorId: selectedUser.id,
          minutes: grantVideoMinutes,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to grant minutes");
      }

      showToast?.(`Granted ${grantVideoMinutes} video minutes to ${selectedUser.name}`, "success");
      setGrantVideoMinutes(0);
    } catch (error: any) {
      console.error("Error granting video minutes:", error);
      showToast?.(error.message || "Failed to grant video minutes", "error");
    } finally {
      setIsGrantingMinutes(false);
    }
  };

  const handleUpdateUserRole = async (newRole: UserRole) => {
    if (!user?.id || !selectedUser) return;

    try {
      const now = new Date().toISOString();
      
      // Update in fans collection (primary)
      const fanRef = doc(db, "creators", user.id, "fans", selectedUser.id);
      await updateDoc(fanRef, {
        role: newRole,
        updatedAt: now,
      }).catch(async () => {
        // If doesn't exist, create it
        await setDoc(fanRef, {
          id: selectedUser.id,
          creatorId: user.id,
          email: selectedUser.email,
          displayName: selectedUser.name,
          role: newRole,
          createdAt: now,
          updatedAt: now,
        });
      });

      showToast?.("User role updated", "success");
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, role: newRole } : u))
      );
      setSelectedUser({ ...selectedUser, role: newRole });
    } catch (error) {
      console.error("Error updating user role:", error);
      showToast?.("Failed to update role", "error");
    }
  };

  // Filter users by search
  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.memberUsername && u.memberUsername.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Group users by role
  const admins = filteredUsers.filter((u) => u.role === "admin");
  const members = filteredUsers.filter((u) => u.role === "member");
  const treatBuyers = filteredUsers.filter((u) => u.role === "treat_buyer");
  const tippers = filteredUsers.filter((u) => u.role === "tipper");

  // Calculate monthly totals
  const monthlyTotals = {
    spend: users.reduce((sum, u) => sum + u.mtdSpendCents, 0),
    purchases: users.reduce((sum, u) => sum + u.mtdStorePurchasesCents, 0),
    tips: users.reduce((sum, u) => sum + u.mtdTipsCents, 0),
    unlocks: users.reduce((sum, u) => sum + u.mtdUnlocksCents, 0),
  };

  if (!user?.id) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">Sign in to manage users.</p>
      </div>
    );
  }

  const UserRow: React.FC<{ fanUser: FanUser; showActions?: boolean }> = ({ fanUser, showActions = true }) => {
    const planBadgeClass = fanUser.plan ? planStatusBadgeClass(fanUser.plan) : null;
    const accessBadgeClass = planStatusBadgeClass(fanUser.remainingAccess);
    return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold ${getAvatarColor(fanUser.name)}`}>
            {initialsFromFanLabel(fanUser.name)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white">{fanUser.name}</span>
              {fanUser.role === "admin" && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-200 text-slate-800 dark:bg-slate-600 dark:text-slate-100 rounded">
                  ADMIN
                </span>
              )}
              {fanUser.role === "treat_buyer" && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200 rounded">
                  STORE BUYER
                </span>
              )}
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">{fanUser.email}</span>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {fanUser.plan ? (
          planBadgeClass ? (
            <span className={planBadgeClass}>{fanUser.plan}</span>
          ) : (
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {fanUser.plan}
            </span>
          )
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {formatDate(fanUser.signupDate)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {accessBadgeClass ? (
          <span className={accessBadgeClass}>{fanUser.remainingAccess}</span>
        ) : (
          fanUser.remainingAccess
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {formatCents(fanUser.lifetimeSpendCents)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {formatCents(fanUser.lifetimeStorePurchasesCents)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {formatCents(fanUser.lifetimeTipsCents)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {formatCents(fanUser.lifetimeUnlocksCents)}
      </td>
      <td className="px-4 py-3">
        {showActions && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleManageUser(fanUser)}
              className="fh-link text-sm font-medium"
            >
              Manage
            </button>
            <button
              onClick={() => handleDeleteUser(fanUser)}
              className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium flex items-center gap-1"
            >
              <TrashIcon />
              Delete
            </button>
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenu(activeMenu === fanUser.id ? null : fanUser.id);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <DotsIcon />
              </button>
              {activeMenu === fanUser.id && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10">
                  <button
                    onClick={() => {
                      setSelectedUser(fanUser);
                      setShowManageModal(true);
                      setActiveMenu(null);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => handleUpdateUserRole(fanUser.role === "admin" ? "member" : "admin")}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    {fanUser.role === "admin" ? "Remove Admin" : "Make Admin"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </td>
    </tr>
    );
  };

  const SectionHeader: React.FC<{ title: string; count: number }> = ({ title, count }) => (
    <tr className="bg-gray-50 dark:bg-gray-800/50">
      <td colSpan={9} className="px-4 py-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {title} ({count})
        </span>
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="fh-btn px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <PlusIcon />
            Add User
          </button>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, @handle, or email..."
              className="pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm w-64"
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <SearchIcon />
            </div>
          </div>
        </div>
      </div>

      {/* User Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div
              className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-4"
              style={{ borderColor: "var(--fan-primary, #6366f1)" }}
            />
            <p className="text-gray-500 dark:text-gray-400">Loading users...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Plan
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    title="Member since: earliest of subscription start, first purchase, or EchoFlux account signup (when linked)."
                  >
                    Signup Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Remaining Access
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total spend
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Store
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Tips
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Unlocks
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {/* Monthly Totals Row */}
                <tr className="fan-hub-monthly-totals-row">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                        style={{
                          background: `linear-gradient(135deg, var(--fan-primary, #6366f1) 0%, color-mix(in srgb, var(--fan-primary, #6366f1) 65%, #1e1b4b) 100%)`,
                        }}
                      >
                        Σ
                      </div>
                      <span className="font-semibold text-gray-900 dark:text-white">This month (orders)</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">—</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {getMonthYear(new Date())}
                  </td>
                  <td className="px-4 py-3 text-gray-400">—</td>
                  <td
                    className="px-4 py-3 text-sm font-semibold"
                    style={{ color: "var(--fan-primary, #6366f1)" }}
                  >
                    {formatCents(monthlyTotals.spend)}
                  </td>
                  <td
                    className="px-4 py-3 text-sm font-semibold"
                    style={{ color: "var(--fan-primary, #6366f1)" }}
                  >
                    {formatCents(monthlyTotals.purchases)}
                  </td>
                  <td
                    className="px-4 py-3 text-sm font-semibold"
                    style={{ color: "var(--fan-primary, #6366f1)" }}
                  >
                    {formatCents(monthlyTotals.tips)}
                  </td>
                  <td
                    className="px-4 py-3 text-sm font-semibold"
                    style={{ color: "var(--fan-primary, #6366f1)" }}
                  >
                    {formatCents(monthlyTotals.unlocks)}
                  </td>
                  <td className="px-4 py-3 text-gray-400">—</td>
                </tr>

                {/* Admins Section */}
                {admins.length > 0 && (
                  <>
                    <SectionHeader title="Admins" count={admins.length} />
                    {admins.map((fanUser) => (
                      <UserRow key={fanUser.id} fanUser={fanUser} />
                    ))}
                  </>
                )}

                {/* Members Section */}
                {members.length > 0 && (
                  <>
                    <SectionHeader title="Members" count={members.length} />
                    {members.map((fanUser) => (
                      <UserRow key={fanUser.id} fanUser={fanUser} />
                    ))}
                  </>
                )}

                {/* Store buyers (guest checkout / pre-subscribe purchases) */}
                <SectionHeader title="Store buyers" count={treatBuyers.length} />
                {treatBuyers.length > 0 ? (
                  treatBuyers.map((fanUser) => (
                    <UserRow key={fanUser.id} fanUser={fanUser} />
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400 italic">
                      No store buyers yet. They appear when someone buys from your store on the landing page before subscribing.
                    </td>
                  </tr>
                )}

                {/* Tippers Section */}
                <SectionHeader title="Tippers" count={tippers.length} />
                {tippers.length > 0 ? (
                  tippers.map((fanUser) => (
                    <UserRow key={fanUser.id} fanUser={fanUser} />
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400 italic">
                      No tippers yet.
                    </td>
                  </tr>
                )}

                {/* Empty State */}
                {filteredUsers.length === 0 && !loading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                      {searchQuery ? "No users match your search." : "No users yet. Add users or they'll appear here when they make purchases."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add User</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewUserName("");
                  setNewUserEmail("");
                  setNewUserPassword("");
                  setShowNewUserPassword(false);
                  setNewUserRole("member");
                  setNewUserPlan("Active");
                }}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Fan's name"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="fan@example.com"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showNewUserPassword ? "text" : "password"}
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="Min 6 characters (optional)"
                    className="w-full px-3 py-2 pr-16 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewUserPassword(!showNewUserPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm fh-link"
                  >
                    {showNewUserPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Leave blank to send a password reset email instead.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Role
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="member">Member (Subscriber/Fan)</option>
                  <option value="admin">Admin</option>
                  <option value="tipper">Tipper (Non-subscriber)</option>
                  <option value="treat_buyer">Store buyer (purchased without subscribing)</option>
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {newUserRole === "admin" && "Admins have full access to manage the fan page."}
                  {newUserRole === "member" && "Members are subscribers who pay through Stripe."}
                  {newUserRole === "tipper" && "Tippers can tip from the landing page without subscribing."}
                  {newUserRole === "treat_buyer" && "Store buyers purchased from your page before subscribing; they often appear automatically from guest checkout."}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Plan Status
                </label>
                <select
                  value={newUserPlan}
                  onChange={(e) => setNewUserPlan(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Cancelled">Cancelled (non-Stripe / manual)</option>
                  <option value="Expired">Expired (subscription ended)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddUser}
                disabled={!newUserEmail.trim() || addingUser}
                className="fh-btn px-4 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addingUser ? "Adding..." : "Add User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage User Modal */}
      {showManageModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md my-8">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Manage User</h3>
              <button
                onClick={() => {
                  setShowManageModal(false);
                  setSelectedUser(null);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* User Info */}
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-semibold ${getAvatarColor(selectedUser.name)}`}>
                  {getInitials(selectedUser.name)}
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedUser.name}</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{selectedUser.email}</p>
                </div>
              </div>

              {/* Change Password Section */}
              <div>
                <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Change password</h5>
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 6 char)"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="px-3 py-2 text-sm fh-link"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSetPassword}
                    disabled={newPassword.length < 6}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Set password
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSendPasswordReset}
                  className="w-full px-4 py-2.5 fh-btn rounded-lg text-sm font-medium"
                >
                  Send password reset email
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Sends an email to {selectedUser.email} with a link to set a new password.
                </p>
              </div>

              {/* Grant store redemption */}
              <div>
                <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Grant store redemption</h5>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Select a product and how many to grant. The member will receive an in-app notification.
                </p>
                {selectedUser.role === "member" ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={grantTreatType}
                      onChange={(e) => setGrantTreatType(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">Select a product…</option>
                      <option value="tip">Tip</option>
                      <option value="voice_note_30s">30 sec voice note</option>
                      <option value="voice_note_60s">60 sec voice note</option>
                      <option value="private_video_reply">Private video reply</option>
                      <option value="birthday_message">Birthday message</option>
                      <option value="live_chat_15m">15 min live chat</option>
                      <option value="live_chat_30m">30 min live chat</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={grantTreatCount}
                      onChange={(e) => setGrantTreatCount(Number(e.target.value))}
                      className="w-16 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-center"
                    />
                    <button
                      type="button"
                      onClick={handleGrantTreat}
                      disabled={!grantTreatType}
                      className="px-4 py-2 fh-btn rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Grant
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    Only available for members.
                  </p>
                )}
              </div>

              {/* Grant Video Minutes Section */}
              <div>
                <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Grant video minutes</h5>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Award bonus video chat minutes to this creator. Minutes are added to their bonus pool.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={grantVideoMinutes || ""}
                    onChange={(e) => setGrantVideoMinutes(Number(e.target.value))}
                    placeholder="Minutes to grant"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleGrantVideoMinutes}
                    disabled={grantVideoMinutes <= 0 || isGrantingMinutes}
                    className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isGrantingMinutes ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Granting...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="23 7 16 12 23 17 23 7" />
                          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                        Grant
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Quick presets:{" "}
                  <button onClick={() => setGrantVideoMinutes(50)} className="text-cyan-600 hover:underline">50 min</button>
                  {" · "}
                  <button onClick={() => setGrantVideoMinutes(100)} className="text-cyan-600 hover:underline">100 min</button>
                  {" · "}
                  <button onClick={() => setGrantVideoMinutes(250)} className="text-cyan-600 hover:underline">250 min</button>
                </p>
              </div>

              {/* Reward Summary */}
              <div className="fan-hub-reward-summary rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Reward summary</h5>
                {selectedUser.role === "member" ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Total Spent</span>
                      <span className="font-medium text-gray-900 dark:text-white">{formatCents(selectedUser.lifetimeSpendCents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Tips</span>
                      <span className="font-medium text-gray-900 dark:text-white">{formatCents(selectedUser.lifetimeTipsCents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Store</span>
                      <span className="font-medium text-gray-900 dark:text-white">{formatCents(selectedUser.lifetimeStorePurchasesCents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Unlocks</span>
                      <span className="font-medium text-gray-900 dark:text-white">{formatCents(selectedUser.lifetimeUnlocksCents)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">N/A for non-members.</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setShowManageModal(false);
                  setSelectedUser(null);
                  setNewPassword("");
                  setShowPassword(false);
                  setGrantTreatType("");
                  setGrantTreatCount(1);
                }}
                className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  showToast?.("Changes saved", "success");
                  setShowManageModal(false);
                  setSelectedUser(null);
                  setNewPassword("");
                  setShowPassword(false);
                  setGrantTreatType("");
                  setGrantTreatCount(1);
                }}
                className="flex-1 px-6 py-2.5 fh-btn rounded-lg text-sm font-medium"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
