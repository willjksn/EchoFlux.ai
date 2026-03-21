import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAppContext } from "./AppContext";
import { auth, db } from "../firebaseConfig";
import { collection, query, where, getDocs, orderBy, Timestamp } from "firebase/firestore";
import { formatFanDisplayLabel } from "../src/lib/fanHubDisplay";

type DateRange = "7d" | "30d" | "90d" | "all";

interface RevenueMetrics {
  totalRevenueCents: number;
  tipsCents: number;
  unlocksCents: number;
  treatsCents: number;
  subscriptionsCents: number;
}

interface FanMetrics {
  totalFans: number;
  newFans: number;
  activeFans: number;
  churnedFans: number;
  churnRate: number;
}

interface TopFan {
  id: string;
  name: string;
  email: string;
  totalSpentCents: number;
  lastActiveAt: Date | null;
}

interface Transaction {
  id: string;
  type: "tip" | "unlock" | "treat" | "subscription";
  amountCents: number;
  fanName: string | null;
  fanEmail: string;
  createdAt: Date;
  productName?: string;
}

const TrendUpIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

const TrendDownIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </svg>
);

const DollarIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const UsersIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const HeartIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const UnlockIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
);

const GiftIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 12 20 22 4 22 4 12" />
    <rect x="2" y="7" width="20" height="5" />
    <line x1="12" y1="22" x2="12" y2="7" />
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
  </svg>
);

const StarIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

function formatCents(cents: number): string {
  return "$" + (cents / 100).toFixed(2);
}

function formatPercentage(value: number): string {
  return value.toFixed(1) + "%";
}

function getDateRangeStart(range: DateRange): Date | null {
  if (range === "all") return null;
  const now = new Date();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export const FanHubAnalytics: React.FC = () => {
  const { user, showToast } = useAppContext();
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [loading, setLoading] = useState(true);
  const [revenue, setRevenue] = useState<RevenueMetrics>({
    totalRevenueCents: 0,
    tipsCents: 0,
    unlocksCents: 0,
    treatsCents: 0,
    subscriptionsCents: 0,
  });
  const [previousRevenue, setPreviousRevenue] = useState<RevenueMetrics | null>(null);
  const [fanMetrics, setFanMetrics] = useState<FanMetrics>({
    totalFans: 0,
    newFans: 0,
    activeFans: 0,
    churnedFans: 0,
    churnRate: 0,
  });
  const [topFans, setTopFans] = useState<TopFan[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);

  const loadAnalytics = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const startDate = getDateRangeStart(dateRange);

      // Fetch orders for revenue calculation
      const ordersRes = await fetch("/api/creatorOrders?limit=500", { headers });
      let orders: any[] = [];
      if (ordersRes.ok) {
        const data = await ordersRes.json();
        orders = data.orders || [];
      }

      // Filter orders by date range
      const filteredOrders = orders.filter((o: any) => {
        if (!startDate) return true;
        const orderDate = new Date(o.createdAt);
        return orderDate >= startDate;
      });

      // Calculate revenue by type
      let tipsCents = 0;
      let unlocksCents = 0;
      let treatsCents = 0;
      let subscriptionsCents = 0;

      filteredOrders.forEach((order: any) => {
        const amount = order.amountCents || 0;
        const type = order.type || order.productType || "";
        
        if (type === "tip") {
          tipsCents += amount;
        } else if (type === "unlock" || type === "unlock_media") {
          unlocksCents += amount;
        } else if (type === "subscription") {
          subscriptionsCents += amount;
        } else {
          treatsCents += amount;
        }
      });

      const totalRevenueCents = tipsCents + unlocksCents + treatsCents + subscriptionsCents;

      setRevenue({
        totalRevenueCents,
        tipsCents,
        unlocksCents,
        treatsCents,
        subscriptionsCents,
      });

      // Calculate previous period for comparison
      if (startDate && dateRange !== "all") {
        const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
        const prevStart = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000);
        const prevOrders = orders.filter((o: any) => {
          const orderDate = new Date(o.createdAt);
          return orderDate >= prevStart && orderDate < startDate;
        });

        let prevTips = 0, prevUnlocks = 0, prevTreats = 0, prevSubs = 0;
        prevOrders.forEach((order: any) => {
          const amount = order.amountCents || 0;
          const type = order.type || order.productType || "";
          if (type === "tip") prevTips += amount;
          else if (type === "unlock" || type === "unlock_media") prevUnlocks += amount;
          else if (type === "subscription") prevSubs += amount;
          else prevTreats += amount;
        });

        setPreviousRevenue({
          totalRevenueCents: prevTips + prevUnlocks + prevTreats + prevSubs,
          tipsCents: prevTips,
          unlocksCents: prevUnlocks,
          treatsCents: prevTreats,
          subscriptionsCents: prevSubs,
        });
      } else {
        setPreviousRevenue(null);
      }

      // Build recent transactions list
      const transactions: Transaction[] = filteredOrders
        .slice(0, 20)
        .map((o: any) => ({
          id: o.id,
          type: (o.type === "tip" ? "tip" : o.type === "unlock" || o.type === "unlock_media" ? "unlock" : o.type === "subscription" ? "subscription" : "treat") as Transaction["type"],
          amountCents: o.amountCents || 0,
          fanName: o.fanName || null,
          fanEmail: o.fanEmail || o.fanId || "Unknown",
          createdAt: new Date(o.createdAt),
          productName: o.productTitle || o.productId,
        }));
      setRecentTransactions(transactions);

      // Calculate fan metrics from orders
      const fanSpending = new Map<
        string,
        { total: number; lastActive: Date; firstOrder: Date; fanName?: string | null; fanEmail?: string | null }
      >();
      orders.forEach((o: any) => {
        const fanId = o.fanId || o.fanEmail || "unknown";
        const fanEmail = (typeof o.fanEmail === "string" && o.fanEmail) || (fanId.includes("@") ? fanId : null);
        const fanName = (typeof o.fanName === "string" && o.fanName.trim()) ? o.fanName.trim() : null;
        const existing = fanSpending.get(fanId);
        const orderDate = new Date(o.createdAt);
        if (existing) {
          existing.total += o.amountCents || 0;
          if (orderDate > existing.lastActive) existing.lastActive = orderDate;
          if (orderDate < existing.firstOrder) existing.firstOrder = orderDate;
          if (fanName && !existing.fanName) existing.fanName = fanName;
          if (fanEmail && !existing.fanEmail) existing.fanEmail = fanEmail;
        } else {
          fanSpending.set(fanId, {
            total: o.amountCents || 0,
            lastActive: orderDate,
            firstOrder: orderDate,
            fanName,
            fanEmail,
          });
        }
      });

      // Calculate fan metrics
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      let totalFans = fanSpending.size;
      let newFans = 0;
      let activeFans = 0;
      let churnedFans = 0;

      fanSpending.forEach((data) => {
        if (data.firstOrder >= thirtyDaysAgo) newFans++;
        if (data.lastActive >= thirtyDaysAgo) activeFans++;
        if (data.lastActive < sixtyDaysAgo && data.firstOrder < sixtyDaysAgo) churnedFans++;
      });

      const churnRate = totalFans > 0 ? (churnedFans / totalFans) * 100 : 0;

      setFanMetrics({
        totalFans,
        newFans,
        activeFans,
        churnedFans,
        churnRate,
      });

      // Top fans by spending
      const topFansList: TopFan[] = Array.from(fanSpending.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10)
        .map(([id, data]) => ({
          id,
          name: formatFanDisplayLabel(
            { displayName: data.fanName, email: data.fanEmail },
            { fallback: id.includes("@") ? "Member" : "Fan" }
          ),
          email: data.fanEmail || (id.includes("@") ? id : id),
          totalSpentCents: data.total,
          lastActiveAt: data.lastActive,
        }));
      setTopFans(topFansList);

    } catch (error) {
      console.error("Error loading fan hub analytics:", error);
      showToast?.("Failed to load analytics", "error");
    } finally {
      setLoading(false);
    }
  }, [user?.id, dateRange, showToast]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const getChangePercentage = (current: number, previous: number | undefined): number | null => {
    if (previous === undefined || previous === 0) return null;
    return ((current - previous) / previous) * 100;
  };

  const StatCard: React.FC<{
    title: string;
    value: string;
    icon: React.ReactNode;
    change?: number | null;
    subtitle?: string;
    accentColor?: string;
  }> = ({ title, value, icon, change, subtitle, accentColor = "indigo" }) => (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-5 border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</span>
        <div className={`p-2 rounded-lg bg-${accentColor}-100 dark:bg-${accentColor}-900/30 text-${accentColor}-600 dark:text-${accentColor}-400`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{value}</p>
      {change !== null && change !== undefined && (
        <div className={`flex items-center gap-1 text-sm ${change >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
          {change >= 0 ? <TrendUpIcon /> : <TrendDownIcon />}
          <span>{change >= 0 ? "+" : ""}{formatPercentage(change)} vs prev period</span>
        </div>
      )}
      {subtitle && !change && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      )}
    </div>
  );

  if (!user?.id) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">Sign in to view analytics.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Fan Page Analytics</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Track your earnings, fan engagement, and growth metrics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          <button
            onClick={() => loadAnalytics()}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            title="Refresh"
          >
            <RefreshIcon />
          </button>
        </div>
      </div>

      {/* Revenue Overview */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <DollarIcon />
          Revenue Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Revenue"
            value={formatCents(revenue.totalRevenueCents)}
            icon={<DollarIcon />}
            change={getChangePercentage(revenue.totalRevenueCents, previousRevenue?.totalRevenueCents)}
            accentColor="indigo"
          />
          <StatCard
            title="Tips"
            value={formatCents(revenue.tipsCents)}
            icon={<HeartIcon />}
            change={getChangePercentage(revenue.tipsCents, previousRevenue?.tipsCents)}
            accentColor="indigo"
          />
          <StatCard
            title="Content Unlocks"
            value={formatCents(revenue.unlocksCents)}
            icon={<UnlockIcon />}
            change={getChangePercentage(revenue.unlocksCents, previousRevenue?.unlocksCents)}
            accentColor="purple"
          />
          <StatCard
            title="Treats Store"
            value={formatCents(revenue.treatsCents)}
            icon={<GiftIcon />}
            change={getChangePercentage(revenue.treatsCents, previousRevenue?.treatsCents)}
            accentColor="blue"
          />
          <StatCard
            title="Subscriptions"
            value={formatCents(revenue.subscriptionsCents)}
            icon={<StarIcon />}
            change={getChangePercentage(revenue.subscriptionsCents, previousRevenue?.subscriptionsCents)}
            accentColor="green"
          />
        </div>
      </div>

      {/* Fan Metrics */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <UsersIcon />
          Fan Metrics
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Fans"
            value={fanMetrics.totalFans.toLocaleString()}
            icon={<UsersIcon />}
            subtitle="Unique paying fans"
          />
          <StatCard
            title="New Fans"
            value={fanMetrics.newFans.toLocaleString()}
            icon={<UsersIcon />}
            subtitle="Last 30 days"
          />
          <StatCard
            title="Active Fans"
            value={fanMetrics.activeFans.toLocaleString()}
            icon={<UsersIcon />}
            subtitle="Active in last 30 days"
          />
          <StatCard
            title="Churned Fans"
            value={fanMetrics.churnedFans.toLocaleString()}
            icon={<UsersIcon />}
            subtitle="Inactive 60+ days"
          />
          <StatCard
            title="Churn Rate"
            value={formatPercentage(fanMetrics.churnRate)}
            icon={<TrendDownIcon />}
            subtitle={fanMetrics.churnRate > 10 ? "Consider re-engagement" : "Healthy retention"}
            accentColor={fanMetrics.churnRate > 10 ? "red" : "green"}
          />
        </div>
      </div>

      {/* Two Column Layout: Top Fans & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Fans */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <StarIcon />
              Top Fans by Spending
            </h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {topFans.length === 0 ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                No fan data yet. Earnings will appear here as fans purchase.
              </div>
            ) : (
              topFans.map((fan, index) => (
                <div key={fan.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      index === 0 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                      index === 1 ? "bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300" :
                      index === 2 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                      "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{fan.name}</p>
                      {fan.email && fan.email.includes("@") && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{fan.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-indigo-600 dark:text-indigo-400">{formatCents(fan.totalSpentCents)}</p>
                    {fan.lastActiveAt && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {fan.lastActiveAt.toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <DollarIcon />
              Recent Transactions
            </h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[400px] overflow-y-auto">
            {recentTransactions.length === 0 ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                No transactions yet. They'll appear here when fans make purchases.
              </div>
            ) : (
              recentTransactions.map((tx) => (
                <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      tx.type === "tip" ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400" :
                      tx.type === "unlock" ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" :
                      tx.type === "subscription" ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" :
                      "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                    }`}>
                      {tx.type === "tip" ? <HeartIcon /> :
                       tx.type === "unlock" ? <UnlockIcon /> :
                       tx.type === "subscription" ? <StarIcon /> :
                       <GiftIcon />}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {tx.type === "tip" ? "Tip" :
                         tx.type === "unlock" ? "Content Unlock" :
                         tx.type === "subscription" ? "Subscription" :
                         tx.productName || "Treat Purchase"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatFanDisplayLabel(
                          { displayName: tx.fanName, email: tx.fanEmail },
                          { fallback: "Member" }
                        )}
                        {tx.fanEmail && tx.fanEmail !== "Unknown" && tx.fanEmail.includes("@") && (
                          <span className="block text-[11px] opacity-80 mt-0.5">{tx.fanEmail}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 dark:text-white">{formatCents(tx.amountCents)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {tx.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Insights Section */}
      <div className="bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 rounded-xl p-6 border border-indigo-100 dark:border-indigo-800/50">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Quick Insights</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-4">
            <p className="font-medium text-gray-900 dark:text-white mb-1">Top Revenue Source</p>
            <p className="text-gray-600 dark:text-gray-400">
              {revenue.tipsCents >= revenue.unlocksCents && revenue.tipsCents >= revenue.treatsCents ? "Tips" :
               revenue.unlocksCents >= revenue.treatsCents ? "Content Unlocks" : "Treats Store"}
              {" "}is your biggest earner
            </p>
          </div>
          <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-4">
            <p className="font-medium text-gray-900 dark:text-white mb-1">Fan Engagement</p>
            <p className="text-gray-600 dark:text-gray-400">
              {fanMetrics.activeFans > 0 
                ? `${Math.round((fanMetrics.activeFans / fanMetrics.totalFans) * 100)}% of fans active this month`
                : "Start building your fan base!"}
            </p>
          </div>
          <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-4">
            <p className="font-medium text-gray-900 dark:text-white mb-1">Growth Opportunity</p>
            <p className="text-gray-600 dark:text-gray-400">
              {fanMetrics.churnedFans > 0 
                ? `Re-engage ${fanMetrics.churnedFans} inactive fans with exclusive content`
                : "Great retention! Keep engaging your fans"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
