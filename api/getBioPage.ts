import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "../_firebaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { username } = req.query;

  if (!username || typeof username !== "string") {
    return res.status(400).json({ error: "Username is required" });
  }

  try {
    const db = getAdminDb();
    const cleanUsername = username.replace("@", "");
    
    // Query users collection by username in bioPage
    const usersRef = db.collection("users");
    const querySnapshot = await usersRef
      .where("bioPage.username", "==", cleanUsername)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      return res.status(404).json({ error: "Bio page not found" });
    }

    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();

    if (!userData.bioPage) {
      return res.status(404).json({ error: "Bio page not found" });
    }

    return res.status(200).json({
      bioPage: userData.bioPage,
    });
  } catch (error: any) {
    console.error("Error fetching bio page:", error);
    return res.status(500).json({ error: "Failed to fetch bio page" });
  }
}