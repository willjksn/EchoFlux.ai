import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getModelForTask } from "./_modelRouter.js";

// Import OpenAI with ESM syntax
import OpenAI from "openai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { prompt, baseImage } = (req.body as any) || {};

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'prompt'" });
  }

  try {
    // Step 1: Check if OpenAI is available
    const openaiApiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiApiKey || !OpenAI) {
      // If OpenAI not configured, try to enhance prompt with Gemini and return that
      let enhancedPrompt = prompt;
      try {
        const model = await getModelForTask('image-prompt', user.uid);
        const systemPrompt = `
You help generate detailed, high-quality prompts for image generation models.
Given a user's idea or prompt, expand it into a rich, specific, and visually descriptive prompt that will produce excellent results.
Keep it concise but descriptive. Return ONLY the enhanced prompt, nothing else.
`;
        const result = await model.generateContent({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\n\nUser prompt: ${prompt}` }],
            },
          ],
        });
        enhancedPrompt = result.response.text().trim().replace(/^(prompt|enhanced prompt|suggested prompt):\s*/i, '').trim();
      } catch (promptError) {
        // Use original prompt if enhancement fails
      }

      return res.status(200).json({
        imageData: null,
        prompt: enhancedPrompt,
        note: "OpenAI API key not configured. Please add OPENAI_API_KEY environment variable to enable image generation.",
      });
    }

    // Step 2: Use Gemini to enhance/expand the prompt for better image generation
    let enhancedPrompt = prompt;
    try {
      const model = await getModelForTask('image-prompt', user.uid);
      const systemPrompt = `
You help generate detailed, high-quality prompts for image generation models.
Given a user's idea or prompt, expand it into a rich, specific, and visually descriptive prompt that will produce excellent results.
Include details about:
- Style and mood
- Composition and framing
- Lighting and colors
- Subject details
- Quality and aesthetics

Keep it concise but descriptive. Return ONLY the enhanced prompt, nothing else.
`;
      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\nUser prompt: ${prompt}` }],
          },
        ],
      });
      enhancedPrompt = result.response.text().trim();
      // Clean up any extra text the model might add
      enhancedPrompt = enhancedPrompt.replace(/^(prompt|enhanced prompt|suggested prompt):\s*/i, '').trim();
    } catch (promptError) {
      console.warn("Failed to enhance prompt with Gemini, using original:", promptError);
      // Continue with original prompt if enhancement fails
    }

    // Step 3: Generate actual image using OpenAI DALL-E 3
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Determine size based on baseImage presence (for image-to-image) or default
    const size = baseImage ? "1024x1024" : "1024x1024"; // DALL-E 3 supports: "1024x1024", "1792x1024", "1024x1792"

    // Generate image with DALL-E 3
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: enhancedPrompt,
      n: 1,
      size: size as "1024x1024" | "1792x1024" | "1024x1792",
      quality: "standard", // or "hd" for higher quality (costs more)
      response_format: "b64_json", // Get base64 directly
    });

    const imageData = imageResponse.data[0]?.b64_json;

    if (!imageData) {
      return res.status(200).json({
        imageData: null,
        prompt: enhancedPrompt,
        error: "No image data returned from OpenAI",
        note: "The image generation completed but no image was returned. Please try again.",
      });
    }

    // Return base64 image data
    return res.status(200).json({
      imageData: imageData,
      prompt: enhancedPrompt,
      model: "dall-e-3",
      size: size,
    });
  } catch (err: any) {
    console.error("generateImage error:", err);
    
    // Handle OpenAI API errors specifically (if OpenAI is available)
    if (OpenAI && err instanceof OpenAI.APIError) {
      return res.status(200).json({
        imageData: null,
        prompt: prompt,
        error: "Image generation failed",
        note: err.message || "OpenAI API error. Please check your API key and try again.",
        code: err.code,
      });
    }

    // Return graceful error instead of 500
    return res.status(200).json({
      imageData: null,
      prompt: prompt,
      error: "Failed to generate image",
      note: err?.message || "An unexpected error occurred. Please try again.",
    });
  }
}
