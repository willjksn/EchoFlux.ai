import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, getVerifyAuth } from "./_errorHandler.js";
import { getAdminDb, getAdminApp } from "./_firebaseAdmin.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const verifyAuth = await getVerifyAuth();
  const adminUser = await verifyAuth(req);

  if (!adminUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Verify admin role
  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(adminUser.uid).get();
  const adminData = adminDoc.data();
  
  if (adminData?.role !== "Admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const { userId } = (req.body as any) || {};

  if (!userId) {
    res.status(400).json({ error: "Missing userId" });
    return;
  }

  // Prevent admins from deleting themselves
  if (userId === adminUser.uid) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  try {
    // Check if user exists in Firestore
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      res.status(404).json({ error: "User not found in Firestore" });
      return;
    }

    // Delete user from Firebase Auth
    const adminApp = getAdminApp();
    const auth = adminApp.auth();
    
    try {
      await auth.deleteUser(userId);
    } catch (authError: any) {
      // If user doesn't exist in Auth, that's okay - continue with Firestore deletion
      if (authError?.code !== 'auth/user-not-found') {
        console.error("Error deleting user from Auth:", authError);
        // Continue anyway - we'll still delete from Firestore
      }
    }

    // Delete user document from Firestore
    await db.collection("users").doc(userId).delete();

    // Optionally: Delete user's subcollections (messages, posts, etc.)
    // Note: Firestore doesn't support recursive delete by default
    // You may want to add batch deletion of subcollections if needed
    // For now, we'll just delete the main user document

    res.status(200).json({
      success: true,
      message: "User deleted successfully"
    });
    return;
  } catch (error: any) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      error: "Failed to delete user",
      details: process.env.NODE_ENV === "development" ? error?.message : undefined
    });
    return;
  }
}

export default withErrorHandling(handler);

