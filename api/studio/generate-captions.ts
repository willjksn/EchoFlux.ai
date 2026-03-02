import type { VercelRequest, VercelResponse } from "@vercel/node";
import generateCaptionsHandler from "../generateCaptions.js";

function normalizeStudioPayload(rawBody: any) {
  const body = rawBody && typeof rawBody === "object" ? { ...rawBody } : {};

  // Backward-compatible field aliases used by older studio clients.
  if (!body.mediaUrl && typeof body.imageUrl === "string") body.mediaUrl = body.imageUrl;
  if (!body.mediaUrl && typeof body.videoUrl === "string") body.mediaUrl = body.videoUrl;
  if (!body.promptText && typeof body.prompt === "string") body.promptText = body.prompt;
  if (!body.promptText && typeof body.captionPrompt === "string") body.promptText = body.captionPrompt;

  if (!body.platforms) {
    if (Array.isArray(body.platform)) {
      body.platforms = body.platform;
    } else if (typeof body.platform === "string" && body.platform.trim()) {
      body.platforms = [body.platform.trim()];
    }
  }

  return body;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Keep the endpoint contract strict and predictable.
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  req.body = normalizeStudioPayload(req.body);
  await generateCaptionsHandler(req, res);
}
