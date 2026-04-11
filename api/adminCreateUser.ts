import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, getVerifyAuth } from "./_errorHandler.js";
import { getAdminDb, getAdminApp } from "./_firebaseAdmin.js";
import { sendEmail } from "./_mailer.js";

const PLATFORMS = ["Instagram", "TikTok", "X", "Threads", "YouTube", "LinkedIn", "Facebook", "Pinterest"] as const;
const VALID_PLANS = ["Pro", "Elite"] as const;
const DEFAULT_PASSWORD = "Password1!";

function getStorageLimitMB(plan: string): number {
  if (plan === "Free") return 100;
  if (plan === "Pro" || plan === "CreatorPro") return 5120;
  if (plan === "Elite" || plan === "CreatorElite" || plan === "Growth") return 10240;
  if (plan === "Agency") return 51200;
  if (plan === "Starter") return 1024;
  if (plan === "Caption" || plan === "OnlyFansStudio") return 10240;
  return 100;
}

function generateMockSocialStats(): Record<string, { followers: number; following: number }> {
  const stats: Record<string, { followers: number; following: number }> = {};
  for (const p of PLATFORMS) {
    stats[p] = {
      followers: Math.floor(Math.random() * 15000) + 50,
      following: Math.floor(Math.random() * 1000) + 5,
    };
  }
  return stats;
}

const DEFAULT_SETTINGS = {
  autoReply: true,
  autoRespond: false,
  safeMode: true,
  highQuality: false,
  tone: { formality: 50, humor: 30, empathy: 70, spiciness: 0 },
  voiceMode: true,
  prioritizedKeywords: "collaboration, pricing, question",
  ignoredKeywords: "spam, giveaway, follow back",
  connectedAccounts: {
    Instagram: true,
    TikTok: true,
    X: true,
    Threads: true,
    YouTube: false,
    LinkedIn: true,
    Facebook: true,
    Pinterest: false,
  },
};

function newUserWelcomeEmail(name: string | null, email: string, tempPassword: string): string {
  const displayName = name?.trim() || "there";
  return `Hi ${displayName},

Your EchoFlux.ai account has been created. Here are your login credentials:

Email: ${email}
Temporary Password: ${tempPassword}

**Important:** Please change your password after your first login for security. Use the "Forgot password" link on the login page to set a new password.

Log in at: https://echoflux.ai

— The EchoFlux Team`;
}

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

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(adminUser.uid).get();
  const adminData = adminDoc.data();

  if (adminData?.role !== "Admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const { email, password: passwordParam, displayName, plan, sendWelcomeEmail } = (req.body as any) || {};

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    res.status(400).json({ error: "Invalid email format" });
    return;
  }

  const password = (typeof passwordParam === "string" && passwordParam.length >= 6) ? passwordParam : DEFAULT_PASSWORD;
  if (!/[^A-Za-z0-9]/.test(password)) {
    res.status(400).json({ error: "Password must include at least one special character (example: !@#$%)" });
    return;
  }
  const selectedPlan = (plan && VALID_PLANS.includes(plan as any)) ? plan : "Pro";

  try {
    const adminApp = getAdminApp();
    const auth = adminApp.auth();

    // Create user in Firebase Auth
    const userRecord = await auth.createUser({
      email: normalizedEmail,
      password: password,
      displayName: (displayName && typeof displayName === "string" ? displayName.trim() : null) || "New User",
      emailVerified: false,
    });

    const storageLimit = getStorageLimitMB(selectedPlan);

    const newUserDoc = {
      id: userRecord.uid,
      name: userRecord.displayName || "New User",
      email: normalizedEmail,
      avatar: `https://picsum.photos/seed/${userRecord.uid}/100/100`,
      bio: "Welcome to EchoFlux.ai!",
      plan: selectedPlan,
      role: "User",
      userType: "Creator",
      signupDate: new Date().toISOString(),
      hasCompletedOnboarding: false,
      notifications: {
        newMessages: true,
        weeklySummary: false,
        trendAlerts: false,
      },
      monthlyCaptionGenerationsUsed: 0,
      monthlyImageGenerationsUsed: 0,
      monthlyVideoGenerationsUsed: 0,
      monthlyRepliesUsed: 0,
      storageUsed: 0,
      storageLimit,
      mediaLibrary: [],
      settings: DEFAULT_SETTINGS,
      socialStats: generateMockSocialStats(),
    };

    await db.collection("users").doc(userRecord.uid).set(newUserDoc);

    // Optionally send welcome email with credentials
    let emailSent = false;
    if (sendWelcomeEmail === true) {
      try {
        const mail = await sendEmail({
          to: normalizedEmail,
          subject: "Your EchoFlux.ai account has been created",
          text: newUserWelcomeEmail(userRecord.displayName || null, normalizedEmail, password),
        });
        emailSent = mail.sent === true;
      } catch (emailErr: any) {
        console.warn("Failed to send welcome email:", emailErr);
      }
    }

    res.status(200).json({
      success: true,
      userId: userRecord.uid,
      email: normalizedEmail,
      plan: selectedPlan,
      emailSent,
    });
    return;
  } catch (error: any) {
    if (error?.code === "auth/email-already-exists") {
      res.status(400).json({ error: "An account with this email already exists" });
      return;
    }
    if (error?.code === "auth/invalid-email") {
      res.status(400).json({ error: "Invalid email address" });
      return;
    }
    if (error?.code === "auth/weak-password") {
      res.status(400).json({ error: "Password is too weak (minimum 6 characters and include a symbol)" });
      return;
    }
    if (String(error?.message || "").includes("PASSWORD_DOES_NOT_MEET_REQUIREMENTS")) {
      res.status(400).json({ error: "Password does not meet Firebase policy (must include a non-alphanumeric character)." });
      return;
    }
    // Firebase Admin config errors (e.g. missing env var)
    if (error?.message?.includes("FIREBASE_SERVICE_ACCOUNT") || error?.message?.includes("Firebase Admin")) {
      res.status(503).json({
        error: "Server configuration error: Firebase Admin SDK not configured. Add FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 to Vercel environment variables.",
      });
      return;
    }
    console.error("adminCreateUser error:", error);
    res.status(500).json({
      error: "Failed to create user",
      code: error?.code || undefined,
      message: error?.message || String(error),
    });
    return;
  }
}

export default withErrorHandling(handler);
