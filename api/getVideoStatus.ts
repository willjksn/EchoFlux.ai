// api/getVideoStatus.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.ts";
import Replicate from "replicate";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { operation } = (req.body as any) || req.query || {};
  const operationId = operation?.operationId || operation || req.query?.operationId;

  if (!operationId || typeof operationId !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'operationId'" });
  }

  try {
    const replicateApiToken = process.env.REPLICATE_API_TOKEN;

    if (!replicateApiToken) {
      return res.status(200).json({
        success: false,
        error: "Replicate API not configured",
        note: "REPLICATE_API_TOKEN environment variable is missing.",
      });
    }

    const replicate = new Replicate({ auth: replicateApiToken });

    // Get prediction status from Replicate
    const prediction = await replicate.predictions.get(operationId);

    // Return status and video URL if completed
    const response: any = {
      success: true,
      operationId: prediction.id,
      status: prediction.status,
    };

    if (prediction.status === "succeeded" && prediction.output) {
      // Replicate returns video URL(s) in output
      if (Array.isArray(prediction.output)) {
        response.videoUrl = prediction.output[0]; // First video URL
      } else if (typeof prediction.output === "string") {
        response.videoUrl = prediction.output;
      } else if (prediction.output.url) {
        response.videoUrl = prediction.output.url;
      }
    } else if (prediction.status === "failed") {
      response.success = false;
      response.error = prediction.error || "Video generation failed";
    }

    return res.status(200).json(response);
  } catch (err: any) {
    console.error("getVideoStatus error:", err);

    // Return 200 with error details instead of 500 to prevent UI breakage
    return res.status(200).json({
      success: false,
      error: "Failed to get video status",
      note: err?.message || String(err) || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
  }
}

