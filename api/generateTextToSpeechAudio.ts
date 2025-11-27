import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.ts";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Intentionally not implemented yet.
  return res.status(501).json({
    error: "Text-to-speech audio generation is not yet implemented on the server.",
    note: "Wire this endpoint to your preferred TTS provider (e.g. ElevenLabs, Play.ht, etc.).",
  });
}
