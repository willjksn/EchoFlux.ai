/**
 * POST: Claim a global member username (fan). Auth required.
 * Body: { username: string, creatorId: string }
 * - Creates usernames/{lowercase} -> { uid }
 * - Sets users/{uid}.username (server only; clients cannot write this field)
 * - Denormalizes username onto existing creators/*/fans/{uid} docs (none yet if pre-checkout paid signup)
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldPath } from "firebase-admin/firestore";
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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const uid = decoded.uid;
  const body = (req.body || {}) as { username?: string; creatorId?: string };
  const raw = typeof body.username === "string" ? body.username : "";
  const creatorId = typeof body.creatorId === "string" ? body.creatorId.trim() : "";

  const fmtErr = validateFormat(raw);
  if (fmtErr) {
    return res.status(400).json({ error: fmtErr });
  }
  if (!creatorId) {
    return res.status(400).json({ error: "creatorId is required" });
  }

  const norm = normalize(raw);
  const now = new Date().toISOString();
  const db = getAdminDb();
  if (!db) {
    return res.status(500).json({ error: "Database unavailable" });
  }

  const creatorSnap = await db.collection("creators").doc(creatorId).get();
  if (!creatorSnap.exists) {
    return res.status(404).json({ error: "Creator not found" });
  }

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const existingUser = userSnap.data() as { username?: string } | undefined;
  const existingUsername =
    typeof existingUser?.username === "string" ? normalize(existingUser.username) : "";

  const unameRef = db.collection("usernames").doc(norm);
  const creatorHandleRef = db.collection("creatorHandles").doc(norm);
  const oldUnameRef = existingUsername && existingUsername !== norm ? db.collection("usernames").doc(existingUsername) : null;

  try {
    await db.runTransaction(async (tx) => {
      // All reads before any writes (Firestore requirement).
      const creatorHandleSnap = await tx.get(creatorHandleRef);
      if (creatorHandleSnap.exists) {
        throw new Error("RESERVED_CREATOR_HANDLE");
      }
      const uSnap = await tx.get(unameRef);
      if (uSnap.exists) {
        const owner = (uSnap.data() as { uid?: string } | undefined)?.uid;
        if (owner && owner !== uid) {
          throw new Error("TAKEN");
        }
      }
      let oldOwner: string | undefined;
      if (oldUnameRef) {
        const oldSnap = await tx.get(oldUnameRef);
        oldOwner = (oldSnap.data() as { uid?: string } | undefined)?.uid;
      }
      tx.set(unameRef, { uid, updatedAt: now });
      if (oldUnameRef && (!oldOwner || oldOwner === uid)) {
        tx.delete(oldUnameRef);
      }
      tx.set(
        userRef,
        {
          username: norm,
          usernameUpdatedAt: now,
        },
        { merge: true },
      );
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "RESERVED_CREATOR_HANDLE") {
      return res.status(409).json({ error: "That username is reserved as a creator handle." });
    }
    if (msg === "TAKEN") {
      return res.status(409).json({ error: "That username is already taken." });
    }
    console.error("claimMemberUsername transaction error:", e);
    return res.status(500).json({ error: "Failed to claim username" });
  }

  // Denormalize onto all creators' fans docs for this uid (includes current creator)
  try {
    const groupSnap = await db.collectionGroup("fans").where(FieldPath.documentId(), "==", uid).get();

    const chunkSize = 400;
    for (let i = 0; i < groupSnap.docs.length; i += chunkSize) {
      const batch = db.batch();
      for (const d of groupSnap.docs.slice(i, i + chunkSize)) {
        batch.set(d.ref, { username: norm, updatedAt: now }, { merge: true });
      }
      await batch.commit();
    }
  } catch (e) {
    console.warn(
      "claimMemberUsername: collectionGroup fans update failed (add Firestore index if needed):",
      e,
    );
  }

  return res.status(200).json({ success: true, username: norm });
}
