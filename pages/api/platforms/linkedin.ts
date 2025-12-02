// api/platforms/linkedin.ts
// LinkedIn API integration for syncing messages and comments

interface LinkedInAccount {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  accountId: string; // LinkedIn URN (person or organization)
  accountUsername?: string;
  connected: boolean;
}

interface LinkedInMessage {
  id: string;
  from: {
    id: string;
    name: string;
    avatar?: string;
  };
  text: string;
  timestamp: string;
}

interface LinkedInComment {
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
 * Refresh LinkedIn access token if expired
 */
async function refreshLinkedInToken(account: LinkedInAccount): Promise<string | null> {
  // Check if token is expired
  if (account.expiresAt) {
    const expiresAt = new Date(account.expiresAt);
    const now = new Date();
    
    // Refresh if expires within 1 hour
    if (expiresAt.getTime() - now.getTime() < 60 * 60 * 1000) {
      if (!account.refreshToken) {
        console.warn("No refresh token available for LinkedIn");
        return account.accessToken;
      }

      try {
        const clientId = process.env.LINKEDIN_CLIENT_ID;
        const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
          console.warn("LinkedIn OAuth credentials not configured");
          return account.accessToken;
        }

        // Exchange refresh token for new access token
        const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: account.refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return data.access_token || account.accessToken;
        }
      } catch (error) {
        console.error("Failed to refresh LinkedIn token:", error);
      }
    }
  }

  return account.accessToken;
}

/**
 * Fetch LinkedIn messages using Messaging API
 */
export async function fetchLinkedInMessages(
  account: LinkedInAccount,
  since?: string
): Promise<LinkedInMessage[]> {
  try {
    const accessToken = await refreshLinkedInToken(account);
    if (!accessToken) {
      throw new Error("No valid access token");
    }

    // LinkedIn Messaging API: Get conversations
    // Note: Requires LinkedIn Marketing API access
    const url = new URL("https://api.linkedin.com/v2/messaging/conversations");
    url.searchParams.set("q", "viewers");
    url.searchParams.set("count", "100");
    
    if (since) {
      // Filter by created time
      url.searchParams.set("created", `after:${since}`);
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
      console.error("LinkedIn Messages API error:", errorText);
      
      // If API not available or permissions missing, return empty array
      if (response.status === 403 || response.status === 401) {
        console.warn("LinkedIn Messages API not available - may need Marketing API access");
        return [];
      }
      
      throw new Error(`LinkedIn API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const messages: LinkedInMessage[] = [];

    // Process conversations and extract messages
    if (data.elements && Array.isArray(data.elements)) {
      for (const conversation of data.elements) {
        // Fetch messages for each conversation
        try {
          const messagesUrl = `https://api.linkedin.com/v2/messaging/conversations/${conversation.id}/events`;
          const messagesResponse = await fetch(messagesUrl, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Accept": "application/json",
            },
          });

          if (messagesResponse.ok) {
            const messagesData = await messagesResponse.json();
            
            if (messagesData.elements && Array.isArray(messagesData.elements)) {
              for (const event of messagesData.elements) {
                if (event.eventContent?.messageEvent?.body?.text) {
                  // Filter out messages sent by the account owner
                  if (event.actor !== account.accountId) {
                    messages.push({
                      id: event.id || `msg_${Date.now()}`,
                      from: {
                        id: event.actor || "",
                        name: event.actorName || "Unknown",
                        avatar: event.actorAvatar,
                      },
                      text: event.eventContent.messageEvent.body.text,
                      timestamp: event.createdAt || new Date().toISOString(),
                    });
                  }
                }
              }
            }
          }

          // Rate limiting: delay between conversations
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Error fetching messages for conversation ${conversation.id}:`, error);
          // Continue with next conversation
        }
      }
    }

    return messages;
  } catch (error: any) {
    console.error("Error fetching LinkedIn messages:", error);
    return [];
  }
}

/**
 * Fetch LinkedIn comments using Shares API
 */
export async function fetchLinkedInComments(
  account: LinkedInAccount,
  since?: string
): Promise<LinkedInComment[]> {
  try {
    const accessToken = await refreshLinkedInToken(account);
    if (!accessToken) {
      throw new Error("No valid access token");
    }

    // Get user's shares (posts)
    const sharesUrl = new URL(`https://api.linkedin.com/v2/shares`);
    sharesUrl.searchParams.set("q", "owners");
    sharesUrl.searchParams.set("owners", account.accountId);
    sharesUrl.searchParams.set("count", "25"); // Get recent 25 posts

    const sharesResponse = await fetch(sharesUrl.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
      },
    });

    if (!sharesResponse.ok) {
      const errorText = await sharesResponse.text();
      console.error("LinkedIn Shares API error:", errorText);
      
      if (sharesResponse.status === 403 || sharesResponse.status === 401) {
        console.warn("LinkedIn Shares API not available - may need permissions");
        return [];
      }
      
      throw new Error(`LinkedIn API error: ${sharesResponse.status} - ${errorText}`);
    }

    const sharesData = await sharesResponse.json();
    const shareIds = sharesData.elements?.map((s: any) => s.id).filter(Boolean) || [];
    
    if (shareIds.length === 0) {
      return [];
    }

    // Fetch comments for each share
    const allComments: LinkedInComment[] = [];

    for (const shareId of shareIds) {
      try {
        const commentsUrl = `https://api.linkedin.com/v2/socialActions/${shareId}/comments`;
        
        const commentsResponse = await fetch(commentsUrl, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Accept": "application/json",
          },
        });

        if (commentsResponse.ok) {
          const commentsData = await commentsResponse.json();
          
          if (commentsData.elements && Array.isArray(commentsData.elements)) {
            for (const comment of commentsData.elements) {
              // Filter by timestamp if provided
              if (since) {
                const commentTime = new Date(comment.created?.time || 0);
                const sinceTime = new Date(since);
                if (commentTime < sinceTime) {
                  continue;
                }
              }

              allComments.push({
                id: comment.id || `comment_${Date.now()}`,
                from: {
                  id: comment.actor || "",
                  name: comment.actorName || "Unknown",
                  avatar: comment.actorAvatar,
                },
                text: comment.comment?.text || "",
                timestamp: comment.created?.time || new Date().toISOString(),
                postId: shareId,
              });
            }
          }
        }

        // Rate limiting: delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error fetching comments for share ${shareId}:`, error);
        // Continue with next share
      }
    }

    return allComments;
  } catch (error: any) {
    console.error("Error fetching LinkedIn comments:", error);
    return [];
  }
}

/**
 * Save LinkedIn message to Firestore
 */
export async function saveLinkedInMessage(
  userId: string,
  message: LinkedInMessage,
  db: any
): Promise<void> {
  const messageDoc = {
    id: message.id,
    platform: "LinkedIn" as const,
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
 * Save LinkedIn comment to Firestore
 */
export async function saveLinkedInComment(
  userId: string,
  comment: LinkedInComment,
  db: any
): Promise<void> {
  const commentDoc = {
    id: comment.id,
    platform: "LinkedIn" as const,
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

