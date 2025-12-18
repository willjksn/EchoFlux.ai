// api/verifyAuth.ts
import type { VercelRequest } from "@vercel/node";
import { verifyIdToken } from "./_firebaseAdmin.js";

export async function verifyAuth(req: VercelRequest) {
  const header = req.headers.authorization as string | undefined;

  if (!header) return null;

  try {
    const decoded = await verifyIdToken(header);
    return decoded;
  } catch (err) {
    console.error("verifyAuth failed:", err);
    return null;
  }
}


