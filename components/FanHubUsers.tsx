import React, { useState, useEffect, useCallback } from "react";
import { useAppContext } from "./AppContext";
import { auth, db } from "../firebaseConfig";
import { collection, query, getDocs, doc, deleteDoc, addDoc, setDoc, serverTimestamp, updateDoc, where, orderBy } from "firebase/firestore";

type UserRole = "admin" | "member" | "tipper";

interface FanUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  plan: string | null;
  signupDate: Date;
  remainingAccess: "Active" | "Expired" | "Cancelled" | string;
  monthlySpendCents: number;
  storePurchasesCents: number;
  tipsCents: number;
  unlocksCents: number;
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

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
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
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      // Fetch orders for spend calculation
      const ordersRes = await fetch("/api/creatorOrders?limit=1000", { headers });
      let orders: any[] = [];
      if (ordersRes.ok) {
        const data = await ordersRes.json();
        orders = data.orders || [];
      }

      // Build user map - start with fans collection (primary source)
      const userMap = new Map<string, {
        id: string;
        email: string | null;
        displayName: string | null;
        subscriptionStatus: string | null;
        subscribedAt: Date | null;
        tips: number;
        unlocks: number;
        treats: number;
        total: number;
        lastActive: Date | null;
        firstOrder: Date | null;
        avatarUrl?: string;
      }>();

      // First, fetch from creators/{creatorId}/fans collection (Stripe subscribers and purchasers)
      try {
        const fansRef = collection(db, "creators", user.id, "fans");
        const fansQuery = query(fansRef, orderBy("createdAt", "desc"));
        const fansSnap = await getDocs(fansQuery);
        fansSnap.docs.forEach((doc) => {
          const data = doc.data();
          const fanId = doc.id;
          const subscribedAt = data.subscribedAt ? new Date(data.subscribedAt) : (data.createdAt ? new Date(data.createdAt) : null);
          
          userMap.set(fanId, {
            id: fanId,
            email: data.email || null,
            displayName: data.displayName || null,
            subscriptionStatus: data.subscriptionStatus || null,
            subscribedAt,
            tips: 0,
            unlocks: 0,
            treats: 0,
            total: data.totalSpentCents || 0,
            lastActive: data.lastPaymentAt ? new Date(data.lastPaymentAt) : subscribedAt,
            firstOrder: subscribedAt,
            avatarUrl: data.avatarUrl || undefined,
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
          subscriptionStatus: null,
          subscribedAt: null,
          tips: 0,
          unlocks: 0,
          treats: 0,
          total: 0,
          lastActive: null,
          firstOrder: null,
        };

        if (type === "tip") existing.tips += amount;
        else if (type === "unlock" || type === "unlock_media") existing.unlocks += amount;
        else existing.treats += amount;
        existing.total += amount;

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
          if (!userMap.has(fanId)) {
            const subscribedAt = data.updatedAt ? new Date(data.updatedAt) : null;
            userMap.set(fanId, {
              id: fanId,
              email: null,
              displayName: null,
              subscriptionStatus: data.status || 'active',
              subscribedAt,
              tips: 0,
              unlocks: 0,
              treats: 0,
              total: 0,
              lastActive: subscribedAt,
              firstOrder: subscribedAt,
            });
          } else {
            // Update subscription status if newer
            const existing = userMap.get(fanId)!;
            if (data.status && !existing.subscriptionStatus) {
              existing.subscriptionStatus = data.status;
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
              subscriptionStatus: null,
              subscribedAt: null,
              tips: 0,
              unlocks: 0,
              treats: 0,
              total: 0,
              lastActive: createdAt,
              firstOrder: createdAt,
            });
          }
        });
      } catch {
        // Manual users collection may not exist
      }

      // Convert to FanUser array
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const fanUsers: FanUser[] = Array.from(userMap.values()).map((data) => {
        const email = data.email || data.id;
        const namePart = data.displayName || (email.includes("@") ? email.split("@")[0] : email) || "Fan";
        const name = namePart.charAt(0).toUpperCase() + namePart.slice(1);

        // Determine role based on subscription and spending
        let role: UserRole = "member";
        if (!data.subscriptionStatus && data.tips > 0 && data.treats === 0 && data.unlocks === 0) {
          role = "tipper"; // Non-subscriber who only tips
        }

        // Determine remaining access based on subscription status
        let remainingAccess: string = "Active";
        if (data.subscriptionStatus === "canceled" || data.subscriptionStatus === "cancelled") {
          remainingAccess = "Cancelled";
        } else if (data.subscriptionStatus === "past_due") {
          remainingAccess = "Past Due";
        } else if (data.lastActive && data.lastActive < thirtyDaysAgo && !data.subscriptionStatus) {
          remainingAccess = "Inactive";
        }

        return {
          id: data.id,
          name,
          email,
          role,
          plan: data.subscriptionStatus === "active" || data.subscriptionStatus === "trialing" ? "Active" : (data.total > 0 ? "Purchaser" : null),
          signupDate: data.subscribedAt || data.firstOrder || new Date(),
          remainingAccess,
          monthlySpendCents: data.total,
          storePurchasesCents: data.treats,
          tipsCents: data.tips,
          unlocksCents: data.unlocks,
          lastActiveAt: data.lastActive,
          avatarUrl: data.avatarUrl,
        };
      });

      // Sort: admins first, then active subscribers, then by signup date
      fanUsers.sort((a, b) => {
        if (a.role === "admin" && b.role !== "admin") return -1;
        if (a.role !== "admin" && b.role === "admin") return 1;
        // Active subscribers first
        if (a.plan === "Active" && b.plan !== "Active") return -1;
        if (a.plan !== "Active" && b.plan === "Active") return 1;
        return b.signupDate.getTime() - a.signupDate.getTime();
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
        subscriptionStatus: newUserRole === "member" ? (newUserPlan === "Active" ? "active" : newUserPlan.toLowerCase()) : null,
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
    if (!confirm(`Are you sure you want to remove ${fanUser.name}?`)) return;

    try {
      // Delete from fans collection (primary)
      await deleteDoc(doc(db, "creators", user.id, "fans", fanUser.id));
      
      // Also try to delete from legacy fanUsers collection
      const manualUsersRef = collection(db, "creators", user.id, "fanUsers");
      const q = query(manualUsersRef, where("email", "==", fanUser.email));
      const snap = await getDocs(q);
      for (const docSnap of snap.docs) {
        await deleteDoc(doc(db, "creators", user.id, "fanUsers", docSnap.id));
      }

      showToast?.("User removed", "success");
      setUsers((prev) => prev.filter((u) => u.id !== fanUser.id));
    } catch (error) {
      console.error("Error deleting user:", error);
      showToast?.("Failed to remove user", "error");
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
      showToast?.("Failed to grant treat", "error");
    }
  };

  const handleGrantVideoMinutes = async () => {
    if (!selectedUser || grantVideoMinutes <= 0) return;
    setIsGrantingMinutes(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
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
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group users by role
  const admins = filteredUsers.filter((u) => u.role === "admin");
  const members = filteredUsers.filter((u) => u.role === "member");
  const tippers = filteredUsers.filter((u) => u.role === "tipper");

  // Calculate monthly totals
  const monthlyTotals = {
    spend: users.reduce((sum, u) => sum + u.monthlySpendCents, 0),
    purchases: users.reduce((sum, u) => sum + u.storePurchasesCents, 0),
    tips: users.reduce((sum, u) => sum + u.tipsCents, 0),
    unlocks: users.reduce((sum, u) => sum + u.unlocksCents, 0),
  };

  if (!user?.id) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">Sign in to manage users.</p>
      </div>
    );
  }

  const UserRow: React.FC<{ fanUser: FanUser; showActions?: boolean }> = ({ fanUser, showActions = true }) => (
    <tr className="hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold ${getAvatarColor(fanUser.name)}`}>
            {getInitials(fanUser.name)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white">{fanUser.name}</span>
              {fanUser.role === "admin" && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 rounded">
                  ADMIN
                </span>
              )}
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">{fanUser.email}</span>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {fanUser.plan ? (
          <span className="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-full">
            {fanUser.plan}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {formatDate(fanUser.signupDate)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {fanUser.remainingAccess}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {formatCents(fanUser.monthlySpendCents)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {formatCents(fanUser.storePurchasesCents)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {formatCents(fanUser.tipsCents)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {formatCents(fanUser.unlocksCents)}
      </td>
      <td className="px-4 py-3">
        {showActions && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleManageUser(fanUser)}
              className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 text-sm font-medium"
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
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <PlusIcon />
            Add User
          </button>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-4"></div>
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Signup Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Remaining Access
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Monthly Spend
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Store Purchases
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
                <tr className="bg-indigo-50/50 dark:bg-indigo-900/10">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xs font-semibold">
                        Σ
                      </div>
                      <span className="font-semibold text-gray-900 dark:text-white">Monthly Totals</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">—</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {getMonthYear(new Date())}
                  </td>
                  <td className="px-4 py-3 text-gray-400">—</td>
                  <td className="px-4 py-3 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                    {formatCents(monthlyTotals.spend)}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                    {formatCents(monthlyTotals.purchases)}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                    {formatCents(monthlyTotals.tips)}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
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
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {newUserRole === "admin" && "Admins have full access to manage the fan page."}
                  {newUserRole === "member" && "Members are subscribers who pay through Stripe."}
                  {newUserRole === "tipper" && "Tippers can tip from the landing page without subscribing."}
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
                  <option value="Cancelled">Cancelled</option>
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
                onClick={handleAddUser}
                disabled={!newUserEmail.trim() || addingUser}
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="px-3 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
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
                  className="w-full px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Send password reset email
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Sends an email to {selectedUser.email} with a link to set a new password.
                </p>
              </div>

              {/* Grant Treat Redeem Section */}
              <div>
                <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Grant treat redeem</h5>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Select a treat and how many to grant. The member will receive an in-app notification.
                </p>
                {selectedUser.role === "member" ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={grantTreatType}
                      onChange={(e) => setGrantTreatType(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">Select a treat...</option>
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
                      className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-100 dark:border-indigo-800/50">
                <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Reward summary</h5>
                {selectedUser.role === "member" ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Total Spent</span>
                      <span className="font-medium text-gray-900 dark:text-white">{formatCents(selectedUser.monthlySpendCents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Tips</span>
                      <span className="font-medium text-gray-900 dark:text-white">{formatCents(selectedUser.tipsCents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Store Purchases</span>
                      <span className="font-medium text-gray-900 dark:text-white">{formatCents(selectedUser.storePurchasesCents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Unlocks</span>
                      <span className="font-medium text-gray-900 dark:text-white">{formatCents(selectedUser.unlocksCents)}</span>
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
                className="flex-1 px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors"
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
