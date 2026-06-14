import { getAdminDb } from "./_firebaseAdmin.js";
import { sendFanNotification } from "./_fanNotifications.js";
import { sendFcmMulticast } from "./_fcmPush.js";

const MAX_MEMBERS_PER_TREAT = 500;
const MEMBER_HUB_ORIGIN = "https://witme.io";
const TREAT_TITLE_MAX = 80;

async function resolveCreatorHandle(db: ReturnType<typeof getAdminDb>, creatorId: string): Promise<string | null> {
  try {
    const snap = await db.collection("creatorHandles").where("creatorId", "==", creatorId).limit(1).get();
    if (!snap.empty) {
      const handle = snap.docs[0].id.trim().replace(/^@/, "").toLowerCase();
      if (handle) return handle;
    }
  } catch {
    /* ignore */
  }
  try {
    const creatorSnap = await db.collection("creators").doc(creatorId).get();
    const raw = typeof creatorSnap.data()?.handle === "string" ? creatorSnap.data()!.handle.trim() : "";
    const handle = raw.replace(/^@/, "").toLowerCase();
    if (handle) return handle;
  } catch {
    /* ignore */
  }
  return null;
}

async function resolveCreatorPushLabel(db: ReturnType<typeof getAdminDb>, creatorId: string): Promise<string> {
  const handle = await resolveCreatorHandle(db, creatorId);
  if (handle) return `@${handle}`;
  try {
    const userSnap = await db.collection("users").doc(creatorId).get();
    const name = typeof userSnap.data()?.name === "string" ? userSnap.data()!.name.trim() : "";
    if (name) return name;
  } catch {
    /* ignore */
  }
  return "A creator you follow";
}

async function listMemberFanIds(db: ReturnType<typeof getAdminDb>, creatorId: string): Promise<string[]> {
  const [fansSnap, subscribersSnap, blocksSnap] = await Promise.all([
    db.collection("creators").doc(creatorId).collection("fans").limit(MAX_MEMBERS_PER_TREAT).get(),
    db
      .collection("creatorSubscribers")
      .doc(creatorId)
      .collection("subscribers")
      .where("status", "in", ["active", "trialing", "past_due"])
      .limit(MAX_MEMBERS_PER_TREAT)
      .get(),
    db.collection("creatorBlocks").doc(creatorId).collection("blocked").limit(MAX_MEMBERS_PER_TREAT).get(),
  ]);
  const blocked = new Set(blocksSnap.docs.map((d) => d.id));
  const ids = new Set<string>();
  const add = (id: string) => {
    const fanId = id.trim();
    if (!fanId || fanId.startsWith("guest_") || fanId === creatorId || blocked.has(fanId)) return;
    ids.add(fanId);
  };
  fansSnap.docs.forEach((d) => add(d.id));
  subscribersSnap.docs.forEach((d) => add(d.id));
  return [...ids].slice(0, MAX_MEMBERS_PER_TREAT);
}

function treatTitle(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length <= TREAT_TITLE_MAX) return clean;
  return `${clean.slice(0, TREAT_TITLE_MAX - 3).trimEnd()}...`;
}

/**
 * In-app bell + web push for members when a creator adds a visible Store treat.
 */
export async function notifyCreatorMembersNewTreat(params: {
  creatorId: string;
  productId: string;
  title: string;
  visible: boolean;
  archived: boolean;
  showInMemberStore: boolean;
}): Promise<{ members: number; inApp: number; pushSent: number }> {
  const db = getAdminDb();
  const creatorId = params.creatorId.trim();
  const productId = params.productId.trim();
  if (!creatorId || !productId || params.archived || !params.visible || !params.showInMemberStore) {
    return { members: 0, inApp: 0, pushSent: 0 };
  }

  const memberIds = await listMemberFanIds(db, creatorId);
  if (memberIds.length === 0) {
    return { members: 0, inApp: 0, pushSent: 0 };
  }

  const [creatorLabel, handle] = await Promise.all([
    resolveCreatorPushLabel(db, creatorId),
    resolveCreatorHandle(db, creatorId),
  ]);
  const displayTitle = treatTitle(params.title);
  const title = `New treat from ${creatorLabel}`;
  const body = `"${displayTitle}" is now in the Store.`;
  const data = {
    creatorId,
    productId,
    type: "new_treat",
    destination: "store",
  };
  const hubUrl = handle ? `${MEMBER_HUB_ORIGIN}/${encodeURIComponent(handle)}/store` : undefined;

  const tokenOwners = new Map<string, string>();
  const allTokens: string[] = [];
  let inApp = 0;

  await Promise.all(
    memberIds.map(async (fanId) => {
      try {
        await sendFanNotification({
          fanId,
          type: "new_treat",
          title,
          body,
          data: {
            ...data,
            ...(hubUrl ? { url: hubUrl } : {}),
          },
          sendPush: false,
        });
        inApp += 1;
      } catch (e) {
        console.warn("notifyCreatorMembersNewTreat in-app failed:", fanId, e);
      }

      try {
        const userSnap = await db.collection("users").doc(fanId).get();
        const userData = userSnap.data() as { fcmTokens?: unknown; pushNotificationsEnabled?: boolean } | undefined;
        if (userData?.pushNotificationsEnabled === false) return;
        const tokens = Array.isArray(userData?.fcmTokens)
          ? (userData!.fcmTokens as string[]).filter((t) => typeof t === "string" && t.trim())
          : [];
        tokens.forEach((t) => {
          allTokens.push(t);
          tokenOwners.set(t, fanId);
        });
      } catch {
        /* ignore token load */
      }
    }),
  );

  const pushResult = await sendFcmMulticast({
    tokens: allTokens,
    tokenOwners,
    title,
    body,
    data,
    link: hubUrl,
  });

  return { members: memberIds.length, inApp, pushSent: pushResult.sent };
}
