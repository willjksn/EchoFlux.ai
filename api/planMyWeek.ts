import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { checkApiKeys } from "./_errorHandler.js";
import { verifyAuth } from "./verifyAuth.js";
import { canGenerateWeeklyPlan, recordWeeklyPlanGeneration } from "./_weeklyPlanUsage.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(200).json({
      success: false,
      error: "AI not configured",
      note: apiKeyCheck.error,
    });
    return;
  }

  const user = await verifyAuth(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Check weekly plan usage limit
  const usageCheck = await canGenerateWeeklyPlan(
    user.uid,
    user.plan || 'Free',
    user.role
  );

  if (!usageCheck.allowed) {
    res.status(200).json({
      success: false,
      error: "Usage limit reached",
      note: `You've reached your monthly limit of ${usageCheck.limit} weekly plan${usageCheck.limit === 1 ? '' : 's'}. Upgrade to Pro or Elite for more weekly plans.`,
    });
    return;
  }

  const { posts, events } = (req.body as any) || {};

  if (!Array.isArray(posts) || !Array.isArray(events)) {
    res.status(400).json({
      success: false,
      error: "Invalid payload",
      note: "Expected 'posts' and 'events' arrays in request body.",
    });
    return;
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey!);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(today.getDate() + 6);

    const windowPosts = posts.filter((p: any) => {
      if (!p.scheduledDate && !p.createdAt) return false;
      const dateStr = p.scheduledDate || p.createdAt;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      const day = new Date(d);
      day.setHours(0, 0, 0, 0);
      return day >= today && day <= sevenDaysFromNow;
    });

    const windowEvents = events.filter((e: any) => {
      if (!e.date) return false;
      const d = new Date(e.date);
      if (isNaN(d.getTime())) return false;
      const day = new Date(d);
      day.setHours(0, 0, 0, 0);
      return day >= today && day <= sevenDaysFromNow;
    });

    const prompt = `
You are the planning brain for EchoFlux.ai, an AI Content Studio & Campaign Planner for creators.

Task:
- Look at the creator's upcoming content for the next 7 days and propose a focused weekly plan
  that fills gaps and keeps a healthy mix of content (relationship, value, soft promo, hard promo).

Context JSON (existing planned content in the next 7 days):

POSTS:
${JSON.stringify(windowPosts, null, 2)}

CALENDAR EVENTS:
${JSON.stringify(windowEvents, null, 2)}

Output requirements:
- Return ONLY valid JSON in this exact structure:

{
  "suggestions": [
    {
      "date": "YYYY-MM-DD",
      "dayLabel": "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun",
      "theme": "short summary of the day's focus (e.g. 'Nurture audience', 'Soft promo', 'Storytelling reel')",
      "postIdea": "one clear post idea",
      "captionOutline": "1–3 bullet outline for the caption",
      "recommendedPlatforms": ["Instagram", "TikTok", "X", "YouTube", "OnlyFans", "Newsletter"],
      "suggestedTimeWindow": "e.g. 'evening', 'morning', or a rough hour range",
      "notes": "optional extra notes, like repurposing ideas or reminders to reuse assets"
    }
  ]
}

Guidelines:
- Prefer filling days that currently have no content scheduled.
- If some days already have content, you can skip them or add 1 complementary idea.
- Keep the number of suggestions between 5 and 10.
- Do NOT assume auto-posting; this is a planning pack the creator will copy and post manually.
`;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    const raw = result.response.text();

    let data: any;
    try {
      data = JSON.parse(raw.trim());
    } catch {
      const match =
        raw.match(/```json\s*([\s\S]*?)```/) ||
        raw.match(/```\s*([\s\S]*?)```/);
      if (match) {
        data = JSON.parse(match[1].trim());
      } else {
        throw new Error("Failed to parse AI response as JSON.");
      }
    }

    const suggestions: any[] = Array.isArray(data?.suggestions)
      ? data.suggestions
      : [];

    // Record usage after successful generation
    await recordWeeklyPlanGeneration(
      user.uid,
      user.plan || 'Free',
      user.role
    );

    res.status(200).json({
      success: true,
      suggestions,
      remaining: usageCheck.remaining - 1, // Subtract 1 since we just used one
    });
    return;
  } catch (err: any) {
    console.error("planMyWeek error:", err);
    res.status(200).json({
      success: false,
      error: "Failed to generate weekly plan",
      note: err?.message || "An unexpected error occurred while planning your week.",
    });
    return;
  }
}

export default handler;

