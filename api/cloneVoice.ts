// api/cloneVoice.ts
// Clone a voice from audio samples using ElevenLabs API
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

    const { audioData, audioMimeType, voiceName } = (req.body as any) || {};

    if (!audioData || !voiceName) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        note: "audioData and voiceName are required",
      });
    }

    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

    if (!elevenLabsApiKey) {
      return res.status(200).json({
        success: false,
        error: "ElevenLabs API not configured",
        note: "ELEVENLABS_API_KEY environment variable is missing. Please configure it to enable voice cloning.",
      });
    }

    // Convert base64 audio to buffer
    const audioBuffer = Buffer.from(audioData, 'base64');

    // Create multipart/form-data manually for ElevenLabs API
    const boundary = `----WebKitFormBoundary${Date.now()}`;
    const formDataParts: Buffer[] = [];
    
    // Add name field
    formDataParts.push(Buffer.from(`--${boundary}\r\n`));
    formDataParts.push(Buffer.from(`Content-Disposition: form-data; name="name"\r\n\r\n`));
    formDataParts.push(Buffer.from(`${voiceName}\r\n`));
    
    // Add file field
    formDataParts.push(Buffer.from(`--${boundary}\r\n`));
    formDataParts.push(Buffer.from(`Content-Disposition: form-data; name="files"; filename="voice_sample.mp3"\r\n`));
    formDataParts.push(Buffer.from(`Content-Type: ${audioMimeType || 'audio/mpeg'}\r\n\r\n`));
    formDataParts.push(audioBuffer);
    formDataParts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    
    const formDataBody = Buffer.concat(formDataParts);

    const cloneResponse = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsApiKey,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: formDataBody,
    });

    if (!cloneResponse.ok) {
      const errorText = await cloneResponse.text();
      console.error('ElevenLabs clone error:', errorText);
      return res.status(200).json({
        success: false,
        error: "Voice cloning failed",
        note: errorText || "Failed to clone voice. Please check your audio file format and try again.",
      });
    }

    const cloneData = await cloneResponse.json();
    const voiceId = cloneData.voice_id;

    if (!voiceId) {
      return res.status(200).json({
        success: false,
        error: "Voice cloning failed",
        note: "No voice ID returned from ElevenLabs",
      });
    }

    // Save voice ID to Firestore
    const db = getAdminDb();
    await db.collection('users').doc(user.uid).collection('voices').doc(cloneData.voice_id).set({
      id: cloneData.voice_id,
      name: voiceName,
      elevenLabsVoiceId: voiceId,
      createdAt: new Date().toISOString(),
      mimeType: audioMimeType,
    }, { merge: true });

    return res.status(200).json({
      success: true,
      voiceId: voiceId,
      voiceName: voiceName,
      message: "Voice cloned successfully",
    });
  } catch (err: any) {
    console.error("cloneVoice error:", err);
    return res.status(200).json({
      success: false,
      error: "Failed to clone voice",
      note: err?.message || String(err) || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
  }
}

