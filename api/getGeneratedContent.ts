// api/getGeneratedContent.ts
// Fetch generated content (captions, images, videos, ads) from Firestore

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.ts";
import { getAdminDb } from "./_firebaseAdmin.ts";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await verifyAuth(req);
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
      });
    }

    try {
      let query = db
        .collection("users")
        .doc(user.uid)
        .collection("generatedContent")
        .orderBy("createdAt", "desc")
        .limit(100);

      // Filter by type if provided
      if (type && validTypes.includes(type as string)) {
        query = query.where("type", "==", type) as any;
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
      return res.status(200).json({
        success: false,
        content: [],
        error: "Failed to fetch content",
      });
    }
  } catch (err: any) {
    console.error("getGeneratedContent error:", err);
    return res.status(200).json({
      success: false,
      content: [],
      error: err?.message || "An unexpected error occurred.",
    });
  }
}

