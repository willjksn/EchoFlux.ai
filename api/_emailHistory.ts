import { getAdminDb } from "./_firebaseAdmin.js";

export type EmailHistoryEntry = {
  id: string;
  sentAt: string;
  sentBy: string | null; // Admin UID or null for system
  to: string;
  subject: string;
  body: string; // Full email body (text)
  html?: string;
  status: "sent" | "failed";
  provider: string | null;
  error?: string;
  category: "waitlist" | "mass" | "scheduled" | "template" | "other";
  metadata?: {
    waitlistId?: string;
    campaignId?: string;
    scheduledEmailId?: string;
    templateId?: string;
    [key: string]: any;
  };
};

/**
 * Log an email send attempt to history
 */
export async function logEmailHistory(entry: Omit<EmailHistoryEntry, "id" | "sentAt">) {
  try {
    const db = getAdminDb();
    const nowIso = new Date().toISOString();
    const docRef = db.collection("email_history").doc();
    
    await docRef.set({
      ...entry,
      id: docRef.id,
      sentAt: nowIso,
    });
    
    return docRef.id;
  } catch (e: any) {
    console.error("Failed to log email history:", e);
    return null;
  }
}

