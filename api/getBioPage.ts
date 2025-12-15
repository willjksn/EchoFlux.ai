import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin";

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

    // Normalize bioPage data to ensure socialLinks and customLinks are always arrays
    const bioPage = userData.bioPage;
    
    // Ensure socialLinks is an array
    let socialLinks = [];
    if (bioPage.socialLinks) {
      if (Array.isArray(bioPage.socialLinks)) {
        socialLinks = bioPage.socialLinks;
      } else if (typeof bioPage.socialLinks === 'object') {
        // Convert object to array
        try {
          socialLinks = Object.values(bioPage.socialLinks).filter((item: any) => 
            item && typeof item === 'object' && 'id' in item
          );
        } catch (e) {
          socialLinks = [];
        }
      }
    }
    
    // Ensure customLinks is an array (check both customLinks and legacy links field)
    let customLinks = [];
    if (bioPage.customLinks) {
      if (Array.isArray(bioPage.customLinks)) {
        customLinks = bioPage.customLinks;
      } else if (typeof bioPage.customLinks === 'object') {
        try {
          customLinks = Object.values(bioPage.customLinks).filter((item: any) => 
            item && typeof item === 'object' && 'id' in item
          );
        } catch (e) {
          customLinks = [];
        }
      }
    } else if (bioPage.links) {
      if (Array.isArray(bioPage.links)) {
        customLinks = bioPage.links;
      } else if (typeof bioPage.links === 'object') {
        try {
          customLinks = Object.values(bioPage.links).filter((item: any) => 
            item && typeof item === 'object' && 'id' in item
          );
        } catch (e) {
          customLinks = [];
        }
      }
    }

    return res.status(200).json({
      bioPage: {
        ...bioPage,
        socialLinks,
        customLinks,
      },
    });
  } catch (error: any) {
    console.error("Error fetching bio page:", error);
    return res.status(500).json({ error: "Failed to fetch bio page" });
  }
}