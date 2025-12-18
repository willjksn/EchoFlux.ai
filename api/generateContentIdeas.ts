// api/generateContentIdeas.ts
// Generate AI-powered content ideas based on category (high engagement, niche, trending)
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.js";

/**
 * Fetch real-time trending data from public sources
 */
async function fetchRealTimeTrendingData(niche: string): Promise<string> {
  const trends: string[] = [];
  
  try {
    // 1. Try to get stored trending topics from Firestore (if scraping service is running)
    try {
      const { getAdminDb } = await import("./_firebaseAdmin.js");
      const db = getAdminDb();
      const today = new Date().toISOString().split("T")[0];
      
      // Get trending topics from last 24 hours
      const platforms = ['Instagram', 'TikTok', 'X', 'Twitter', 'YouTube'];
      for (const platform of platforms) {
        const docId = `${platform}_${today}`;
        const doc = await db.collection("trending_topics").doc(docId).get();
        if (doc.exists) {
          const data = doc.data();
          if (data?.trends && Array.isArray(data.trends)) {
            const platformTrends = data.trends
              .slice(0, 5) // Top 5 per platform
              .map((t: any) => `- ${platform}: ${t.topic}${t.description ? ` (${t.description})` : ''}`)
              .join('\n');
            if (platformTrends) {
              trends.push(`${platform} Trends:\n${platformTrends}`);
            }
          }
        }
      }
    } catch (firestoreError) {
      console.warn('Failed to fetch from Firestore:', firestoreError);
    }

    // 2. Try to fetch from public APIs/endpoints
    try {
      // Twitter/X trending (if API key available)
      if (process.env.TWITTER_BEARER_TOKEN) {
        const twitterTrends = await fetchTwitterTrending();
        if (twitterTrends.length > 0) {
          trends.push(`Twitter/X Trending:\n${twitterTrends.slice(0, 5).map(t => `- ${t}`).join('\n')}`);
        }
      }
    } catch (apiError) {
      console.warn('Failed to fetch from APIs:', apiError);
    }

    // 3. Try to fetch from public RSS feeds or news APIs
    try {
      // Google Trends API (if available) or public RSS feeds
      const publicTrends = await fetchPublicTrendingSources(niche);
      if (publicTrends.length > 0) {
        trends.push(`Public Trends:\n${publicTrends.slice(0, 5).map(t => `- ${t}`).join('\n')}`);
      }
    } catch (publicError) {
      console.warn('Failed to fetch from public sources:', publicError);
    }

  } catch (error) {
    console.error('Error fetching real-time trending data:', error);
  }

  return trends.length > 0 
    ? trends.join('\n\n') 
    : '';
}

/**
 * Fetch Twitter/X trending topics (requires API key)
 */
async function fetchTwitterTrending(): Promise<string[]> {
  if (!process.env.TWITTER_BEARER_TOKEN) {
    return [];
  }

  try {
    // Twitter API v2 trending topics endpoint
    // Note: Requires elevated access and WOEID (Where On Earth ID)
    // For US: WOEID = 1
    const response = await fetch('https://api.twitter.com/1.1/trends/place.json?id=1', {
      headers: {
        'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data[0]?.trends) {
        return data[0].trends
          .slice(0, 10)
          .map((trend: any) => trend.name)
          .filter((name: string) => !name.startsWith('#') || name.length < 50); // Filter out very long hashtags
      }
    }
  } catch (error) {
    console.warn('Twitter API error:', error);
  }

  return [];
}

/**
 * Fetch trending data from public sources (RSS, news APIs, etc.)
 */
async function fetchPublicTrendingSources(niche: string): Promise<string[]> {
  const trends: string[] = [];

  try {
    // Option 1: Google Trends RSS (public, no API key needed)
    // Note: This would require parsing RSS feeds or using a service
    
    // Reddit removed - no longer supported

    // Option 3: News API (if key available)
    if (process.env.NEWS_API_KEY) {
      try {
        const newsResponse = await fetch(
          `https://newsapi.org/v2/everything?q=${encodeURIComponent(niche)}&sortBy=popularity&pageSize=5&apiKey=${process.env.NEWS_API_KEY}`
        );
        
        if (newsResponse.ok) {
          const newsData = await newsResponse.json();
          if (newsData?.articles) {
            const newsTrends = newsData.articles
              .slice(0, 5)
              .map((article: any) => article.title)
              .filter(Boolean);
            trends.push(...newsTrends);
          }
        }
      } catch (newsError) {
        console.warn('News API error:', newsError);
      }
    }

  } catch (error) {
    console.warn('Public sources error:', error);
  }

  return trends;
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(200).json({
      success: false,
      error: "AI not configured",
      note: apiKeyCheck.error,
      ideas: [],
    });
    return;
  }

  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    res.status(200).json({
      success: false,
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication.",
      ideas: [],
    });
    return;
  }

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { niche, category, userType } = req.body || {};
  // category: 'high-engagement' | 'niche' | 'trending'

  if (!niche || !category) {
    res.status(400).json({ 
      success: false,
      error: "Missing required fields",
      note: "niche and category are required",
      ideas: []
    });
    return;
  }

  try {
    const getModelForTask = await getModelRouter();
    // Use 'caption' task type to get the same model as captions (gemini-2.0-flash-lite)
    const model = await getModelForTask('caption', user.uid);

    // Fetch real-time trending data for 'trending' category
    let trendingData = '';
    if (category === 'trending') {
      try {
        trendingData = await fetchRealTimeTrendingData(niche);
      } catch (error) {
        console.warn('Failed to fetch real-time trending data, using AI fallback:', error);
      }
    }

    const categoryPrompts = {
      'high-engagement': `Generate 5-8 high-engagement content ideas that are proven to drive likes, comments, and shares. Focus on formats and topics that typically get high engagement rates.`,
      'niche': `Generate 5-8 niche-specific content ideas tailored to ${niche}. These should be highly relevant and valuable to your specific audience.`,
      'trending': trendingData 
        ? `Generate 5-8 trending content ideas based on REAL-TIME trending data below. Use these actual trending topics, hashtags, and formats to create timely, relevant content ideas for ${niche}.\n\nREAL-TIME TRENDING DATA:\n${trendingData}\n\nCreate content ideas that capitalize on these current trends.`
        : `Generate 5-8 trending content ideas that capitalize on current trends, viral formats, and popular topics in ${niche}. Make them timely and relevant.`
    };

    const prompt = `
You are an expert social media content strategist.

${categoryPrompts[category as keyof typeof categoryPrompts] || categoryPrompts['high-engagement']}

User Context:
- Niche/Topic: ${niche}
- User Type: ${userType || 'Creator'}
- Category Focus: ${category}
${trendingData ? `- Real-Time Trends Available: Yes` : ''}

Return ONLY valid JSON array with this exact structure:
[
  {
    "title": "Short, catchy content idea title",
    "description": "Detailed description explaining the idea and why it works (2-3 sentences)",
    "format": "Post" | "Reel" | "Story",
    "platform": "Instagram" | "TikTok" | "X" | "LinkedIn" | "YouTube" | "Facebook" | "Threads",
    "engagementPotential": 1-10,
    "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"]
  }
]

Requirements:
- Generate 5-8 unique content ideas
- Mix different formats (Posts, Reels, Stories)
- Include ideas for different platforms
- engagementPotential: 1-10 scale (10 = highest potential)
- Include 2-3 relevant hashtags per idea
- Make titles catchy and actionable
- Descriptions should explain why the idea works and how to execute it
`;

    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const raw = response.response.text().trim();
    let ideas: any[];

    try {
      ideas = JSON.parse(raw);
    } catch (parseError) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/) || raw.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          ideas = JSON.parse(jsonMatch[1].trim());
        } catch {
          console.error("Failed to parse extracted JSON");
          res.status(200).json({
            success: false,
            error: "Failed to parse AI response",
            note: "The AI model returned an invalid JSON response. Please try again.",
            ideas: [],
          });
          return;
        }
      } else {
        console.error("Failed to parse JSON response. Raw output:", raw.substring(0, 200));
        res.status(200).json({
          success: false,
          error: "Failed to parse AI response",
          note: "The AI model returned an invalid JSON response. Please try again.",
          ideas: [],
        });
        return;
      }
    }

    // Ensure it's an array
    if (!Array.isArray(ideas)) {
      ideas = [];
    }

    // Validate and transform ideas
    const validatedIdeas = ideas.map((idea: any, index: number) => ({
      id: `idea-${Date.now()}-${index}`,
      title: idea.title || `Content Idea ${index + 1}`,
      description: idea.description || "A great content idea for your niche",
      format: idea.format || "Post",
      platform: idea.platform || "Instagram",
      engagementPotential: idea.engagementPotential || 5,
      hashtags: Array.isArray(idea.hashtags) ? idea.hashtags : [],
      category: category
    }));

    res.status(200).json({
      success: true,
      ideas: validatedIdeas,
    });
    return;
  } catch (error: any) {
    console.error("generateContentIdeas error:", error);
    res.status(200).json({
      success: false,
      error: "Failed to generate content ideas",
      note: error?.message || "AI generation failed. Please try again.",
      ideas: [],
    });
    return;
  }
}

export default withErrorHandling(handler);

