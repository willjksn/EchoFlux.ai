// src/services/geminiService.ts

import { auth } from "../../firebaseConfig";
import type { UserType } from "../../types";

// ----------------------------------------------------
// Generic API caller for Vercel Serverless Functions
// ----------------------------------------------------
async function callFunction(path: string, data: any) {
  const token = auth.currentUser
    ? await auth.currentUser.getIdToken(true)
    : null;

  const res = await fetch(`/api/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`API ${path} failed: ${res.status} - ${msg}`);
  }

  return res.json();
}

/* ----------------------------------------------------
   1) Reply
---------------------------------------------------- */
export async function generateReply(
  messageContent: string,
  messageType: string,
  platform: string,
  settings: any
): Promise<string> {
  const res = await callFunction("generateReply", {
    messageContent,
    messageType,
    platform,
    settings,
  });
  return res.reply;
}

/* ----------------------------------------------------
   2) Captions (image-aware, via mediaUrl or mediaData)
---------------------------------------------------- */
export async function generateCaptions(opts: {
  mediaUrl?: string | null;
  mediaData?: { data: string; mimeType: string } | null;
  goal?: string | null;
  tone?: string | null;
  promptText?: string | null;
}) {
  const { mediaUrl, mediaData, goal, tone, promptText } = opts;

  return await callFunction("generateCaptions", {
    mediaUrl: mediaUrl || null,
    mediaData: mediaData || null,
    goal: goal || null,
    tone: tone || null,
    promptText: promptText || null,
  });
}

/* ----------------------------------------------------
   3) Image Generation
---------------------------------------------------- */
export async function generateImage(
  prompt: string,
  baseImage?: { data: string; mimeType: string }
): Promise<string> {
  const res = await callFunction("generateImage", { prompt, baseImage });
  return res.imageData;
}

/* ----------------------------------------------------
   4) Video Generation
---------------------------------------------------- */
export async function generateVideo(
  prompt: string,
  baseImage?: { data: string; mimeType: string },
  aspectRatio?: "16:9" | "9:16"
): Promise<any> {
  return await callFunction("generateVideo", {
    prompt,
    baseImage,
    aspectRatio,
  });
}

export async function getVideoStatus(operation: any): Promise<any> {
  return await callFunction("getVideoStatus", { operation });
}

/* ----------------------------------------------------
   5) Trends
---------------------------------------------------- */
export async function findTrends(niche: string): Promise<any[]> {
  const res = await callFunction("findTrends", { niche });
  return res.trends || res.opportunities || [];
}

/* ----------------------------------------------------
   6) Categorize Message
---------------------------------------------------- */
export async function categorizeMessage(
  messageContent: string
): Promise<string> {
  const res = await callFunction("categorizeMessage", { messageContent });
  return res.category;
}

/* ----------------------------------------------------
   7) Chatbot
---------------------------------------------------- */
export async function askChatbot(question: string): Promise<string> {
  const res = await callFunction("askChatbot", { question });
  return res.answer;
}

/* ----------------------------------------------------
   8) Critique
---------------------------------------------------- */
export async function generateCritique(
  postContent: string
): Promise<string> {
  const res = await callFunction("generateCritique", { postContent });
  return res.critique;
}

/* ----------------------------------------------------
   9) Speech / TTS
---------------------------------------------------- */
export async function generateSpeech(
  script: string,
  voice: string
): Promise<string> {
  const res = await callFunction("generateSpeech", { script, voice });
  return res.audioData;
}

/* ----------------------------------------------------
   10) Content Strategy
---------------------------------------------------- */
export async function generateContentStrategy(
  niche: string,
  audience: string,
  goal: string,
  duration: string,
  tone: string,
  platformFocus: string
): Promise<any> {
  const res = await callFunction("generateContentStrategy", {
    niche,
    audience,
    goal,
    duration,
    tone,
    platformFocus,
  });
  return res.plan || res;
}

/* ----------------------------------------------------
   11) Storyboard
---------------------------------------------------- */
export async function generateStoryboard(concept: string): Promise<any> {
  const res = await callFunction("generateStoryboard", { concept });
  return res.storyboard || res;
}

/* ----------------------------------------------------
   12) Brand Suggestions
---------------------------------------------------- */
export async function generateBrandSuggestions(
  niche: string
): Promise<any[]> {
  const res = await callFunction("generateBrandSuggestions", { niche });
  return res.brands || res;
}

/* ----------------------------------------------------
   13) Analytics Report
---------------------------------------------------- */
export async function generateAnalyticsReport(
  data: any
): Promise<string> {
  const res = await callFunction("generateAnalyticsReport", { data });
  return res.report;
}

/* ----------------------------------------------------
   14) CRM Summary
---------------------------------------------------- */
export async function generateCRMSummary(history: any[]): Promise<any> {
  const res = await callFunction("generateCRMSummary", { history });
  return res.summary || res;
}

/* ----------------------------------------------------
   15) Autopilot Suggestions
        (normalize to always return { ideas: string[] })
---------------------------------------------------- */
export async function generateAutopilotSuggestions(
  niche: string,
  audience: string,
  userType: UserType
): Promise<{ ideas: string[] }> {
  const res = await callFunction("generateAutopilotSuggestions", {
    niche,
    audience,
    userType,
  });

  // API may send { ideas }, { suggestions }, or a bare array.
  const raw =
    (res && (res.ideas || res.suggestions)) ||
    (Array.isArray(res) ? res : []);

  const ideas = Array.isArray(raw) ? raw : [];
  return { ideas };
}

/* ----------------------------------------------------
   16) Autopilot Plan
        NO new API route – reuse generateContentStrategy
---------------------------------------------------- */
export async function generateAutopilotPlan(args: {
  goal: string;
  niche: string;
  audience: string;
  channels?: string[];
  durationWeeks?: number;
}): Promise<any> {
  const {
    goal,
    niche,
    audience,
    channels = [],
    durationWeeks = 4,
  } = args;

  const platformFocus =
    channels.length > 0 ? channels.join(", ") : "Mixed social channels";

  const durationLabel =
    durationWeeks === 4 ? "4 weeks" : `${durationWeeks} weeks`;

  // Reuse the existing content strategy API
  return generateContentStrategy(
    niche,
    audience,
    goal,
    durationLabel,
    "friendly",
    platformFocus
  );
}
