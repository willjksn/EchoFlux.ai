import type { VercelRequest, VercelResponse } from "@vercel/node";
// Important: use .js extension so Vercel ESM resolver finds the compiled file
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { username } = req.query;

  if (!username || typeof username !== "string") {
    return res.status(400).json({ error: "Username is required" });
  }

  try {
    // Initialize Firebase Admin with error handling
    let db;
    try {
      db = getAdminDb();
      if (!db) {
        throw new Error('Failed to initialize Firebase Admin database');
      }
    } catch (dbError: any) {
      console.error('Error initializing Firebase Admin:', dbError);
      return res.status(500).json({ 
        error: "Database initialization failed",
        details: process.env.NODE_ENV === 'development' ? dbError?.message : undefined
      });
    }
    
    // Decode URL encoding and normalize username
    let decodedUsername = username;
    try {
      decodedUsername = decodeURIComponent(username);
    } catch (e) {
      // If decode fails, use original
      console.warn('Failed to decode username, using as-is:', username);
    }
    const cleanUsername = decodedUsername.replace("@", "").toLowerCase().trim();
    
    console.log('Looking for bio page with username:', cleanUsername);
    
    // Helper function to normalize bioPage data
    const normalizeBioPage = (bioPage: any) => {
      // Ensure socialLinks is an array
      let socialLinks = [];
      if (bioPage.socialLinks) {
        if (Array.isArray(bioPage.socialLinks)) {
          socialLinks = bioPage.socialLinks;
        } else if (typeof bioPage.socialLinks === 'object') {
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

      return {
        ...bioPage,
        socialLinks,
        customLinks,
      };
    };
    
    // Query users collection by username in bioPage
    const usersRef = db.collection("users");
    
    let userDoc;
    try {
      const querySnapshot = await usersRef
        .where("bioPage.username", "==", cleanUsername)
        .limit(1)
        .get();

      if (querySnapshot.empty) {
        console.log('No bio page found for username:', cleanUsername);
        return res.status(404).json({ error: "Bio page not found" });
      }
      
      console.log('Found bio page for username:', cleanUsername);

      userDoc = querySnapshot.docs[0];
    } catch (queryError: any) {
      // Check if it's an index error
      if (queryError?.code === 9 || queryError?.message?.includes("index")) {
        console.error("Firestore index required for bioPage.username query:", queryError);
        // Fallback: Try to get all users and filter (not recommended for production, but works as fallback)
        console.warn("Falling back to full collection scan - this is inefficient. Please create a Firestore index for bioPage.username");
        const allUsers = await usersRef.limit(1000).get(); // Limit to prevent huge scans
        const matchingDocs = allUsers.docs.filter(doc => {
          const data = doc.data();
          const bioUsername = data?.bioPage?.username?.replace("@", "").toLowerCase().trim();
          return bioUsername === cleanUsername;
        });
        
        if (matchingDocs.length === 0) {
          return res.status(404).json({ error: "Bio page not found" });
        }
        
        userDoc = matchingDocs[0];
      } else {
        // Re-throw if it's not an index error
        throw queryError;
      }
    }

    const userData = userDoc.data();

    if (!userData || !userData.bioPage) {
      return res.status(404).json({ error: "Bio page not found" });
    }

    // Normalize bioPage data to ensure socialLinks and customLinks are always arrays
    const normalizedBioPage = normalizeBioPage(userData.bioPage);

    // Ensure we have a valid bioPage object
    if (!normalizedBioPage || typeof normalizedBioPage !== 'object') {
      console.error('Invalid bioPage data after normalization:', normalizedBioPage);
      return res.status(500).json({ error: "Invalid bio page data" });
    }

    return res.status(200).json({
      bioPage: normalizedBioPage,
    });
  } catch (error: any) {
    console.error("Error fetching bio page:", error);
    console.error("Error details:", {
      message: error?.message,
      name: error?.name,
      code: error?.code,
      stack: error?.stack?.split('\n').slice(0, 10),
    });
    
    // Check if response has already been sent
    if (res.headersSent) {
      console.error('Response already sent, cannot send error response');
      return;
    }
    
    return res.status(500).json({ 
      error: "Failed to fetch bio page",
      details: process.env.NODE_ENV === 'development' ? {
        message: error?.message,
        name: error?.name,
        code: error?.code,
      } : undefined
    });
  }
}