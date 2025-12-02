// api/generateVideo.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import Replicate from "replicate";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { prompt, baseImage, aspectRatio = "9:16" } = (req.body as any) || {};

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'prompt'" });
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

    // Use Runway Gen-2 for video generation (high quality, good for social media)
    // Alternative models: "pika-labs/pika", "stability-ai/stable-video-diffusion"
    const model = "runway/gen2";
    
    // Prepare input based on whether we have a base image
    const input: any = {
      prompt: prompt,
      aspect_ratio: aspectRatio, // "16:9", "9:16", "1:1", "21:9", etc.
      duration: 5, // 5 seconds for social media
      watermark: false,
    };

    // If base image provided, use image-to-video
    if (baseImage && baseImage.data) {
      // Convert base64 to data URL for Replicate
      const imageDataUrl = `data:${baseImage.mimeType || 'image/png'};base64,${baseImage.data}`;
      input.image = imageDataUrl;
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

