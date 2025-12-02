// api/saveGeneratedContent.ts
// Save generated content (captions, images, videos, ads) to Firestore

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

interface SaveContentRequest {
  type: "caption" | "image" | "video" | "ad";
  content: {
    // For captions
    caption?: string;
    hashtags?: string[];
    
    // For images
    imageData?: string; // base64
    imageUrl?: string;
    
    // For videos
    videoUrl?: string;
    videoPrompt?: string;
    
    // For ads
    adType?: "text" | "video";
    adCopy?: string;
    videoPrompt?: string;
    headline?: string;
    description?: string;
    callToAction?: string;
    hashtags?: string[];
    platformRecommendations?: string[];
    sceneBreakdown?: Array<{ time: string; description: string }>;
    
    // Metadata
    prompt?: string;
    goal?: string;
    tone?: string;
    platform?: string;
    product?: string;
    service?: string;
    targetAudience?: string;
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await verifyAuth(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { type, content }: SaveContentRequest = req.body || {};

    if (!type || !content) {
      return res.status(400).json({ error: "Missing type or content" });
    }

    if (!["caption", "image", "video", "ad"].includes(type)) {
      return res.status(400).json({ error: "Invalid type. Must be 'caption', 'image', 'video', or 'ad'" });
    }

    let db;
    try {
      db = getAdminDb();
    } catch (dbError: any) {
      console.error("Firebase Admin error:", dbError);
      return res.status(200).json({
        success: false,
        error: "Database error",
        note: "Unable to save content. Please check your configuration.",
      });
    }

    const contentId = `content-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    // Prepare content document
    const contentDoc: any = {
      id: contentId,
      type,
      createdAt: timestamp,
      updatedAt: timestamp,
      userId: user.uid,
      ...content,
    };

    // Save to Firestore
    try {
      await db
        .collection("users")
        .doc(user.uid)
        .collection("generatedContent")
        .doc(contentId)
        .set(contentDoc);

      return res.status(200).json({
        success: true,
        contentId,
        message: "Content saved successfully",
      });
    } catch (saveError: any) {
      console.error("Error saving content:", saveError);
      return res.status(200).json({
        success: false,
        error: "Failed to save content",
        note: saveError?.message || "An error occurred while saving.",
      });
    }
  } catch (err: any) {
    console.error("saveGeneratedContent error:", err);
    return res.status(200).json({
      success: false,
      error: "Failed to save content",
      note: err?.message || "An unexpected error occurred.",
    });
  }
}

