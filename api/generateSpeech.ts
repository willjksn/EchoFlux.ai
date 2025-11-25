import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { script, voice } = req.body || {};

    if (!script) {
      return res.status(400).json({ error: "script is required" });
    }

    // Stub: no real TTS yet — front-end already expects possible null
    return res.status(200).json({
      audioData: null,
      note: "Text-to-speech not implemented yet. Script received.",
    });
  } catch (err: any) {
    console.error("generateSpeech error:", err);
    return res.status(500).json({
      error: "Failed to generate speech (stub)",
      details: err?.message || String(err),
    });
  }
}
