import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getModelForTask } from "./_modelRouter.js";
import { enforceRateLimit } from "./_rateLimit.js";

// Import OpenAI with ESM syntax
import OpenAI from "openai";
import Replicate from "replicate";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Rate limiting: 5 requests per minute per user (image generation is expensive)
  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "generateImage",
    limit: 5,
    windowMs: 60_000,
    identifier: user.uid,
  });
  if (!ok) return;

  const { prompt, baseImage, allowExplicit = false } = (req.body as any) || {};

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'prompt'" });
  }

  try {
    // If explicit content is requested, use Replicate NSFW models instead of OpenAI
    if (allowExplicit) {
      const replicateApiToken = process.env.REPLICATE_API_TOKEN;
      
      if (!replicateApiToken) {
        return res.status(200).json({
          imageData: null,
          prompt: prompt,
          error: "Replicate API not configured",
          note: "REPLICATE_API_TOKEN environment variable is required for explicit content generation.",
        });
      }

      const replicate = new Replicate({ auth: replicateApiToken });
      
      // Use NSFW-capable models from Replicate
      // Option 1: Whiskii Gen (NSFW-Uncensored Stable Diffusion XL) - "alicewuv/whiskii-gen"
      // Option 2: FluxedUp NSFW v3 (Flux model) - "aisha-ai-official/flux.1dev-uncensored-fluxedup-nsfw-v3"
      const model = "alicewuv/whiskii-gen"; // NSFW-Uncensored Stable Diffusion XL
      
      // Enhance prompt for NSFW content
      let enhancedPrompt = prompt;
      try {
        const geminiModel = await getModelForTask('image-prompt', user.uid);
        const systemPrompt = `
You help generate detailed, high-quality prompts for explicit/adult image generation.
Given a user's idea or prompt, expand it into a rich, specific, and visually descriptive prompt.
Include details about:
- Style and mood (photorealistic, hyper-realistic, detailed)
- Composition and framing
- Lighting and colors
- Subject details and characteristics
- Quality and aesthetics (8k, ultra-detailed, sharp focus, professional photography)

Keep it concise but descriptive. Return ONLY the enhanced prompt, nothing else.
`;
        const result = await geminiModel.generateContent({
          contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nUser prompt: ${prompt}` }] }],
        });
        enhancedPrompt = result.response.text().trim().replace(/^(prompt|enhanced prompt|suggested prompt):\s*/i, '').trim();
      } catch (promptError) {
        console.warn("Failed to enhance prompt, using original:", promptError);
      }

      const input: any = {
        prompt: enhancedPrompt,
        num_outputs: 1,
        guidance_scale: 7.5,
        num_inference_steps: 50,
        width: 1024,
        height: 1024,
      };

      // If base image provided, use image-to-image
      if (baseImage && baseImage.data) {
        // Check image size to avoid 413 errors
        if (baseImage.data.length > 2000000) { // ~1.5MB base64 = ~1MB binary
          return res.status(200).json({
            imageData: null,
            prompt: enhancedPrompt,
            error: "Image too large",
            note: "Please compress or resize your image to under 1MB before uploading. Large images cause payload size errors.",
          });
        }
        
        const imageDataUrl = `data:${baseImage.mimeType || 'image/png'};base64,${baseImage.data}`;
        input.image = imageDataUrl;
        input.strength = 0.8; // How much to modify the image (0-1)
      }

      const output = await replicate.run(model, { input });
      
      // Replicate returns an array of URLs or base64 strings
      const imageUrl = Array.isArray(output) ? output[0] : output;
      
      // If it's a URL, fetch and convert to base64
      if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
        const imageResponse = await fetch(imageUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        
        return res.status(200).json({
          imageData: base64Image,
          prompt: enhancedPrompt,
          model: model,
          source: "replicate",
        });
      } else if (typeof imageUrl === 'string') {
        // Already base64
        return res.status(200).json({
          imageData: imageUrl,
          prompt: enhancedPrompt,
          model: model,
          source: "replicate",
        });
      }

      return res.status(200).json({
        imageData: null,
        prompt: enhancedPrompt,
        error: "Unexpected output format",
        note: "The model returned an unexpected format. Please try again.",
      });
    }

    // Step 1: Check if OpenAI is available (for non-explicit content)
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
      // If baseImage is provided, this is image-to-image editing - emphasize photorealistic preservation
      const isImageEditing = !!baseImage;
      const systemPrompt = isImageEditing ? `
You help generate detailed, high-quality prompts for photorealistic image editing.
The user is editing a real photo. Your prompt should:
- Preserve photorealistic quality and natural appearance
- Maintain realistic lighting, skin texture, and details
- Keep the subject's natural features and proportions
- Use terms like "photorealistic", "hyper-realistic", "professional photography", "natural lighting", "detailed skin texture"
- Avoid artistic styles unless specifically requested
- Focus on realistic, natural-looking results

Return ONLY the enhanced prompt, nothing else.
` : `
You help generate detailed, high-quality prompts for image generation models.
Given a user's idea or prompt, expand it into a rich, specific, and visually descriptive prompt that will produce excellent results.
For photorealistic images, include terms like "hyper-realistic", "photorealistic", "professional photography", "8k resolution", "detailed", "sharp focus".
Include details about:
- Style and mood (photorealistic, hyper-realistic for real-looking images)
- Composition and framing
- Lighting and colors (natural lighting for photorealistic)
- Subject details
- Quality and aesthetics (8k, ultra-detailed, sharp focus)

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
    // Use "hd" quality for photorealistic images, especially when editing real photos
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: enhancedPrompt,
      n: 1,
      size: size as "1024x1024" | "1792x1024" | "1024x1792",
      quality: "hd", // HD quality for photorealistic results, especially important for real photo editing
      response_format: "b64_json", // Get base64 directly
    });

    const imageData = imageResponse.data?.[0]?.b64_json;

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
