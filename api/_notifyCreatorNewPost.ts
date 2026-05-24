import { getAdminDb } from "./_firebaseAdmin.js";
import { sendFanNotification } from "./_fanNotifications.js";
import { sendFcmMulticast } from "./_fcmPush.js";

const MAX_MEMBERS_PER_POST = 500;

async function resolveCreatorPushLabel(db: ReturnType<typeof getAdminDb>, creatorId: string): Promise<string> {
  try {
    const handleSnap = await db.collection("creatorHandles").doc(creatorId).get();
    const handle = typeof handleSnap.data()?.handle === "string" ? handleSnap.data()!.handle.trim() : "";
    if (handle) return handle.startsWith("@") ? handle : `@${handle}`;
  } catch {
    /* ignore */
  }
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
  const [fansSnap, subscribersSnap] = await Promise.all([
    db.collection("creators").doc(creatorId).collection("fans").limit(MAX_MEMBERS_PER_POST).get(),
    db
      .collection("creatorSubscribers")
      .doc(creatorId)
      .collection("subscribers")
      .where("status", "in", ["active", "trialing", "past_due"])
      .limit(MAX_MEMBERS_PER_POST)
      .get(),
  ]);
  const ids = new Set<string>();
  fansSnap.docs.forEach((d) => ids.add(d.id));
  subscribersSnap.docs.forEach((d) => ids.add(d.id));
  return [...ids].slice(0, MAX_MEMBERS_PER_POST);
}

function postPreview(body: string, max = 120): string {
  const t = body.trim();
  if (!t) return "New post on their page";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * In-app bell + web push for all members when a Fan Hub post goes live.
 */
export async function notifyCreatorMembersNewPost(params: {
  creatorId: string;
  postId: string;
  bodyPreview?: string;
  memberHubUrl?: string;
}): Promise<{ members: number; inApp: number; pushSent: number }> {
  const db = getAdminDb();
  const creatorId = params.creatorId.trim();
  const postId = params.postId.trim();
  if (!creatorId || !postId) {
    return { members: 0, inApp: 0, pushSent: 0 };
  }

  const postSnap = await db.collection("creators").doc(creatorId).collection("fanPosts").doc(postId).get();
  if (!postSnap.exists) {
    return { members: 0, inApp: 0, pushSent: 0 };
  }
  const post = postSnap.data() as Record<string, unknown>;
  const status = String(post.status ?? "published").trim().toLowerCase();
  if (status !== "published") {
    return { members: 0, inApp: 0, pushSent: 0 };
  }
  const promo = post.liveStreamPromo as { creatorTestOnly?: boolean } | undefined;
  if (promo?.creatorTestOnly) {
    return { members: 0, inApp: 0, pushSent: 0 };
  }

  const memberIds = await listMemberFanIds(db, creatorId);
  if (memberIds.length === 0) {
    return { members: 0, inApp: 0, pushSent: 0 };
  }

  const creatorLabel = await resolveCreatorPushLabel(db, creatorId);
  const bodyText =
    (typeof params.bodyPreview === "string" && params.bodyPreview.trim()) ||
    postPreview(typeof post.body === "string" ? post.body : "");
  const title = `New post from ${creatorLabel}`;
  const hubUrl = params.memberHubUrl?.trim() || undefined;

  const tokenOwners = new Map<string, string>();
  const allTokens: string[] = [];
  let inApp = 0;

  await Promise.all(
    memberIds.map(async (fanId) => {
      if (fanId === creatorId) return;
      try {
        await sendFanNotification({
          fanId,
          type: "new_post",
          title,
          body: bodyText,
          data: {
            creatorId,
            postId,
            type: "new_post",
            ...(hubUrl ? { url: hubUrl } : {}),
          },
          sendPush: false,
        });
        inApp += 1;
      } catch (e) {
        console.warn("notifyCreatorMembersNewPost in-app failed:", fanId, e);
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
    body: bodyText,
    data: { creatorId, postId, type: "new_post" },
    link: hubUrl,
  });

  return { members: memberIds.length, inApp, pushSent: pushResult.sent };
}
