// api/generateCaptions.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.ts";

async function getGeminiShared() {
  try {
    const module = await import("./_geminiShared.ts");
    return { getModel: module.getModel, parseJSON: module.parseJSON };
  } catch (importError: any) {
    console.error("Failed to import _geminiShared:", importError);
    throw new Error(`Failed to load Gemini module: ${importError?.message || String(importError)}`);
  }
}

type MediaData = {
  data: string;
  mimeType: string;
};

type CaptionResult = {
  caption: string;
  hashtags: string[];
};

// Simple sleep helper
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exponential backoff wrapper around generateContent
async function generateWithRetry(
  model: ReturnType<typeof getModel>,
  request: Parameters<ReturnType<typeof getModel>["generateContent"]>[0],
  maxRetries = 3,
  baseDelayMs = 2000
) {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await model.generateContent(request);
    } catch (err: any) {
      lastError = err;
      const status = err?.status;
      const message: string = err?.message || "";

      const is429 =
        status === 429 ||
        message.includes("429") ||
        message.toLowerCase().includes("too many requests");

      // If it's not a rate-limit error OR we've exhausted retries, rethrow
      if (!is429 || attempt === maxRetries) {
        throw err;
      }

      // Try to respect "retry in Xs" from the error message if present
      let delayMs = baseDelayMs * Math.pow(2, attempt); // 2s, 4s, 8s...
      const retryMatch = /retry in ([0-9.]+)s/i.exec(message);
      if (retryMatch && !Number.isNaN(Number(retryMatch[1]))) {
        delayMs = Number(retryMatch[1]) * 1000;
      }

      console.warn(
        `Gemini 429 rate-limit on attempt ${attempt + 1}/${maxRetries + 1}. Retrying in ${
          delayMs / 1000
        }s...`
      );
      await sleep(delayMs);
    }
  }

  // Should be unreachable, but TS likes a return/throw here
  throw lastError;
}

// Helper: load external media from URL into inlineData
async function fetchMediaFromUrl(mediaUrl: string): Promise<MediaData | null> {
  try {
    const mediaRes = await fetch(mediaUrl);
    if (!mediaRes.ok) {
      console.error(
        "Failed to fetch media from URL:",
        mediaUrl,
        mediaRes.status
      );
      return null;
    }

    const mimeType = mediaRes.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await mediaRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return { data: base64, mimeType };
  } catch (err) {
    console.error("Error downloading media from URL:", err);
    return null;
  }
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check API keys early
  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    return res.status(200).json([
      {
        caption: apiKeyCheck.error || "AI captioning is not available because the AI API key is not configured.",
        hashtags: [] as string[],
      },
    ]);
  }

  // Dynamic import for auth
  let authUser;
  try {
    const verifyAuth = await getVerifyAuth();
    authUser = await verifyAuth(req);
  } catch (authError: any) {
    console.error("verifyAuth error:", authError);
    return res.status(200).json([
      {
        caption: authError?.message || "Authentication failed. Please try logging in again.",
        hashtags: [] as string[],
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
  } = (req.body as any) || {};

  // Use model router - captions use cheapest model for cost optimization
  let model: any;
  try {
    const getModelForTask = await getModelRouter();
    model = await getModelForTask("caption", authUser.uid);
  } catch (modelErr: any) {
    console.error("generateCaptions: model initialization error:", modelErr);
    return res.status(200).json([
      {
        caption: modelErr?.message || "Sorry, I couldn't initialize the AI model to generate captions. Please check your AI configuration.",
        hashtags: [] as string[],
      },
    ]);
  }

    // Build prompt
    const prompt = `
You are a world-class social media copywriter.

Generate 3–5 social media captions based on:
- Goal: ${goal || "engagement"}
- Tone: ${tone || "friendly"}
- Any additional user input: ${promptText || "none"}

If an image or video is provided, use the visual context heavily.

Return ONLY valid JSON in this shape:

[
  {
    "caption": "string",
    "hashtags": ["#tag1", "#tag2"]
  }
]
`.trim();

    // Build parts array
    const parts: any[] = [{ text: prompt }];

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

    // Call Gemini with retry on rate limits
    let rawText: string;
    try {
      const result = await generateWithRetry(model, {
        contents: [
          {
            role: "user",
            parts,
          },
        ],
        // Ask Gemini to respond as JSON directly
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      if (!result?.response || typeof result.response.text !== "function") {
        console.error(
          "generateCaptions: Unexpected Gemini response shape",
          result
        );
        // Fallback to safe message
        return res.status(200).json([
          {
            caption:
              "Sorry, I couldn't generate captions from the AI response. Please try again.",
            hashtags: [] as string[],
          },
        ]);
      }

      rawText = result.response.text().trim();
    } catch (aiErr: any) {
      console.error("generateCaptions AI error:", aiErr);
      return res.status(200).json([
        {
          caption:
            aiErr?.message ||
            "Sorry, I couldn't generate captions at this time. Please try again.",
          hashtags: [] as string[],
        },
      ]);
    }

    let parsed: any;
    try {
      const { parseJSON: parseJSONFn } = await getGeminiShared();
      parsed = parseJSONFn(rawText);
    } catch (err) {
      console.warn(
        "JSON parse failed in generateCaptions, using text fallback:",
        err
      );
      parsed = [
        {
          caption: rawText,
          hashtags: [] as string[],
        },
      ];
    }

    let captions: CaptionResult[];

    if (Array.isArray(parsed)) {
      captions = parsed as CaptionResult[];
    } else if (Array.isArray(parsed?.captions)) {
      captions = parsed.captions as CaptionResult[];
    } else {
      captions = [
        {
          caption: String(rawText || "No caption generated."),
          hashtags: [],
        },
      ];
    }

  // ✅ IMPORTANT: return a bare array so frontend can do results[0].caption
  return res.status(200).json(captions);
}

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  try {
    return await handler(req, res);
  } catch (err: any) {
    console.error("generateCaptions error:", err);
    if (res.headersSent) {
      return;
    }
    return res.status(200).json([
      {
        caption: err?.message || "Sorry, I couldn't generate captions at this time. Please try again.",
        hashtags: [] as string[],
      },
    ]);
  }
});
