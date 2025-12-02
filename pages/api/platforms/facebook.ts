// api/platforms/facebook.ts
// Facebook Graph API integration for syncing messages and comments

interface FacebookAccount {
  accessToken: string;
  expiresAt?: string;
  accountId: string; // Facebook Page ID
  accountUsername?: string;
  connected: boolean;
}

interface FacebookMessage {
  id: string;
  from: {
    id: string;
    name: string;
    avatar?: string;
  };
  text: string;
  timestamp: string;
}

interface FacebookComment {
  id: string;
  from: {
    id: string;
    name: string;
    avatar?: string;
  };
  text: string;
  timestamp: string;
  postId?: string;
}

/**
 * Refresh Facebook access token if expired
 */
async function refreshFacebookToken(account: FacebookAccount): Promise<string | null> {
  // Check if token is expired
  if (account.expiresAt) {
    const expiresAt = new Date(account.expiresAt);
    const now = new Date();
    
    // Refresh if expires within 7 days (Facebook tokens are long-lived)
    if (expiresAt.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000) {
      try {
        const appId = process.env.FACEBOOK_APP_ID;
        const appSecret = process.env.FACEBOOK_APP_SECRET;
        
        if (!appId || !appSecret) {
          console.warn("Facebook App credentials not configured");
          return account.accessToken;
        }

        // Exchange short-lived token for long-lived token
        const response = await fetch(
          `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${account.accessToken}`,
          { method: "GET" }
        );

        if (response.ok) {
          const data = await response.json();
          return data.access_token || account.accessToken;
        }
      } catch (error) {
        console.error("Failed to refresh Facebook token:", error);
      }
    }
  }

  return account.accessToken;
}

/**
 * Fetch Facebook messages using Graph API
 */
export async function fetchFacebookMessages(
  account: FacebookAccount,
  since?: string
): Promise<FacebookMessage[]> {
  try {
    const accessToken = await refreshFacebookToken(account);
    if (!accessToken) {
      throw new Error("No valid access token");
    }

    // Facebook Graph API: Get conversations
    const url = new URL(`https://graph.facebook.com/v18.0/${account.accountId}/conversations`);
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("fields", "id,participants,messages{id,from,message,created_time}");
    url.searchParams.set("limit", "100");
    
    if (since) {
      // Filter by timestamp
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
      console.error("Facebook Messages API error:", errorText);
      
      // If API not available or permissions missing, return empty array
      if (response.status === 403 || response.status === 400) {
        console.warn("Facebook Messages API not available - may need Page access token or permissions");
        return [];
      }
      
      throw new Error(`Facebook API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const messages: FacebookMessage[] = [];

    // Process conversations and extract messages
    if (data.data && Array.isArray(data.data)) {
      for (const conversation of data.data) {
        if (conversation.messages && conversation.messages.data) {
          for (const msg of conversation.messages.data) {
            // Filter out messages sent by the page
            if (msg.from?.id !== account.accountId) {
              messages.push({
                id: msg.id,
                from: {
                  id: msg.from?.id || "",
                  name: msg.from?.name || "Unknown",
                  avatar: msg.from?.picture?.data?.url,
                },
                text: msg.message || "",
                timestamp: msg.created_time || new Date().toISOString(),
              });
            }
          }
        }
      }
    }

    return messages;
  } catch (error: any) {
    console.error("Error fetching Facebook messages:", error);
    return [];
  }
}

/**
 * Fetch Facebook comments using Graph API
 */
export async function fetchFacebookComments(
  account: FacebookAccount,
  since?: string
): Promise<FacebookComment[]> {
  try {
    const accessToken = await refreshFacebookToken(account);
    if (!accessToken) {
      throw new Error("No valid access token");
    }

    // Get page's posts
    const postsUrl = new URL(`https://graph.facebook.com/v18.0/${account.accountId}/posts`);
    postsUrl.searchParams.set("access_token", accessToken);
    postsUrl.searchParams.set("fields", "id,created_time");
    postsUrl.searchParams.set("limit", "25"); // Get recent 25 posts

    if (since) {
      postsUrl.searchParams.set("since", since);
    }

    const postsResponse = await fetch(postsUrl.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!postsResponse.ok) {
      const errorText = await postsResponse.text();
      console.error("Facebook Posts API error:", errorText);
      
      if (postsResponse.status === 403 || postsResponse.status === 400) {
        console.warn("Facebook Posts API not available - may need Page access token");
        return [];
      }
      
      throw new Error(`Facebook API error: ${postsResponse.status} - ${errorText}`);
    }

    const postsData = await postsResponse.json();
    const postIds = postsData.data?.map((p: any) => p.id).filter(Boolean) || [];
    
    if (postIds.length === 0) {
      return [];
    }

    // Fetch comments for each post
    const allComments: FacebookComment[] = [];

    for (const postId of postIds) {
      try {
        const commentsUrl = new URL(`https://graph.facebook.com/v18.0/${postId}/comments`);
        commentsUrl.searchParams.set("access_token", accessToken);
        commentsUrl.searchParams.set("fields", "id,from,message,created_time");
        commentsUrl.searchParams.set("limit", "100");
        
        if (since) {
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
                  name: comment.from?.name || "Unknown",
                  avatar: comment.from?.picture?.data?.url,
                },
                text: comment.message || "",
                timestamp: comment.created_time || new Date().toISOString(),
                postId: postId,
              });
            }
          }
        }

        // Rate limiting: small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error fetching comments for post ${postId}:`, error);
        // Continue with next post
      }
    }

    return allComments;
  } catch (error: any) {
    console.error("Error fetching Facebook comments:", error);
    return [];
  }
}

/**
 * Save Facebook message to Firestore
 */
export async function saveFacebookMessage(
  userId: string,
  message: FacebookMessage,
  db: any
): Promise<void> {
  const messageDoc = {
    id: message.id,
    platform: "Facebook" as const,
    type: "DM" as const,
    user: {
      name: message.from.name || "Unknown",
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
 * Save Facebook comment to Firestore
 */
export async function saveFacebookComment(
  userId: string,
  comment: FacebookComment,
  db: any
): Promise<void> {
  const commentDoc = {
    id: comment.id,
    platform: "Facebook" as const,
    type: "Comment" as const,
    user: {
      name: comment.from.name || "Unknown",
      avatar: comment.from.avatar || "",
      id: comment.from.id,
    },
    content: comment.text,
    timestamp: comment.timestamp,
    sentiment: "Neutral" as const,
    isRead: false,
    isFlagged: false,
    isFavorite: false,
    postId: comment.postId,
    createdAt: new Date().toISOString(),
  };

  await db
    .collection("users")
    .doc(userId)
    .collection("messages")
    .doc(comment.id)
    .set(commentDoc, { merge: true });
}

