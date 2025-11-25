import app, { auth } from "../../firebaseConfig";


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

// ----------------------------------------------------
// Types
// ----------------------------------------------------
export type MessageCategory = "Lead" | "Support" | "Opportunity" | "General";

// This now matches your new backend
export type CaptionOptions = {
  mediaUrl?: string | null;
  goal?: string | null;
  tone?: string | null;
  promptText?: string | null;
};

// ----------------------------------------------------
// 1) Reply
// ----------------------------------------------------
export async function generateReply(
  messageContent: string,
  messageType?: string,
  platform?: string,
  settings?: any
): Promise<string> {
  const res = await callFunction("generateReply", {
    messageContent,
    messageType,
    platform,
    settings,
  });

  return res.reply;
}

// ----------------------------------------------------
// 2) Captions (updated)
// ----------------------------------------------------
export async function generateCaptions(options: CaptionOptions) {
  return await callFunction("generateCaptions", {
    mediaUrl: options.mediaUrl || null,
    goal: options.goal || null,
    tone: options.tone || null,
    promptText: options.promptText || null,
  });
}

// ----------------------------------------------------
// 3) Image Generation (stub)
// ----------------------------------------------------
export async function generateImage(
  prompt: string,
  baseImage?: { data: string; mimeType: string }
): Promise<string | null> {
  const res = await callFunction("generateImage", {
    prompt,
    baseImage: baseImage || null,
  });

  return res.imageData || null;
}

// ----------------------------------------------------
// 4) Trends
// ----------------------------------------------------
export async function findTrends(niche: string) {
  const res = await callFunction("findTrends", { niche });
  return res.trends || [];
}

// ----------------------------------------------------
// 5) Speech (stub)
// ----------------------------------------------------
export async function generateSpeech(script: string, voice: string) {
  const res = await callFunction("generateSpeech", { script, voice });
  return res.audioData || null;
}

// ----------------------------------------------------
// 6) Categorize Message
// ----------------------------------------------------
export async function categorizeMessage(
  messageContent: string
): Promise<MessageCategory> {
  const res = await callFunction("categorizeMessage", { messageContent });
  return (res.category as MessageCategory) || "General";
}

// ----------------------------------------------------
// 7) Chatbot
// ----------------------------------------------------
export async function askChatbot(question: string): Promise<string> {
  const res = await callFunction("askChatbot", { question });
  return res.answer;
}

// ----------------------------------------------------
// 8) Critique
// ----------------------------------------------------
export async function generateCritique(postContent: string): Promise<string> {
  const res = await callFunction("generateCritique", { postContent });
  return res.critique;
}

// ----------------------------------------------------
// 9) Content Strategy
// ----------------------------------------------------
export async function generateContentStrategy(
  niche: string,
  audience: string,
  goal: string,
  duration: string,
  tone: string,
  platformFocus: string
) {
  const res = await callFunction("generateContentStrategy", {
    niche,
    audience,
    goal,
    duration,
    tone,
    platformFocus,
  });

  return res.plan;
}

// ----------------------------------------------------
// 10) Storyboard
// ----------------------------------------------------
export async function generateStoryboard(concept: string) {
  const res = await callFunction("generateStoryboard", { concept });
  return res.storyboard || res;
}

// ----------------------------------------------------
// 11) Brand Suggestions
// ----------------------------------------------------
export async function generateBrandSuggestions(niche: string) {
  const res = await callFunction("generateBrandSuggestions", { niche });
  return res.brands || [];
}

// ----------------------------------------------------
// 12) Analytics Report
// ----------------------------------------------------
export async function generateAnalyticsReport(data: any) {
  const res = await callFunction("generateAnalyticsReport", data);
  return res.report;
}

// ----------------------------------------------------
// 13) CRM Summary
// ----------------------------------------------------
export async function generateCRMSummary(history: any[]) {
  const res = await callFunction("generateCRMSummary", { history });
  return res.summary || res;
}
