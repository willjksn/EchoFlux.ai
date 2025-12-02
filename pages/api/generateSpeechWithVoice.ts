// api/generateSpeechWithVoice.ts
// Generate speech using a cloned voice from ElevenLabs
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await verifyAuth(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { text, voiceId, stability = 0.5, similarityBoost = 0.75 } = (req.body as any) || {};

    if (!text || !voiceId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        note: "text and voiceId are required",
      });
    }

    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

    if (!elevenLabsApiKey) {
      return res.status(200).json({
        success: false,
        error: "ElevenLabs API not configured",
        note: "ELEVENLABS_API_KEY environment variable is missing.",
      });
    }

    // Verify user owns this voice
    const db = getAdminDb();
    const voiceDoc = await db.collection('users').doc(user.uid).collection('voices').doc(voiceId).get();
    
    if (!voiceDoc.exists) {
      return res.status(200).json({
        success: false,
        error: "Voice not found",
        note: "The specified voice does not exist or you don't have access to it.",
      });
    }

    // Generate speech using ElevenLabs API
    const speechResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2', // or 'eleven_monolingual_v1' for English only
        voice_settings: {
          stability: stability,
          similarity_boost: similarityBoost,
        },
      }),
    });

    if (!speechResponse.ok) {
      const errorText = await speechResponse.text();
      console.error('ElevenLabs TTS error:', errorText);
      return res.status(200).json({
        success: false,
        error: "Speech generation failed",
        note: errorText || "Failed to generate speech. Please try again.",
      });
    }

    // Get audio data as base64
    const audioBuffer = await speechResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    return res.status(200).json({
      success: true,
      audioData: audioBase64,
      mimeType: 'audio/mpeg',
      message: "Speech generated successfully",
    });
  } catch (err: any) {
    console.error("generateSpeechWithVoice error:", err);
    return res.status(200).json({
      success: false,
      error: "Failed to generate speech",
      note: err?.message || String(err) || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
  }
}

