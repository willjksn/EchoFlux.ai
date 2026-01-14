import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { requireCronAuth } from "./_cronAuth.js";

/**
 * Cron job: Remove expired approved waitlist entries
 * - Finds all waitlist_requests with status="approved"
 * - Checks if their invite code has expired
 * - If expired, removes them from the approved list (changes status to "expired")
 * - Users remain in the users collection for follow-up emails
 * 
 * This should run daily via Vercel Cron
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  
  // Require cron authentication (Vercel Cron or manual with CRON_SECRET)
  if (!requireCronAuth(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = getAdminDb();
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  try {
    // Get all approved waitlist entries
    const approvedSnap = await db
      .collection("waitlist_requests")
      .where("status", "==", "approved")
      .get();

    if (approvedSnap.empty) {
      return res.status(200).json({
        success: true,
        message: "No approved waitlist entries to process",
        expiredCount: 0,
        processedCount: 0,
      });
    }

    let expiredCount = 0;
    const batch = db.batch();
    const batchSize = 500; // Firestore batch limit
    let batchOps = 0;

    for (const docSnap of approvedSnap.docs) {
      const data = docSnap.data() as any;
      const inviteCode = data.inviteCode as string | undefined;
      const expiresAt = data.expiresAt;

      if (!inviteCode) {
        // No invite code associated, skip
        continue;
      }

      // Check if invite code has expired
      let isExpired = false;
      if (expiresAt) {
        const expiresAtMs = expiresAt.toDate 
          ? expiresAt.toDate().getTime() 
          : new Date(expiresAt).getTime();
        
        if (Number.isFinite(expiresAtMs) && expiresAtMs < nowMs) {
          isExpired = true;
        }
      }

      if (isExpired) {
        // Update status to "expired" instead of deleting
        // This preserves the entry for audit purposes but removes it from approved list
        const waitRef = db.collection("waitlist_requests").doc(docSnap.id);
        batch.update(waitRef, {
          status: "expired",
          expiredAt: nowIso,
          updatedAt: nowIso,
        } as any);
        
        expiredCount++;
        batchOps++;

        // Commit batch if we hit the limit
        if (batchOps >= batchSize) {
          await batch.commit();
          batchOps = 0;
        }
      }
    }

    // Commit remaining batch operations
    if (batchOps > 0) {
      await batch.commit();
    }

    return res.status(200).json({
      success: true,
      message: `Processed ${approvedSnap.size} approved waitlist entries`,
      expiredCount,
      processedCount: approvedSnap.size,
    });
  } catch (error: any) {
    console.error("cleanupExpiredApprovedWaitlist error:", error);
    return res.status(500).json({
      error: "Failed to cleanup expired approved waitlist",
      message: error?.message || "Unknown error",
    });
  }
}
