// api/platforms/tiktok.ts
// TikTok Business API integration for syncing DMs and comments

interface TikTokAccount {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  accountId: string; // TikTok Business account ID
  accountUsername?: string;
  connected: boolean;
}

interface TikTokMessage {
  id: string;
  from: {
    id: string;
    username: string;
    name?: string;
    avatar?: string;
  };
  text: string;
  timestamp: string;
}

interface TikTokComment {
  id: string;
  from: {
    id: string;
    username: string;
    name?: string;
    avatar?: string;
  };
  text: string;
  timestamp: string;
  videoId?: string;
}

/**
 * Refresh TikTok access token if expired
 */
async function refreshTikTokToken(account: TikTokAccount): Promise<string | null> {
  // Check if token is expired
  if (account.expiresAt) {
    const expiresAt = new Date(account.expiresAt);
    const now = new Date();
    
    // Refresh if expires within 1 hour
    if (expiresAt.getTime() - now.getTime() < 60 * 60 * 1000) {
      if (!account.refreshToken) {
        console.warn("No refresh token available for TikTok");
        return account.accessToken;
      }

      try {
        const clientKey = process.env.TIKTOK_CLIENT_KEY;
        const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
        
        if (!clientKey || !clientSecret) {
          console.warn("TikTok OAuth credentials not configured");
          return account.accessToken;
        }

        // Exchange refresh token for new access token
        const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            grant_type: "refresh_token",
            refresh_token: account.refreshToken,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return data.data?.access_token || account.accessToken;
        }
      } catch (error) {
        console.error("Failed to refresh TikTok token:", error);
      }
    }
  }

  return account.accessToken;
}

/**
 * Fetch TikTok DMs using Business API
 */
export async function fetchTikTokDMs(
  account: TikTokAccount,
  since?: string
): Promise<TikTokMessage[]> {
  try {
    const accessToken = await refreshTikTokToken(account);
    if (!accessToken) {
      throw new Error("No valid access token");
    }

    // TikTok Business API: Get messages
    // Note: Requires TikTok Business account and permissions
    const url = new URL("https://open.tiktokapis.com/v2/message/list/");
    
    const requestBody: any = {
      max_count: 100,
    };

    if (since) {
      requestBody.cursor = since; // Use timestamp as cursor
    }

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("TikTok DMs API error:", errorText);
      
      // If API not available or permissions missing, return empty array
      if (response.status === 403 || response.status === 401) {
        console.warn("TikTok DMs API not available - may need Business account or permissions");
        return [];
      }
      
      throw new Error(`TikTok API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const messages: TikTokMessage[] = [];

    if (data.data?.messages && Array.isArray(data.data.messages)) {
      for (const msg of data.data.messages) {
        // Filter out messages sent by the account owner
        if (msg.sender_id !== account.accountId) {
          messages.push({
            id: msg.message_id || msg.id,
            from: {
              id: msg.sender_id || "",
              username: msg.sender_username || "",
              name: msg.sender_name,
              avatar: msg.sender_avatar,
            },
            text: msg.text || "",
            timestamp: msg.create_time || new Date().toISOString(),
          });
        }
      }
    }

    return messages;
  } catch (error: any) {
    console.error("Error fetching TikTok DMs:", error);
    return [];
  }
}

/**
 * Fetch TikTok comments using Business API
 */
export async function fetchTikTokComments(
  account: TikTokAccount,
  since?: string
): Promise<TikTokComment[]> {
  try {
    const accessToken = await refreshTikTokToken(account);
    if (!accessToken) {
      throw new Error("No valid access token");
    }

    // First, get user's videos
    const videosUrl = new URL("https://open.tiktokapis.com/v2/video/list/");
    
    const videosResponse = await fetch(videosUrl.toString(), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        max_count: 25, // Get recent 25 videos
      }),
    });

    if (!videosResponse.ok) {
      const errorText = await videosResponse.text();
      console.error("TikTok Videos API error:", errorText);
      
      if (videosResponse.status === 403 || videosResponse.status === 401) {
        console.warn("TikTok Videos API not available - may need Business account");
        return [];
      }
      
      throw new Error(`TikTok API error: ${videosResponse.status} - ${errorText}`);
    }

    const videosData = await videosResponse.json();
    const videoIds = videosData.data?.videos?.map((v: any) => v.video_id).filter(Boolean) || [];
    
    if (videoIds.length === 0) {
      return [];
    }

    // Fetch comments for each video
    const allComments: TikTokComment[] = [];

    for (const videoId of videoIds) {
      try {
        const commentsUrl = new URL("https://open.tiktokapis.com/v2/video/comment/list/");
        
        const commentsBody: any = {
          video_id: videoId,
          max_count: 100,
        };

        if (since) {
          commentsBody.cursor = since;
        }

        const commentsResponse = await fetch(commentsUrl.toString(), {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify(commentsBody),
        });

        if (commentsResponse.ok) {
          const commentsData = await commentsResponse.json();
          
          if (commentsData.data?.comments && Array.isArray(commentsData.data.comments)) {
            for (const comment of commentsData.data.comments) {
              allComments.push({
                id: comment.comment_id || comment.id,
                from: {
                  id: comment.user_id || "",
                  username: comment.user_username || "",
                  name: comment.user_name,
                  avatar: comment.user_avatar,
                },
                text: comment.text || "",
                timestamp: comment.create_time || new Date().toISOString(),
                videoId: videoId,
              });
            }
          }
        }

        // Rate limiting: small delay between requests
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error(`Error fetching comments for video ${videoId}:`, error);
        // Continue with next video
      }
    }

    return allComments;
  } catch (error: any) {
    console.error("Error fetching TikTok comments:", error);
    return [];
  }
}

/**
 * Save TikTok DM to Firestore
 */
export async function saveTikTokDM(
  userId: string,
  message: TikTokMessage,
  db: any
): Promise<void> {
  const messageDoc = {
    id: message.id,
    platform: "TikTok" as const,
    type: "DM" as const,
    user: {
      name: message.from.name || message.from.username || "Unknown",
      avatar: message.from.avatar || "",
      id: message.from.id,
    },
    content: message.text,
    timestamp: message.timestamp,
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
    .doc(message.id)
    .set(messageDoc, { merge: true });
}

/**
 * Save TikTok comment to Firestore
 */
export async function saveTikTokComment(
  userId: string,
  comment: TikTokComment,
  db: any
): Promise<void> {
  const commentDoc = {
    id: comment.id,
    platform: "TikTok" as const,
    type: "Comment" as const,
    user: {
      name: comment.from.name || comment.from.username || "Unknown",
      avatar: comment.from.avatar || "",
      id: comment.from.id,
    },
    content: comment.text,
    timestamp: comment.timestamp,
    sentiment: "Neutral" as const,
    isRead: false,
    isFlagged: false,
    isFavorite: false,
    postId: comment.videoId,
    createdAt: new Date().toISOString(),
  };

  await db
    .collection("users")
    .doc(userId)
    .collection("messages")
    .doc(comment.id)
    .set(commentDoc, { merge: true });
}

