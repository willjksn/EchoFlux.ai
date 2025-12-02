// api/platforms/instagram.ts
// Instagram Graph API integration for syncing DMs and comments

interface InstagramAccount {
  accessToken: string;
  expiresAt?: string;
  accountId: string;
  accountUsername?: string;
  connected: boolean;
}

interface InstagramMessage {
  id: string;
  from: {
    id: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
  };
  message: string;
  timestamp: string;
}

interface InstagramComment {
  id: string;
  from: {
    id: string;
    username: string;
    profile_picture_url?: string;
  };
  text: string;
  timestamp: string;
  media?: {
    id: string;
  };
}

/**
 * Refresh Instagram access token if expired
 */
async function refreshInstagramToken(account: InstagramAccount): Promise<string | null> {
  // Check if token is expired
  if (account.expiresAt) {
    const expiresAt = new Date(account.expiresAt);
    const now = new Date();
    
    // Refresh if expires within 7 days
    if (expiresAt.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000) {
      try {
        const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
        if (!clientSecret) {
          console.warn("INSTAGRAM_CLIENT_SECRET not configured, cannot refresh token");
          return account.accessToken;
        }

        // Exchange short-lived token for long-lived token
        const response = await fetch(
          `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${account.accessToken}`,
          { method: "GET" }
        );

        if (response.ok) {
          const data = await response.json();
          return data.access_token || account.accessToken;
        }
      } catch (error) {
        console.error("Failed to refresh Instagram token:", error);
      }
    }
  }

  return account.accessToken;
}

/**
 * Fetch Instagram DMs using Graph API
 */
export async function fetchInstagramDMs(
  account: InstagramAccount,
  since?: string
): Promise<InstagramMessage[]> {
  try {
    const accessToken = await refreshInstagramToken(account);
    if (!accessToken) {
      throw new Error("No valid access token");
    }

    // Instagram Graph API: Get conversations
    // Note: Instagram Graph API requires Instagram Business Account and permissions
    const url = new URL(`https://graph.instagram.com/${account.accountId}/conversations`);
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("fields", "id,participants,messages{id,from,message,timestamp}");
    
    if (since) {
      // Filter by timestamp if provided
      url.searchParams.set("since", since);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Instagram DMs API error:", errorText);
      
      // If API not available or permissions missing, return empty array
      if (response.status === 403 || response.status === 400) {
        console.warn("Instagram DMs API not available - may need Business Account or permissions");
        return [];
      }
      
      throw new Error(`Instagram API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const messages: InstagramMessage[] = [];

    // Process conversations and extract messages
    if (data.data && Array.isArray(data.data)) {
      for (const conversation of data.data) {
        if (conversation.messages && conversation.messages.data) {
          for (const msg of conversation.messages.data) {
            // Filter out messages from the account owner
            if (msg.from?.id !== account.accountId) {
              messages.push({
                id: msg.id,
                from: {
                  id: msg.from?.id || "",
                  username: msg.from?.username,
                  name: msg.from?.name,
                  profile_picture_url: msg.from?.profile_picture_url,
                },
                message: msg.message || "",
                timestamp: msg.timestamp || new Date().toISOString(),
              });
            }
          }
        }
      }
    }

    return messages;
  } catch (error: any) {
    console.error("Error fetching Instagram DMs:", error);
    // Return empty array on error to prevent breaking the sync
    return [];
  }
}

/**
 * Fetch Instagram comments using Graph API
 */
export async function fetchInstagramComments(
  account: InstagramAccount,
  since?: string
): Promise<InstagramComment[]> {
  try {
    const accessToken = await refreshInstagramToken(account);
    if (!accessToken) {
      throw new Error("No valid access token");
    }

    // First, get user's media (posts)
    const mediaUrl = new URL(`https://graph.instagram.com/${account.accountId}/media`);
    mediaUrl.searchParams.set("access_token", accessToken);
    mediaUrl.searchParams.set("fields", "id,media_type,timestamp");
    mediaUrl.searchParams.set("limit", "25"); // Get recent 25 posts

    const mediaResponse = await fetch(mediaUrl.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!mediaResponse.ok) {
      const errorText = await mediaResponse.text();
      console.error("Instagram Media API error:", errorText);
      
      if (mediaResponse.status === 403 || mediaResponse.status === 400) {
        console.warn("Instagram Media API not available - may need Business Account");
        return [];
      }
      
      throw new Error(`Instagram API error: ${mediaResponse.status} - ${errorText}`);
    }

    const mediaData = await mediaResponse.json();
    const allComments: InstagramComment[] = [];

    // Fetch comments for each media item
    if (mediaData.data && Array.isArray(mediaData.data)) {
      for (const media of mediaData.data) {
        try {
          const commentsUrl = new URL(`https://graph.instagram.com/${media.id}/comments`);
          commentsUrl.searchParams.set("access_token", accessToken);
          commentsUrl.searchParams.set("fields", "id,from,text,timestamp");
          
          if (since) {
            // Filter comments by timestamp
            commentsUrl.searchParams.set("since", since);
          }

          const commentsResponse = await fetch(commentsUrl.toString(), {
            method: "GET",
            headers: {
              "Accept": "application/json",
            },
          });

          if (commentsResponse.ok) {
            const commentsData = await commentsResponse.json();
            
            if (commentsData.data && Array.isArray(commentsData.data)) {
              for (const comment of commentsData.data) {
                allComments.push({
                  id: comment.id,
                  from: {
                    id: comment.from?.id || "",
                    username: comment.from?.username || "",
                    profile_picture_url: comment.from?.profile_picture_url,
                  },
                  text: comment.text || "",
                  timestamp: comment.timestamp || new Date().toISOString(),
                  media: {
                    id: media.id,
                  },
                });
              }
            }
          }

          // Rate limiting: small delay between requests
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`Error fetching comments for media ${media.id}:`, error);
          // Continue with next media item
        }
      }
    }

    return allComments;
  } catch (error: any) {
    console.error("Error fetching Instagram comments:", error);
    return [];
  }
}

/**
 * Save Instagram message to Firestore
 */
export async function saveInstagramMessage(
  userId: string,
  message: InstagramMessage,
  db: any
): Promise<void> {
  const messageDoc = {
    id: message.id,
    platform: "Instagram" as const,
    type: "DM" as const,
    user: {
      name: message.from.name || message.from.username || "Unknown",
      avatar: message.from.profile_picture_url || "",
      id: message.from.id,
    },
    content: message.message,
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
 * Save Instagram comment to Firestore
 */
export async function saveInstagramComment(
  userId: string,
  comment: InstagramComment,
  db: any
): Promise<void> {
  const commentDoc = {
    id: comment.id,
    platform: "Instagram" as const,
    type: "Comment" as const,
    user: {
      name: comment.from.username || "Unknown",
      avatar: comment.from.profile_picture_url || "",
      id: comment.from.id,
    },
    content: comment.text,
    timestamp: comment.timestamp,
    sentiment: "Neutral" as const,
    isRead: false,
    isFlagged: false,
    isFavorite: false,
    postId: comment.media?.id,
    createdAt: new Date().toISOString(),
  };

  await db
    .collection("users")
    .doc(userId)
    .collection("messages")
    .doc(comment.id)
    .set(commentDoc, { merge: true });
}

