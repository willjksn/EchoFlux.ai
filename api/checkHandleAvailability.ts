import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { handle, creatorId } = req.query;

  if (!handle || typeof handle !== "string") {
    return res.status(400).json({ error: "handle is required" });
  }

  const cleanHandle = handle.replace("@", "").toLowerCase().trim();
  if (!cleanHandle) {
    return res.status(400).json({ error: "handle cannot be empty" });
  }

  // 3–20 chars, alphanumeric + underscore only
  if (!/^[a-z0-9_]{3,20}$/.test(cleanHandle)) {
    return res.status(400).json({
      available: false,
      message: "Handle must be 3–20 characters, letters, numbers and underscores only",
    });
  }

  const excludeCreatorId = typeof creatorId === "string" ? creatorId : undefined;

  try {
    const db = getAdminDb();
    if (!db) {
      throw new Error("Failed to initialize Firebase Admin database");
    }

    // 1) Fast lookup: creatorHandles/{handle} -> creatorId
    const handleDoc = await db.collection("creatorHandles").doc(cleanHandle).get();
    if (handleDoc.exists) {
      const existingCreatorId = (handleDoc.data() as { creatorId?: string })?.creatorId;
      if (existingCreatorId && existingCreatorId !== excludeCreatorId) {
        return res.status(200).json({
          available: false,
          message: "This handle is already taken",
        });
      }
      if (existingCreatorId === excludeCreatorId) {
        return res.status(200).json({ available: true });
      }
    }

    // 1b) Global namespace lock: member usernames reserve creator handles too.
    // Same Firebase user may hold usernames/{handle} as their fan username while switching creator handles.
    const usernameDoc = await db.collection("usernames").doc(cleanHandle).get();
    if (usernameDoc.exists) {
      const ownerUid =
        typeof (usernameDoc.data() as { uid?: unknown } | undefined)?.uid === "string"
          ? String((usernameDoc.data() as { uid: string }).uid).trim()
          : "";
      if (!excludeCreatorId || !ownerUid || ownerUid !== excludeCreatorId) {
        return res.status(200).json({
          available: false,
          message: "This handle is already taken",
        });
      }
      // Self-owned username doc: not a conflict for this creator reclaiming this handle string.
    }

    // 2) Fallback: creators where handle == cleanHandle
    const creatorsRef = db.collection("creators");
    let snapshot;
    try {
      snapshot = await creatorsRef
        .where("handle", "==", cleanHandle)
        .limit(1)
        .get();
    } catch (queryError: any) {
      if (queryError?.code === 9 || queryError?.message?.includes("index")) {
        if (process.env.NODE_ENV === "development") {
          const all = await creatorsRef.limit(500).get();
          const match = all.docs.find(
            (d) => (d.data()?.handle || "").toLowerCase().trim() === cleanHandle
          );
          if (!match) {
            return res.status(200).json({ available: true });
          }
          if (excludeCreatorId && match.id === excludeCreatorId) {
            return res.status(200).json({ available: true });
          }
          return res.status(200).json({
            available: false,
            message: "This handle is already taken",
          });
        }
        return res.status(500).json({
          error: "Handle lookup is temporarily unavailable. Create a Firestore index on creators.handle.",
        });
      }
      throw queryError;
    }

    if (snapshot.empty) {
      return res.status(200).json({ available: true });
    }

    const existingDoc = snapshot.docs[0];
    if (excludeCreatorId && existingDoc.id === excludeCreatorId) {
      return res.status(200).json({ available: true });
    }

    return res.status(200).json({
      available: false,
      message: "This handle is already taken",
    });
  } catch (error: any) {
    console.error("Error checking handle availability:", error);
    return res.status(500).json({
      error: "Failed to check handle availability",
      details: process.env.NODE_ENV === "development" ? error?.message : undefined,
    });
  }
}
