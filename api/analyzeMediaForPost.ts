import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  checkApiKeys,
  getVerifyAuth,
  getModelRouter,
  withErrorHandling,
} from "./_errorHandler.js";

async function getGeminiShared() {
  try {
    const module = await import("./_geminiShared.js");
    return { getModel: module.getModel, parseJSON: module.parseJSON };
  } catch (importError: any) {
    console.error("Failed to import _geminiShared:", importError);
    throw new Error(
      `Failed to load Gemini module: ${importError?.message || String(importError)}`
    );
  }
}

type MediaData = { data: string; mimeType: string };

async function fetchMediaFromUrl(mediaUrl: string): Promise<MediaData | null> {
  try {
    const mediaRes = await fetch(mediaUrl);
    if (!mediaRes.ok) {
      console.error("Failed to fetch media:", mediaUrl, mediaRes.status);
      return null;
    }
    const mimeType = mediaRes.headers.get("content-type") || "image/jpeg";
    const arr = await mediaRes.arrayBuffer();
    return { data: Buffer.from(arr).toString("base64"), mimeType };
  } catch (error) {
    console.error("Error fetching media:", error);
    return null;
  }
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(200).json({
      caption: apiKeyCheck.error || "AI analysis not available (missing AI API key).",
      hashtags: [],
      goal: "engagement",
      tone: "friendly",
      platforms: [],
    });
    return;
  }

  let authUser;
  try {
    const verifyAuth = await getVerifyAuth();
    authUser = await verifyAuth(req);
  } catch (authError: any) {
    console.error("Auth error:", authError);
    res.status(200).json({
      caption: authError?.message || "Authentication failed.",
      hashtags: [],
      goal: "engagement",
      tone: "friendly",
      platforms: [],
    });
    return;
  }

  if (!authUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const {
    mediaUrl,
    mediaData,
    goal,
    tone,
  }: {
    mediaUrl?: string;
    mediaData?: MediaData;
    goal?: string;
    tone?: string;
  } = req.body || {};

  let model;
  try {
    const getModelForTask = await getModelRouter();
    model = await getModelForTask("caption", authUser.uid);
  } catch (err: any) {
    console.error("Model init error:", err);
    res.status(200).json({
      caption: err?.message || "AI model failed to initialize.",
      hashtags: [],
      goal: "engagement",
      tone: "friendly",
      platforms: [],
    });
    return;
  }

  let finalMedia: MediaData | undefined;
  if (mediaUrl) {
    const fetched = await fetchMediaFromUrl(mediaUrl);
    if (fetched) finalMedia = fetched;
  } else if (mediaData?.data && mediaData?.mimeType) {
    const dataSizeMB = (mediaData.data.length * 3) / 4 / 1024 / 1024;
    const isVideoFile = mediaData.mimeType.startsWith('video/');
    const maxSizeMB = isVideoFile ? 20 : 4;
    
    if (dataSizeMB > maxSizeMB) {
      res.status(413).json({
        error: isVideoFile ? "Video too large" : "Image too large",
        note: `Please upload ${isVideoFile ? 'videos' : 'images'} smaller than ${maxSizeMB}MB or use a URL instead.`,
      });
      return;
    }
    finalMedia = mediaData;
  }

  if (!finalMedia) {
    res.status(400).json({ error: "No media provided" });
    return;
  }

  const isVideo = finalMedia.mimeType.startsWith('video/');

  const prompt = `
You are an expert social media content strategist. Analyze this ${isVideo ? 'video' : 'image'} and generate a complete post strategy.

${isVideo ? `
IMPORTANT: You are analyzing a VIDEO file. Watch the entire video and analyze:
- The complete narrative/story being told
- Key scenes and transitions throughout the video
- Actions, movements, and visual elements across all frames
- The overall mood, pacing, and visual style
- Any text, graphics, or on-screen elements
- The beginning, middle, and end of the video
- What happens throughout the entire video duration
` : `
Analyze the image:
- Describe what you see, the mood, colors, composition, and key elements
- Identify objects, people, activities, settings
- Determine the overall theme and message
`}

Based on your analysis, generate:
1. A compelling caption (${goal || 'engagement'} goal, ${tone || 'friendly'} tone)
2. Relevant hashtags (5-10 hashtags)
3. Recommended platforms (top 2-3 platforms where this content would perform best)
4. Suggested post goal if not provided (engagement, sales, awareness, followers)
5. Suggested tone if not provided (friendly, professional, witty, inspirational)

Return ONLY strict JSON in this format:
{
  "caption": "Engaging caption text here...",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"],
  "platforms": ["Instagram", "TikTok"],
  "goal": "engagement",
  "tone": "friendly"
}
`.trim();

  const parts: any[] = [{ text: prompt }];
  parts.push({
    inlineData: {
      data: finalMedia.data,
      mimeType: finalMedia.mimeType,
    },
  });

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json" },
    });

    if (!result?.response || typeof result.response.text !== "function") {
      throw new Error("Invalid AI response");
    }

    const rawText = result.response.text().trim();
    const { parseJSON } = await getGeminiShared();
    const parsed = parseJSON(rawText);

    res.status(200).json({
      caption: parsed.caption || "Generated caption",
      hashtags: parsed.hashtags || [],
      platforms: parsed.platforms || ["Instagram"],
      goal: parsed.goal || goal || "engagement",
      tone: parsed.tone || tone || "friendly",
    });
  } catch (error: any) {
    console.error("AI analysis error:", error);
    res.status(200).json({
      caption: error?.message || "AI analysis failed. Please try again.",
      hashtags: [],
      platforms: ["Instagram"],
      goal: goal || "engagement",
      tone: tone || "friendly",
    });
  }
}

export default withErrorHandling(handler);

