// api/generateVideo.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { sanitizeForAI } from "./_inputSanitizer.js";
import Replicate from "replicate";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Rate limiting: 3 requests per minute per user (video generation is very expensive)
  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "generateVideo",
    limit: 3,
    windowMs: 60_000,
    identifier: user.uid,
  });
  if (!ok) return;

  const { prompt, baseImage, aspectRatio = "9:16", allowExplicit = false } = (req.body as any) || {};

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'prompt'" });
  }

  // Sanitize prompt input
  const sanitizedPrompt = sanitizeForAI(prompt, 2000);
  if (!sanitizedPrompt) {
    return res.status(400).json({ error: "Prompt cannot be empty" });
  }

  try {
    const replicateApiToken = process.env.REPLICATE_API_TOKEN;

    if (!replicateApiToken) {
      return res.status(200).json({
        success: false,
        error: "Replicate API not configured",
        note: "REPLICATE_API_TOKEN environment variable is missing. Please configure it to enable video generation.",
      });
    }

    const replicate = new Replicate({ auth: replicateApiToken });

    // Model selection based on explicit content flag
    // Note: Most video generation models on Replicate have content filters and don't support explicit content
    // For explicit video content, you may need to:
    // 1. Use specialized NSFW video generation services (not available on Replicate)
    // 2. Self-host uncensored video models
    // 3. Use image-to-video with NSFW images (which we support via image generation)
    // For now, we use Stable Video Diffusion which may be less restrictive but still has filters
    const model = "stability-ai/stable-video-diffusion";
    
    // Prepare input based on the model being used
    // Stable Video Diffusion requires an input image (image-to-video)
    // If no base image provided, we'll need to generate one first or use a different model
    const input: any = {};
    
    if (baseImage && baseImage.data) {
      // Compress/resize base image to avoid 413 payload errors
      // Replicate has size limits, so we'll resize large images
      let imageData = baseImage.data;
      
      // If image is too large (>1MB base64), we need to compress it
      // Note: For serverless functions, we'll limit the size and let the client handle compression
      // If the image is too large, return an error asking user to compress it first
      if (imageData.length > 2000000) { // ~1.5MB base64 = ~1MB binary
        return res.status(200).json({
          success: false,
          error: "Image too large",
          note: "Please compress or resize your image to under 1MB before uploading. Large images cause payload size errors.",
        });
      }
      
      // Convert base64 to data URL for Replicate
      const imageDataUrl = `data:${baseImage.mimeType || 'image/png'};base64,${imageData}`;
      input.image = imageDataUrl;
      
      // Stable Video Diffusion parameters
      input.motion_bucket_id = 127; // Motion intensity (1-255, higher = more movement)
      input.cond_aug = 0.02; // Conditional augmentation (0-1)
      input.decoding_t = 14; // Decoding timesteps (1-14, higher = better quality but slower)
      input.num_frames = 25; // Number of frames (14-25)
      
      // Map aspect ratio to width/height for stable-video-diffusion
      // The model expects specific dimensions, but we can use aspect ratio hints
      if (aspectRatio === "9:16") {
        input.width = 576;
        input.height = 1024;
      } else if (aspectRatio === "16:9") {
        input.width = 1024;
        input.height = 576;
      } else if (aspectRatio === "1:1") {
        input.width = 1024;
        input.height = 1024;
      } else {
        // Default to 9:16 for social media
        input.width = 576;
        input.height = 1024;
      }
    } else {
      // If no base image, we can't use stable-video-diffusion
      // Return error suggesting user upload an image
      return res.status(200).json({
        success: false,
        error: "Image required",
        note: "Stable Video Diffusion requires an input image. Please upload an image to generate a video from it.",
      });
    }

    // Start video generation (this is async)
    const prediction = await replicate.predictions.create({
      model: model,
      input: input,
    });

    // Return prediction ID so frontend can poll for status
    return res.status(200).json({
      success: true,
      operationId: prediction.id,
      status: prediction.status,
      videoUrl: null, // Will be available when status is "succeeded"
      message: "Video generation started. Use the operationId to check status.",
    });
  } catch (err: any) {
    console.error("generateVideo error:", err);
    
    // Return 200 with error details instead of 500 to prevent UI breakage
    return res.status(200).json({
      success: false,
      error: "Video generation failed",
      note: err?.message || String(err) || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
  }
}

