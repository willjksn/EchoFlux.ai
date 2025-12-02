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

  try {
    const res = await fetch(`/api/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!res.ok) {
      let errorMsg = '';
      try {
        const text = await res.text();
        errorMsg = text;
        // Try to parse as JSON for structured error
        try {
          const json = JSON.parse(text);
          errorMsg = json.error || json.details || text;
        } catch {
          // Not JSON, use text as-is
        }
      } catch {
        errorMsg = `HTTP ${res.status}`;
      }
      // For non-critical endpoints, return empty data instead of throwing
      // This prevents console spam for optional features
      const nonCriticalEndpoints = ['getSocialStats', 'getAnalytics', 'generateAutopilotSuggestions', 'getModelUsageAnalytics'];
      if (nonCriticalEndpoints.includes(path)) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`API ${path} failed (non-critical):`, res.status, errorMsg);
        }
        return {} as any;
      }
      throw new Error(`API ${path} failed: ${res.status} - ${errorMsg}`);
    }

    return res.json();
  } catch (error: any) {
    // Handle network errors gracefully
    if (error.name === 'AbortError' || (error.name === 'TypeError' && error.message.includes('Failed to fetch'))) {
      // For non-critical endpoints, return empty data instead of throwing
      const nonCriticalEndpoints = ['getSocialStats', 'getAnalytics', 'generateAutopilotSuggestions', 'getModelUsageAnalytics'];
      if (nonCriticalEndpoints.includes(path)) {
        console.warn(`API ${path} failed: Network error (non-critical)`);
        return {} as any;
      }
      console.error(`API ${path} failed: Network error`);
      throw new Error(`Network error: Unable to reach API. Please check your connection and try again.`);
    }
    throw error;
  }
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
  
  // Handle different response formats
  if (res.imageData) {
    // New format: actual base64 image data
    return res.imageData;
  } else if (res.note) {
    // Fallback: if API key not configured, throw error
    throw new Error(res.note || "Image generation not configured");
  } else {
    // Legacy format or error
    throw new Error("Failed to generate image: Invalid response format");
  }
}

/* ----------------------------------------------------
   4) Video Generation
---------------------------------------------------- */
export async function generateAd(opts: {
  adType: "text" | "video";
  product?: string;
  service?: string;
  targetAudience?: string;
  goal?: string;
  platform?: string;
  tone?: string;
  callToAction?: string;
  budget?: string;
  duration?: number;
  additionalContext?: string;
}) {
  return await callFunction("generateAd", {
    adType: opts.adType,
    product: opts.product || null,
    service: opts.service || null,
    targetAudience: opts.targetAudience || null,
    goal: opts.goal || null,
    platform: opts.platform || null,
    tone: opts.tone || null,
    callToAction: opts.callToAction || null,
    budget: opts.budget || null,
    duration: opts.duration || null,
    additionalContext: opts.additionalContext || null,
  });
}

export async function generateVideo(
  prompt: string,
  baseImage?: { data: string; mimeType: string },
  aspectRatio?: "16:9" | "9:16" | string
): Promise<{ videoUrl?: string; operationId?: string; status?: string; error?: string }> {
  const res = await callFunction("generateVideo", {
    prompt,
    baseImage,
    aspectRatio,
  });
  
  // Check for errors in response
  if (!res.success && res.error) {
    throw new Error(res.note || res.error || "Video generation failed");
  }
  
  // Return operation ID and status - frontend will poll for completion
  return {
    operationId: res.operationId,
    status: res.status,
    videoUrl: res.videoUrl || undefined,
  };
}

export async function getVideoStatus(operationId: string): Promise<{ videoUrl?: string; status?: string; error?: string }> {
  // Use GET request with query parameter for status check
  const token = auth.currentUser
    ? await auth.currentUser.getIdToken(true)
    : null;

  const res = await fetch(`/api/getVideoStatus?operationId=${encodeURIComponent(operationId)}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API getVideoStatus failed: ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  
  // Check for errors in response
  if (!data.success && data.error) {
    throw new Error(data.note || data.error || "Failed to get video status");
  }

  return data;
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
   13) Voice Cloning
----------------------------------------------------- */
export async function cloneVoice(
  audioData: string,
  audioMimeType: string,
  voiceName: string
): Promise<{ success: boolean; voiceId?: string; voiceName?: string; error?: string }> {
  const token = auth.currentUser
    ? await auth.currentUser.getIdToken(true)
    : null;

  const res = await fetch('/api/cloneVoice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      audioData,
      audioMimeType,
      voiceName,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API cloneVoice failed: ${res.status} - ${errorText}`);
  }

  return res.json();
}

export async function generateSpeechWithVoice(
  text: string,
  voiceId: string,
  stability?: number,
  similarityBoost?: number
): Promise<{ success: boolean; audioData?: string; mimeType?: string; error?: string }> {
  const token = auth.currentUser
    ? await auth.currentUser.getIdToken(true)
    : null;

  const res = await fetch('/api/generateSpeechWithVoice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      text,
      voiceId,
      stability,
      similarityBoost,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API generateSpeechWithVoice failed: ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  
  if (!data.success && data.error) {
    throw new Error(data.note || data.error || "Speech generation failed");
  }

  return data;
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
export async function generateStoryboard(concept: string, platform?: string): Promise<{ frames: Array<{ order: number; description: string; onScreenText?: string; spokenLine?: string }> }> {
  const res = await callFunction("generateStoryboard", { idea: concept, platform });
  return res.frames ? res : { frames: [] };
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
        Uses dedicated _generateAutopilotPlan API route
---------------------------------------------------- */

/* ----------------------------------------------------
   17) Get Analytics Data
        Fetches real analytics data from Firestore
---------------------------------------------------- */
export async function getAnalytics(
  dateRange: '7d' | '30d' | '90d' = '30d',
  platform: string = 'All'
): Promise<any> {
  return await callFunction("getAnalytics", {
    dateRange,
    platform,
  });
}

/* ----------------------------------------------------
   18) Get Social Stats
        Fetches aggregated social media stats from posts
---------------------------------------------------- */
export async function getSocialStats(): Promise<Record<string, { followers: number; following: number }>> {
  return await callFunction("getSocialStats", {});
}
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

  // Call the dedicated autopilot plan API
  const res = await callFunction("generateAutopilotPlan", {
    goal,
    niche,
    audience,
    channels,
    durationWeeks,
  });
  
  // Return the plan structure (API returns { plan: {...} })
  return res.plan || res;
}

/* ----------------------------------------------------
   19) Save Generated Content
        Saves captions, images, videos, or ads to Firestore
---------------------------------------------------- */
export async function saveGeneratedContent(
  type: "caption" | "image" | "video" | "ad",
  content: any
): Promise<{ success: boolean; contentId?: string; error?: string }> {
  return await callFunction("saveGeneratedContent", {
    type,
    content,
  });
}

/* ----------------------------------------------------
   20) Get Generated Content
        Fetches saved captions, images, videos, or ads from Firestore
---------------------------------------------------- */
export async function getGeneratedContent(
  type?: "caption" | "image" | "video" | "ad"
): Promise<{ success: boolean; content: any[]; error?: string }> {
  const token = auth.currentUser
    ? await auth.currentUser.getIdToken(true)
    : null;

  const url = type
    ? `/api/getGeneratedContent?type=${encodeURIComponent(type)}`
    : "/api/getGeneratedContent";

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    throw new Error(`API getGeneratedContent failed: ${res.status}`);
  }

  return res.json();
}
