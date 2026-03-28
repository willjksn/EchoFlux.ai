import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

function validateFormat(username: string): string | null {
  const u = normalize(username);
  if (!u) return "Username is required.";
  if (u.length < 3) return "Username must be at least 3 characters.";
  if (u.length > 32) return "Username must be at most 32 characters.";
  if (!/^[a-z0-9_]+$/.test(u)) return "Use only lowercase letters, numbers, and underscores.";
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) return res.status(401).json({ error: "Unauthorized" });

  const usernameRaw = typeof req.query?.username === "string" ? req.query.username : "";
  const fmtErr = validateFormat(usernameRaw);
  if (fmtErr) return res.status(200).json({ available: false, reason: "invalid", message: fmtErr });

  const username = normalize(usernameRaw);
  const db = getAdminDb();
  if (!db) return res.status(500).json({ error: "Database unavailable" });

  try {
    const [userSnap, unameSnap] = await Promise.all([
      db.collection("users").doc(decoded.uid).get(),
      db.collection("usernames").doc(username).get(),
    ]);
    const existing = userSnap.data() as { username?: string } | undefined;
    const current = typeof existing?.username === "string" ? normalize(existing.username) : "";
    if (current && current === username) {
      return res.status(200).json({ available: true, reason: "current", message: "Your current username." });
    }
    if (!unameSnap.exists) {
      return res.status(200).json({ available: true, reason: "available", message: "Available." });
    }
    const owner = (unameSnap.data() as { uid?: string } | undefined)?.uid;
    if (owner && owner === decoded.uid) {
      return res.status(200).json({ available: true, reason: "current", message: "Your current username." });
    }
    return res.status(200).json({ available: false, reason: "taken", message: "Unavailable — already taken." });
  } catch (error: any) {
    console.error("checkMemberUsernameAvailability error:", error);
    return res.status(500).json({ error: "Failed to check username availability" });
  }
}

