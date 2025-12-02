// api/generateCaptions.ts
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
type CaptionResult = { caption: string; hashtags: string[] };

// Sleep helper
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry wrapper for Gemini API
async function generateWithRetry(model: any, request: any, maxRetries = 3) {
  let lastError;
  const baseDelayMs = 2000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await model.generateContent(request);
    } catch (err: any) {
      const status = err?.status;
      const msg = err?.message?.toLowerCase() || "";

      const is429 =
        status === 429 ||
        msg.includes("too many requests") ||
        msg.includes("429");

      if (!is429 || attempt === maxRetries) {
        throw err;
      }

      // Exponential backoff
      let delayMs = baseDelayMs * Math.pow(2, attempt);

      // Adjust delay if Gemini suggests "retry in Xs"
      const retryMatch = /retry in ([0-9.]+)s/i.exec(err?.message || "");
      if (retryMatch && !isNaN(Number(retryMatch[1]))) {
        delayMs = Number(retryMatch[1]) * 1000;
      }

      console.warn(
        `Gemini rate-limited (429). Attempt ${attempt + 1}/${maxRetries + 1}. Retrying in ${
          delayMs / 1000
        }s...`
      );

      await sleep(delayMs);
      lastError = err;
    }
  }

  throw lastError;
}

// Convert external image/video URL → inlineData
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

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check API key
  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    return res.status(200).json([
      {
        caption:
          apiKeyCheck.error ||
          "AI captioning not available (missing AI API key).",
        hashtags: [],
      },
    ]);
  }

  // Verify Firebase Auth Token
  let authUser;
  try {
    const verifyAuth = await getVerifyAuth();
    authUser = await verifyAuth(req);
  } catch (authError: any) {
    console.error("Auth error:", authError);
    return res.status(200).json([
      {
        caption: authError?.message || "Authentication failed.",
        hashtags: [],
      },
    ]);
  }

  if (!authUser) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const {
    mediaUrl,
    mediaData,
    goal,
    tone,
    promptText,
  }: {
    mediaUrl?: string;
    mediaData?: MediaData;
    goal?: string;
    tone?: string;
    promptText?: string;
  } = req.body || {};

  // Model selection
  let model;
  try {
    const getModelForTask = await getModelRouter();
    model = await getModelForTask("caption", authUser.uid);
  } catch (err: any) {
    console.error("Model init error:", err);
    return res.status(200).json([
      {
        caption:
          err?.message || "AI model failed to initialize. Check configuration.",
        hashtags: [],
      },
    ]);
  }

  // Build prompt
  const prompt = `
You are a world-class social media copywriter.

Generate 3–5 captions based on:
- Goal: ${goal || "engagement"}
- Tone: ${tone || "friendly"}
- Extra instructions: ${promptText || "none"}

If an image/video is provided, use its visual context.

Return ONLY strict JSON like:

[
  {
    "caption": "text",
    "hashtags": ["#one", "#two"]
  }
]
`.trim();

  const parts: any[] = [{ text: prompt }];

  // Attach image/video if provided
  let finalMedia: MediaData | undefined;

  if (mediaData?.data && mediaData?.mimeType) {
    finalMedia = mediaData;
  } else if (mediaUrl) {
    const fetched = await fetchMediaFromUrl(mediaUrl);
    if (fetched) finalMedia = fetched;
  }

  if (finalMedia) {
    parts.push({
      inlineData: {
        data: finalMedia.data,
        mimeType: finalMedia.mimeType,
      },
    });
  }

  // Generate captions via Gemini
  let rawText: string;

  try {
    const result = await generateWithRetry(model, {
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json" },
    });

    if (!result?.response || typeof result.response.text !== "function") {
      console.error("Bad Gemini response:", result);
      return res.status(200).json([
        {
          caption: "AI returned malformed response. Try again.",
          hashtags: [],
        },
      ]);
    }

    rawText = result.response.text().trim();
  } catch (err: any) {
    console.error("AI error:", err);
    return res.status(200).json([
      {
        caption: err?.message || "AI generation failed.",
        hashtags: [],
      },
    ]);
  }

  // Parse JSON response
  let parsed: any;
  try {
    const { parseJSON } = await getGeminiShared();
    parsed = parseJSON(rawText);
  } catch (err) {
    console.warn("JSON parse failed:", err);
    parsed = [{ caption: rawText, hashtags: [] }];
  }

  let captions: CaptionResult[];

  if (Array.isArray(parsed)) {
    captions = parsed;
  } else if (Array.isArray(parsed?.captions)) {
    captions = parsed.captions;
  } else {
    captions = [{ caption: rawText, hashtags: [] }];
  }

  return res.status(200).json(captions);
}

export default withErrorHandling(handler);
