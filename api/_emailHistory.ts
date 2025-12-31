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

    // Firestore Admin SDK rejects `undefined` values.
    // Normalize optional fields to either be omitted or set to null.
    const clean: any = {
      ...entry,
      id: docRef.id,
      sentAt: nowIso,
    };
    if (clean.html === undefined) delete clean.html;
    if (clean.error === undefined) delete clean.error;
    if (clean.metadata === undefined) delete clean.metadata;

    await docRef.set(clean);
    
    return docRef.id;
  } catch (e: any) {
    console.error("Failed to log email history:", e);
    return null;
  }
}

