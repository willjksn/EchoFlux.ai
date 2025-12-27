import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, getVerifyAuth } from "./_errorHandler.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { getCurrentMonthKey } from "./_tavilyUsage.js";

type TotalsDoc = {
  month?: string;
  totalCalls?: number;
  adminCalls?: number;
  userCalls?: number;
  systemCalls?: number;
  lastUpdated?: any;
};

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const verifyAuth = await getVerifyAuth();
  const authUser = await verifyAuth(req);
  if (!authUser?.uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(authUser.uid).get();
  const adminData = adminDoc.data();
  if (adminData?.role !== "Admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const month = getCurrentMonthKey();

  const [globalDoc, monthDoc, topUsersSnap, topLifetimeSnap] = await Promise.all([
    db.collection("tavily_call_totals").doc("global").get(),
    db.collection("tavily_call_totals").doc(`month_${month}`).get(),
    db
      .collection("tavily_user_totals")
      .doc(month)
      .collection("users")
      .orderBy("count", "desc")
      .limit(50)
      .get()
      .catch(() => null),
    db
      .collection("tavily_user_totals")
      .doc("lifetime")
      .collection("users")
      .orderBy("count", "desc")
      .limit(50)
      .get()
      .catch(() => null),
  ]);

  const global = (globalDoc.exists ? (globalDoc.data() as TotalsDoc) : {}) || {};
  const monthTotals = (monthDoc.exists ? (monthDoc.data() as TotalsDoc) : {}) || {};

  const normalizeTotals = (d: TotalsDoc) => ({
    totalCalls: Number(d.totalCalls || 0),
    adminCalls: Number(d.adminCalls || 0),
    userCalls: Number(d.userCalls || 0),
    systemCalls: Number(d.systemCalls || 0),
    lastUpdated: d.lastUpdated || null,
  });

  const topUsersThisMonth =
    topUsersSnap?.docs?.map((doc) => ({ id: doc.id, ...doc.data() })) ?? [];
  const topUsersLifetime =
    topLifetimeSnap?.docs?.map((doc) => ({ id: doc.id, ...doc.data() })) ?? [];

  res.status(200).json({
    success: true,
    month,
    totals: {
      overall: normalizeTotals(global),
      thisMonth: normalizeTotals(monthTotals),
    },
    topUsersThisMonth,
    topUsersLifetime,
    note: "Counts represent real Tavily HTTP calls only (cache hits are excluded).",
  });
}

export default withErrorHandling(handler);


