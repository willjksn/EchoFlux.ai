import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { mediaUrl, goal, tone, promptText } = req.body || {};

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    let imagePart: any = null;

    // If a media URL was given, download file and convert to base64 (server-side only)
    if (mediaUrl) {
      const mediaRes = await fetch(mediaUrl);
      if (!mediaRes.ok) {
        return res
          .status(400)
          .json({ error: "Failed to download media from mediaUrl" });
      }

      const mimeType = mediaRes.headers.get("content-type") || "image/jpeg";
      const arrayBuffer = await mediaRes.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");

      imagePart = {
        inlineData: {
          data: base64,
          mimeType,
        },
      };
    }

    const prompt = `
You are a world-class social media copywriter.

Generate 3–5 social media captions based on:
- Goal: ${goal || "engagement"}
- Tone: ${tone || "friendly"}
- Any additional user input: ${promptText || "none"}

If an image is provided, use the visual context heavily.

Return ONLY valid JSON in this exact format:
[
  {
    "caption": "string",
    "hashtags": ["#tag1", "#tag2", ...]
  }
]
`;

    const requestBody: any = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            ...(imagePart ? [imagePart] : []),
          ],
        },
      ],
    };

    const result = await model.generateContent(requestBody);
    const text = result.response.text().trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Fallback if Gemini returns plain text
      parsed = [
        {
          caption: text,
          hashtags: [],
        },
      ];
    }

    return res.status(200).json({ captions: parsed });
  } catch (err: any) {
    console.error("generateCaptions error:", err);
    return res.status(500).json({
      error: "Failed to generate captions",
      details: err?.message || String(err),
    });
  }
}

