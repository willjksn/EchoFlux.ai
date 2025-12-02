// api/platforms/youtube.ts
// YouTube Data API v3 integration for syncing comments

interface YouTubeAccount {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  accountId: string; // Channel ID
  accountUsername?: string;
  connected: boolean;
}

interface YouTubeComment {
  id: string;
  from: {
    id: string;
    username: string;
    name?: string;
    profile_image_url?: string;
  };
  text: string;
  timestamp: string;
  videoId: string;
}

/**
 * Refresh YouTube access token if expired
 */
async function refreshYouTubeToken(account: YouTubeAccount): Promise<string | null> {
  // Check if token is expired
  if (account.expiresAt) {
    const expiresAt = new Date(account.expiresAt);
    const now = new Date();
    
    // Refresh if expires within 5 minutes
    if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      if (!account.refreshToken) {
        console.warn("No refresh token available for YouTube");
        return account.accessToken;
      }

      try {
        const clientId = process.env.YOUTUBE_CLIENT_ID;
        const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
          console.warn("YouTube OAuth credentials not configured");
          return account.accessToken;
        }

        // Exchange refresh token for new access token
        const response = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: account.refreshToken,
            grant_type: "refresh_token",
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return data.access_token || account.accessToken;
        }
      } catch (error) {
        console.error("Failed to refresh YouTube token:", error);
      }
    }
  }

  return account.accessToken;
}

/**
 * Fetch YouTube comments using Data API v3
 */
export async function fetchYouTubeComments(
  account: YouTubeAccount,
  since?: string
): Promise<YouTubeComment[]> {
  try {
    const accessToken = await refreshYouTubeToken(account);
    if (!accessToken) {
      throw new Error("No valid access token");
    }

    // Get channel's uploads playlist
    const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
    channelUrl.searchParams.set("part", "contentDetails");
    channelUrl.searchParams.set("id", account.accountId);
    channelUrl.searchParams.set("access_token", accessToken);

    const channelResponse = await fetch(channelUrl.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!channelResponse.ok) {
      const errorText = await channelResponse.text();
      console.error("YouTube Channel API error:", errorText);
      
      if (channelResponse.status === 403 || channelResponse.status === 401) {
        console.warn("YouTube Channel API not available - may need permissions");
        return [];
      }
      
      throw new Error(`YouTube API error: ${channelResponse.status} - ${errorText}`);
    }

    const channelData = await channelResponse.json();
    const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

    if (!uploadsPlaylistId) {
      console.warn("No uploads playlist found for YouTube channel");
      return [];
    }

    // Get recent videos from uploads playlist
    const playlistUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    playlistUrl.searchParams.set("part", "contentDetails");
    playlistUrl.searchParams.set("playlistId", uploadsPlaylistId);
    playlistUrl.searchParams.set("maxResults", "25"); // Get recent 25 videos
    playlistUrl.searchParams.set("access_token", accessToken);

    const playlistResponse = await fetch(playlistUrl.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!playlistResponse.ok) {
      const errorText = await playlistResponse.text();
      console.error("YouTube Playlist API error:", errorText);
      return [];
    }

    const playlistData = await playlistResponse.json();
    const videoIds = playlistData.items?.map((item: any) => item.contentDetails?.videoId).filter(Boolean) || [];
    
    if (videoIds.length === 0) {
      return [];
    }

    // Fetch comments for all videos
    const allComments: YouTubeComment[] = [];

    for (const videoId of videoIds) {
      try {
        const commentsUrl = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
        commentsUrl.searchParams.set("part", "snippet");
        commentsUrl.searchParams.set("videoId", videoId);
        commentsUrl.searchParams.set("maxResults", "100");
        commentsUrl.searchParams.set("order", "time"); // Most recent first
        commentsUrl.searchParams.set("access_token", accessToken);

        if (since) {
          // Filter by published after timestamp
          const sinceDate = new Date(since);
          commentsUrl.searchParams.set("publishedAfter", sinceDate.toISOString());
        }

        const commentsResponse = await fetch(commentsUrl.toString(), {
          method: "GET",
          headers: {
            "Accept": "application/json",
          },
        });

        if (commentsResponse.ok) {
          const commentsData = await commentsResponse.json();
          
          if (commentsData.items && Array.isArray(commentsData.items)) {
            for (const item of commentsData.items) {
              const comment = item.snippet?.topLevelComment?.snippet;
              if (comment) {
                allComments.push({
                  id: item.id,
                  from: {
                    id: comment.authorChannelId?.value || comment.authorDisplayName || "",
                    username: comment.authorDisplayName || "",
                    name: comment.authorDisplayName,
                    profile_image_url: comment.authorProfileImageUrl,
                  },
                  text: comment.textDisplay || comment.textOriginal || "",
                  timestamp: comment.publishedAt || new Date().toISOString(),
                  videoId: videoId,
                });
              }
            }
          }
        }

        // Rate limiting: small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error fetching comments for video ${videoId}:`, error);
        // Continue with next video
      }
    }

    return allComments;
  } catch (error: any) {
    console.error("Error fetching YouTube comments:", error);
    return [];
  }
}

/**
 * Save YouTube comment to Firestore
 */
export async function saveYouTubeComment(
  userId: string,
  comment: YouTubeComment,
  db: any
): Promise<void> {
  const commentDoc = {
    id: comment.id,
    platform: "YouTube" as const,
    type: "Comment" as const,
    user: {
      name: comment.from.name || comment.from.username || "Unknown",
      avatar: comment.from.profile_image_url || "",
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

