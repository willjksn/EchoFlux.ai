// api/getGeneratedContent.ts
// Fetch generated content (captions, images, videos, ads) from Firestore

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    let user;
    try {
      user = await verifyAuth(req);
    } catch (authError: any) {
      console.error("verifyAuth error:", authError);
      return res.status(200).json({
        success: false,
        content: [],
        error: "Authentication error",
        note: authError?.message || "Failed to verify authentication.",
      });
    }

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { type } = req.query;
    const validTypes = ["caption", "image", "video", "ad"];

    let db;
    try {
      db = getAdminDb();
    } catch (dbError: any) {
      console.error("Firebase Admin error:", dbError);
      return res.status(200).json({
        success: false,
        content: [],
        error: "Database error",
        note: "Unable to access database. Please check your configuration.",
      });
    }

    try {
      let query: any = db
        .collection("users")
        .doc(user.uid)
        .collection("generatedContent")
        .orderBy("createdAt", "desc")
        .limit(100);

      // Filter by type if provided
      if (type && validTypes.includes(type as string)) {
        query = query.where("type", "==", type);
      }

      const snapshot = await query.get();
      const content = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return res.status(200).json({
        success: true,
        content,
      });
    } catch (fetchError: any) {
      console.error("Error fetching content:", fetchError);
      console.error("Fetch error stack:", fetchError?.stack);
      return res.status(200).json({
        success: false,
        content: [],
        error: "Failed to fetch content",
        note: fetchError?.message || "An error occurred while fetching content.",
      });
    }
  } catch (err: any) {
    console.error("getGeneratedContent error:", err);
    console.error("Error stack:", err?.stack);
    return res.status(200).json({
      success: false,
      content: [],
      error: err?.message || "An unexpected error occurred.",
      note: "Please try again. If the issue persists, contact support.",
    });
  }
}

