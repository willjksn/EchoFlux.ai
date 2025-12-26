import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { username, userId } = req.query;

  if (!username || typeof username !== "string") {
    return res.status(400).json({ error: "Username is required" });
  }

  try {
    const db = getAdminDb();
    if (!db) {
      throw new Error('Failed to initialize Firebase Admin database');
    }
    
    // Normalize username (remove @, lowercase, trim)
    const cleanUsername = username.replace("@", "").toLowerCase().trim();
    
    if (!cleanUsername) {
      return res.status(400).json({ error: "Username cannot be empty" });
    }
    
    // Query users collection by username in bioPage
    const usersRef = db.collection("users");
    
    let querySnapshot;
    try {
      querySnapshot = await usersRef
        .where("bioPage.username", "==", cleanUsername)
        .limit(1)
        .get();
    } catch (queryError: any) {
      // Check if it's an index error
      if (queryError?.code === 9 || queryError?.message?.includes("index")) {
        console.warn("Firestore index required for bioPage.username query. Falling back to full scan.");
        // Fallback: Try to get all users and filter
        const allUsers = await usersRef.limit(1000).get();
        const matchingDocs = allUsers.docs.filter(doc => {
          const data = doc.data();
          const bioUsername = data?.bioPage?.username?.replace("@", "").toLowerCase().trim();
          return bioUsername === cleanUsername;
        });
        
        querySnapshot = {
          empty: matchingDocs.length === 0,
          docs: matchingDocs,
        } as any;
      } else {
        throw queryError;
      }
    }

    // If username is taken by another user, it's not available
    if (!querySnapshot.empty) {
      const existingUser = querySnapshot.docs[0];
      const existingUserId = existingUser.id;
      
      // If userId is provided and it matches, the username is available for this user
      if (userId && existingUserId === userId) {
        return res.status(200).json({ available: true });
      }
      
      // Username is taken by another user
      return res.status(200).json({ 
        available: false, 
        message: "This username is already taken" 
      });
    }

    // Username is available
    return res.status(200).json({ available: true });
  } catch (error: any) {
    console.error("Error checking username availability:", error);
    return res.status(500).json({ 
      error: "Failed to check username availability",
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
}

