// api/platforms/twitter.ts
// Twitter/X API v2 integration for syncing DMs and mentions/comments

interface TwitterAccount {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  accountId: string;
  accountUsername?: string;
  connected: boolean;
}

interface TwitterDM {
  id: string;
  from: {
    id: string;
    username: string;
    name?: string;
    profile_image_url?: string;
  };
  text: string;
  timestamp: string;
}

interface TwitterMention {
  id: string;
  from: {
    id: string;
    username: string;
    name?: string;
    profile_image_url?: string;
  };
  text: string;
  timestamp: string;
  tweetId?: string;
}

/**
 * Refresh Twitter access token if expired
 */
async function refreshTwitterToken(account: TwitterAccount): Promise<string | null> {
  // Check if token is expired
  if (account.expiresAt) {
    const expiresAt = new Date(account.expiresAt);
    const now = new Date();
    
    // Refresh if expires within 1 hour
    if (expiresAt.getTime() - now.getTime() < 60 * 60 * 1000) {
      if (!account.refreshToken) {
        console.warn("No refresh token available for Twitter");
        return account.accessToken;
      }

      try {
        const clientId = process.env.TWITTER_CLIENT_ID;
        const clientSecret = process.env.TWITTER_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
          console.warn("Twitter OAuth credentials not configured");
          return account.accessToken;
        }

        // Exchange refresh token for new access token
        const response = await fetch("https://api.twitter.com/2/oauth2/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          },
          body: new URLSearchParams({
            refresh_token: account.refreshToken,
            grant_type: "refresh_token",
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return data.access_token || account.accessToken;
        }
      } catch (error) {
        console.error("Failed to refresh Twitter token:", error);
      }
    }
  }

  return account.accessToken;
}

/**
 * Fetch Twitter DMs using API v2
 */
export async function fetchTwitterDMs(
  account: TwitterAccount,
  since?: string
): Promise<TwitterDM[]> {
  try {
    const accessToken = await refreshTwitterToken(account);
    if (!accessToken) {
      throw new Error("No valid access token");
    }

    // Twitter API v2: Get DMs
    // Note: Requires elevated access and DM permissions
    const url = new URL("https://api.twitter.com/2/dm_events");
    url.searchParams.set("dm_event.fields", "id,text,created_at,sender_id");
    url.searchParams.set("user.fields", "id,username,name,profile_image_url");
    url.searchParams.set("max_results", "100");
    
    if (since) {
      // Convert ISO timestamp to Twitter's format
      const sinceDate = new Date(since);
      url.searchParams.set("start_time", sinceDate.toISOString());
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Twitter DMs API error:", errorText);
      
      // If API not available or permissions missing, return empty array
      if (response.status === 403 || response.status === 401) {
        console.warn("Twitter DMs API not available - may need elevated access or permissions");
        return [];
      }
      
      throw new Error(`Twitter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const dms: TwitterDM[] = [];

    if (data.data && Array.isArray(data.data)) {
      for (const dm of data.data) {
        // Filter out DMs sent by the account owner
        if (dm.sender_id !== account.accountId) {
          const user = data.includes?.users?.find((u: any) => u.id === dm.sender_id);
          
          dms.push({
            id: dm.id,
            from: {
              id: dm.sender_id,
              username: user?.username || "",
              name: user?.name,
              profile_image_url: user?.profile_image_url,
            },
            text: dm.text || "",
            timestamp: dm.created_at || new Date().toISOString(),
          });
        }
      }
    }

    return dms;
  } catch (error: any) {
    console.error("Error fetching Twitter DMs:", error);
    return [];
  }
}

/**
 * Fetch Twitter mentions using API v2
 */
export async function fetchTwitterMentions(
  account: TwitterAccount,
  since?: string
): Promise<TwitterMention[]> {
  try {
    const accessToken = await refreshTwitterToken(account);
    if (!accessToken) {
      throw new Error("No valid access token");
    }

    // Twitter API v2: Get mentions
    const url = new URL(`https://api.twitter.com/2/users/${account.accountId}/mentions`);
    url.searchParams.set("tweet.fields", "id,text,created_at,author_id");
    url.searchParams.set("user.fields", "id,username,name,profile_image_url");
    url.searchParams.set("max_results", "100");
    
    if (since) {
      const sinceDate = new Date(since);
      url.searchParams.set("start_time", sinceDate.toISOString());
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Twitter Mentions API error:", errorText);
      
      if (response.status === 403 || response.status === 401) {
        console.warn("Twitter Mentions API not available - may need elevated access");
        return [];
      }
      
      throw new Error(`Twitter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const mentions: TwitterMention[] = [];

    if (data.data && Array.isArray(data.data)) {
      for (const tweet of data.data) {
        const author = data.includes?.users?.find((u: any) => u.id === tweet.author_id);
        
        mentions.push({
          id: tweet.id,
          from: {
            id: tweet.author_id,
            username: author?.username || "",
            name: author?.name,
            profile_image_url: author?.profile_image_url,
          },
          text: tweet.text || "",
          timestamp: tweet.created_at || new Date().toISOString(),
          tweetId: tweet.id,
        });
      }
    }

    return mentions;
  } catch (error: any) {
    console.error("Error fetching Twitter mentions:", error);
    return [];
  }
}

/**
 * Save Twitter DM to Firestore
 */
export async function saveTwitterDM(
  userId: string,
  dm: TwitterDM,
  db: any
): Promise<void> {
  const messageDoc = {
    id: dm.id,
    platform: "X" as const,
    type: "DM" as const,
    user: {
      name: dm.from.name || dm.from.username || "Unknown",
      avatar: dm.from.profile_image_url || "",
      id: dm.from.id,
    },
    content: dm.text,
    timestamp: dm.timestamp,
    sentiment: "Neutral" as const,
    isRead: false,
    isFlagged: false,
    isFavorite: false,
    createdAt: new Date().toISOString(),
  };

  await db
    .collection("users")
    .doc(userId)
    .collection("messages")
    .doc(dm.id)
    .set(messageDoc, { merge: true });
}

/**
 * Save Twitter mention to Firestore (as comment)
 */
export async function saveTwitterMention(
  userId: string,
  mention: TwitterMention,
  db: any
): Promise<void> {
  const commentDoc = {
    id: mention.id,
    platform: "X" as const,
    type: "Comment" as const,
    user: {
      name: mention.from.name || mention.from.username || "Unknown",
      avatar: mention.from.profile_image_url || "",
      id: mention.from.id,
    },
    content: mention.text,
    timestamp: mention.timestamp,
    sentiment: "Neutral" as const,
    isRead: false,
    isFlagged: false,
    isFavorite: false,
    postId: mention.tweetId,
    createdAt: new Date().toISOString(),
  };

  await db
    .collection("users")
    .doc(userId)
    .collection("messages")
    .doc(mention.id)
    .set(commentDoc, { merge: true });
}

