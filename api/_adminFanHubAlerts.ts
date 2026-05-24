import { getAdminDb } from "./_firebaseAdmin.js";
import {
  adminCreatorShortUidFallback,
  resolveAdminCreatorLabels,
} from "./_adminCreatorLabel.js";
import { resolveFanHubMemberDisplayLabel } from "./_fanNotifications.js";
import { resolveAdminDashboardPushLink, sendPlatformAdminWebPush } from "./_userWebPush.js";

/**
 * EchoFlux admin header bell (`admin_alerts` → DataContext for role Admin).
 * Fired when a fan newly joins a creator Fan Hub (free or paid), alongside creator `new_member` bell.
 */
export async function notifyEchoFluxAdminFanHubMemberJoined(params: {
  creatorId: string;
  fanId: string;
  membershipType?: "free" | "paid";
  displayNameHint?: string | null;
}): Promise<void> {
  const db = getAdminDb();
  const [fanLabel, { labels }] = await Promise.all([
    resolveFanHubMemberDisplayLabel({
      creatorId: params.creatorId,
      fanId: params.fanId,
      displayNameHint: params.displayNameHint,
    }),
    resolveAdminCreatorLabels(db, [params.creatorId]),
  ]);
  const creatorLabel =
    labels[params.creatorId] || adminCreatorShortUidFallback(params.creatorId);
  const kind = params.membershipType === "free" ? "free member" : "member";

  await db.collection("admin_alerts").add({
    type: "fan_hub_member_joined",
    severity: "low",
    title: "New Fan Hub member",
    message: `👥 ${fanLabel} joined ${creatorLabel} (${kind})`,
    creatorId: params.creatorId,
    fanId: params.fanId,
    membershipType: params.membershipType === "free" ? "free" : "paid",
    read: false,
    createdAt: new Date(),
  });

  try {
    await sendPlatformAdminWebPush({
      title: "New Fan Hub member",
      body: `${fanLabel} joined ${creatorLabel} (${kind})`,
      data: { type: "fan_hub_member_joined", creatorId: params.creatorId },
      link: resolveAdminDashboardPushLink(),
    });
  } catch (e) {
    console.warn("notifyEchoFluxAdminFanHubMemberJoined push failed:", e);
  }
}
