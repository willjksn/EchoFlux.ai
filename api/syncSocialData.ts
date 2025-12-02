// api/syncSocialData.ts
// Background job to sync DMs and comments from social media platforms
// Runs via Vercel Cron every 5-10 minutes

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

interface SyncResult {
  platform: string;
  success: boolean;
  dmsFetched: number;
  commentsFetched: number;
  error?: string;
}

/**
 * Sync DMs and comments for a single platform
 */
async function syncPlatformData(
  userId: string,
  platform: string,
  account: any
): Promise<SyncResult> {
  const result: SyncResult = {
    platform,
    success: false,
    dmsFetched: 0,
    commentsFetched: 0,
  };

  try {
    // Get last sync timestamp
    const db = getAdminDb();
    const syncDoc = await db
      .collection("users")
      .doc(userId)
      .collection("sync_status")
      .doc(platform)
      .get();

    const lastSyncTime = syncDoc.exists
      ? syncDoc.data()?.lastSyncTime || new Date(0).toISOString()
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Default: 24 hours ago

    // Platform-specific sync logic
    switch (platform) {
      case "Instagram":
        result.dmsFetched = await syncInstagramDMs(userId, account, lastSyncTime, db);
        result.commentsFetched = await syncInstagramComments(userId, account, lastSyncTime, db);
        break;
      case "X":
      case "Twitter":
        result.dmsFetched = await syncTwitterDMs(userId, account, lastSyncTime, db);
        result.commentsFetched = await syncTwitterComments(userId, account, lastSyncTime, db);
        break;
      case "TikTok":
        result.dmsFetched = await syncTikTokDMs(userId, account, lastSyncTime, db);
        result.commentsFetched = await syncTikTokComments(userId, account, lastSyncTime, db);
        break;
      case "YouTube":
        result.commentsFetched = await syncYouTubeComments(userId, account, lastSyncTime, db);
        break;
      case "LinkedIn":
        result.dmsFetched = await syncLinkedInMessages(userId, account, lastSyncTime, db);
        result.commentsFetched = await syncLinkedInComments(userId, account, lastSyncTime, db);
        break;
      case "Facebook":
        result.dmsFetched = await syncFacebookMessages(userId, account, lastSyncTime, db);
        result.commentsFetched = await syncFacebookComments(userId, account, lastSyncTime, db);
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    // Update sync status
    await db
      .collection("users")
      .doc(userId)
      .collection("sync_status")
      .doc(platform)
      .set(
        {
          lastSyncTime: new Date().toISOString(),
          lastSuccess: true,
          dmsFetched: result.dmsFetched,
          commentsFetched: result.commentsFetched,
        },
        { merge: true }
      );

    result.success = true;
  } catch (error: any) {
    console.error(`Error syncing ${platform} for user ${userId}:`, error);
    result.error = error.message || String(error);
    
    // Update sync status with error
    try {
      const db = getAdminDb();
      await db
        .collection("users")
        .doc(userId)
        .collection("sync_status")
        .doc(platform)
        .set(
          {
            lastSyncTime: new Date().toISOString(),
            lastSuccess: false,
            lastError: result.error,
          },
          { merge: true }
        );
    } catch (updateError) {
      console.error("Failed to update sync status:", updateError);
    }
  }

  return result;
}

// Platform-specific sync functions (stubs - implement with actual API calls)

async function syncInstagramDMs(
  userId: string,
  account: any,
  since: string,
  db: any
): Promise<number> {
  try {
    const {
      fetchInstagramDMs,
      saveInstagramMessage,
    } = await import("./platforms/instagram.js");

    const messages = await fetchInstagramDMs(account, since);
    let saved = 0;

    for (const message of messages) {
      try {
        await saveInstagramMessage(userId, message, db);
        saved++;
      } catch (error) {
        console.error(`Error saving Instagram DM ${message.id}:`, error);
      }
    }

    return saved;
  } catch (error: any) {
    console.error(`Error syncing Instagram DMs for user ${userId}:`, error);
    return 0;
  }
}

async function syncInstagramComments(
  userId: string,
  account: any,
  since: string,
  db: any
): Promise<number> {
  try {
    const {
      fetchInstagramComments,
      saveInstagramComment,
    } = await import("./platforms/instagram.js");

    const comments = await fetchInstagramComments(account, since);
    let saved = 0;

    for (const comment of comments) {
      try {
        await saveInstagramComment(userId, comment, db);
        saved++;
      } catch (error) {
        console.error(`Error saving Instagram comment ${comment.id}:`, error);
      }
    }

    return saved;
  } catch (error: any) {
    console.error(`Error syncing Instagram comments for user ${userId}:`, error);
    return 0;
  }
}

async function syncTwitterDMs(
  userId: string,
  account: any,
  since: string,
  db: any
): Promise<number> {
  try {
    const {
      fetchTwitterDMs,
      saveTwitterDM,
    } = await import("./platforms/twitter.js");

    const dms = await fetchTwitterDMs(account, since);
    let saved = 0;

    for (const dm of dms) {
      try {
        await saveTwitterDM(userId, dm, db);
        saved++;
      } catch (error) {
        console.error(`Error saving Twitter DM ${dm.id}:`, error);
      }
    }

    return saved;
  } catch (error: any) {
    console.error(`Error syncing Twitter DMs for user ${userId}:`, error);
    return 0;
  }
}

async function syncTwitterComments(
  userId: string,
  account: any,
  since: string,
  db: any
): Promise<number> {
  try {
    const {
      fetchTwitterMentions,
      saveTwitterMention,
    } = await import("./platforms/twitter.js");

    const mentions = await fetchTwitterMentions(account, since);
    let saved = 0;

    for (const mention of mentions) {
      try {
        await saveTwitterMention(userId, mention, db);
        saved++;
      } catch (error) {
        console.error(`Error saving Twitter mention ${mention.id}:`, error);
      }
    }

    return saved;
  } catch (error: any) {
    console.error(`Error syncing Twitter mentions for user ${userId}:`, error);
    return 0;
  }
}

async function syncTikTokDMs(
  userId: string,
  account: any,
  since: string,
  db: any
): Promise<number> {
  try {
    const {
      fetchTikTokDMs,
      saveTikTokDM,
    } = await import("./platforms/tiktok.js");

    const messages = await fetchTikTokDMs(account, since);
    let saved = 0;

    for (const message of messages) {
      try {
        await saveTikTokDM(userId, message, db);
        saved++;
      } catch (error) {
        console.error(`Error saving TikTok DM ${message.id}:`, error);
      }
    }

    return saved;
  } catch (error: any) {
    console.error(`Error syncing TikTok DMs for user ${userId}:`, error);
    return 0;
  }
}

async function syncTikTokComments(
  userId: string,
  account: any,
  since: string,
  db: any
): Promise<number> {
  try {
    const {
      fetchTikTokComments,
      saveTikTokComment,
    } = await import("./platforms/tiktok.js");

    const comments = await fetchTikTokComments(account, since);
    let saved = 0;

    for (const comment of comments) {
      try {
        await saveTikTokComment(userId, comment, db);
        saved++;
      } catch (error) {
        console.error(`Error saving TikTok comment ${comment.id}:`, error);
      }
    }

    return saved;
  } catch (error: any) {
    console.error(`Error syncing TikTok comments for user ${userId}:`, error);
    return 0;
  }
}

async function syncYouTubeComments(
  userId: string,
  account: any,
  since: string,
  db: any
): Promise<number> {
  try {
    const {
      fetchYouTubeComments,
      saveYouTubeComment,
    } = await import("./platforms/youtube.js");

    const comments = await fetchYouTubeComments(account, since);
    let saved = 0;

    for (const comment of comments) {
      try {
        await saveYouTubeComment(userId, comment, db);
        saved++;
      } catch (error) {
        console.error(`Error saving YouTube comment ${comment.id}:`, error);
      }
    }

    return saved;
  } catch (error: any) {
    console.error(`Error syncing YouTube comments for user ${userId}:`, error);
    return 0;
  }
}

async function syncLinkedInMessages(
  userId: string,
  account: any,
  since: string,
  db: any
): Promise<number> {
  try {
    const {
      fetchLinkedInMessages,
      saveLinkedInMessage,
    } = await import("./platforms/linkedin.js");

    const messages = await fetchLinkedInMessages(account, since);
    let saved = 0;

    for (const message of messages) {
      try {
        await saveLinkedInMessage(userId, message, db);
        saved++;
      } catch (error) {
        console.error(`Error saving LinkedIn message ${message.id}:`, error);
      }
    }

    return saved;
  } catch (error: any) {
    console.error(`Error syncing LinkedIn messages for user ${userId}:`, error);
    return 0;
  }
}

async function syncLinkedInComments(
  userId: string,
  account: any,
  since: string,
  db: any
): Promise<number> {
  try {
    const {
      fetchLinkedInComments,
      saveLinkedInComment,
    } = await import("./platforms/linkedin.js");

    const comments = await fetchLinkedInComments(account, since);
    let saved = 0;

    for (const comment of comments) {
      try {
        await saveLinkedInComment(userId, comment, db);
        saved++;
      } catch (error) {
        console.error(`Error saving LinkedIn comment ${comment.id}:`, error);
      }
    }

    return saved;
  } catch (error: any) {
    console.error(`Error syncing LinkedIn comments for user ${userId}:`, error);
    return 0;
  }
}

async function syncFacebookMessages(
  userId: string,
  account: any,
  since: string,
  db: any
): Promise<number> {
  try {
    const {
      fetchFacebookMessages,
      saveFacebookMessage,
    } = await import("./platforms/facebook.js");

    const messages = await fetchFacebookMessages(account, since);
    let saved = 0;

    for (const message of messages) {
      try {
        await saveFacebookMessage(userId, message, db);
        saved++;
      } catch (error) {
        console.error(`Error saving Facebook message ${message.id}:`, error);
      }
    }

    return saved;
  } catch (error: any) {
    console.error(`Error syncing Facebook messages for user ${userId}:`, error);
    return 0;
  }
}

async function syncFacebookComments(
  userId: string,
  account: any,
  since: string,
  db: any
): Promise<number> {
  try {
    const {
      fetchFacebookComments,
      saveFacebookComment,
    } = await import("./platforms/facebook.js");

    const comments = await fetchFacebookComments(account, since);
    let saved = 0;

    for (const comment of comments) {
      try {
        await saveFacebookComment(userId, comment, db);
        saved++;
      } catch (error) {
        console.error(`Error saving Facebook comment ${comment.id}:`, error);
      }
    }

    return saved;
  } catch (error: any) {
    console.error(`Error syncing Facebook comments for user ${userId}:`, error);
    return 0;
  }
}

/**
 * Main handler - can be called via cron or manually
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret (if called via cron)
  const cronSecret = req.headers["authorization"]?.replace("Bearer ", "");
  const isCronCall = cronSecret === process.env.CRON_SECRET;

  // If not cron, require auth
  if (!isCronCall) {
    try {
      const user = await verifyAuth(req);
      if (!user || user.role !== "Admin") {
        return res.status(403).json({ error: "Admin access required for manual sync" });
      }
    } catch (authError) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const db = getAdminDb();
    const { userId, platform } = req.query;

    // If userId specified, sync only that user
    if (userId && typeof userId === "string") {
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const user = userDoc.data();
      const socialAccounts = user?.socialAccounts || {};

      // If platform specified, sync only that platform
      if (platform && typeof platform === "string") {
        const account = socialAccounts[platform];
        if (!account?.connected) {
          return res.status(400).json({ error: `Platform ${platform} not connected` });
        }

        const result = await syncPlatformData(userId, platform, account);
        return res.status(200).json({ success: true, result });
      }

      // Sync all platforms for this user
      const results: SyncResult[] = [];
      for (const [platform, account] of Object.entries(socialAccounts)) {
        if (account && (account as any).connected) {
          const result = await syncPlatformData(userId, platform, account);
          results.push(result);
        }
      }

      return res.status(200).json({ success: true, results });
    }

    // Sync all users with connected accounts
    const usersSnapshot = await db
      .collection("users")
      .where("socialAccounts", "!=", null)
      .get();

    const allResults: Record<string, SyncResult[]> = {};

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const user = userDoc.data();
      const socialAccounts = user?.socialAccounts || {};

      const userResults: SyncResult[] = [];

      for (const [platform, account] of Object.entries(socialAccounts)) {
        if (account && (account as any).connected) {
          try {
            const result = await syncPlatformData(userId, platform, account);
            userResults.push(result);
          } catch (error: any) {
            userResults.push({
              platform,
              success: false,
              dmsFetched: 0,
              commentsFetched: 0,
              error: error.message || String(error),
            });
          }
        }
      }

      if (userResults.length > 0) {
        allResults[userId] = userResults;
      }
    }

    return res.status(200).json({
      success: true,
      usersSynced: Object.keys(allResults).length,
      results: allResults,
    });
  } catch (error: any) {
    console.error("syncSocialData error:", error);
    return res.status(500).json({
      error: "Failed to sync social data",
      details: error?.message || String(error),
    });
  }
}

