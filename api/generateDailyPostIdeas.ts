// api/generateDailyPostIdeas.ts - v7
// Instant "What to Post" ideas: 3 post ideas with optional regenerateAll or regenerateSingle (swap one card).
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getModelForTask, getModelNameForTask, getCostTierForTask } from "./_modelRouter.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { parseJSON } from "./_geminiShared.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { trackReplicateUsage } from "./trackModelUsage.js";

export interface DailyPostIdeaPayload {
  id: string;
  format: string;
  title: string;
  hook: string;
  shotList: string[];
  captionStarter?: string;
  cta?: string;
  hashtags: string[];
  whyThisWorks?: string;
  trendBased?: boolean;
  trendContext?: string;
  placeholderImage?: string;
  imageSource?: 'unsplash' | 'ai';
}

export interface GenerateDailyPostIdeasBody {
  platform?: string;
  goal?: string;
  effort?: number;
  format?: string;
  tone?: string;
  useTrends?: boolean;
  includeTrendContext?: boolean;
  spicyMode?: boolean;
  /** When set, regenerate only this idea (swap one card); otherwise generate 3 new ideas. */
  swapId?: string;
  /** Optional seed for deterministic swap (e.g. existing idea id). */
  seed?: string;
  /** When true and platform is Instagram, generate one idea per format (Reel, Carousel, Photo, Story). */
  generateAllFormats?: boolean;
  /** When true and platform is fan_hub/mypage, analyze engagement data to generate ideas. */
  analyzeMyPageEngagement?: boolean;
  /** Optional hint from creator to guide idea generation (e.g. "beach photos", "workout motivation"). */
  creatorHint?: string;
}

const CONTENT_POLICY = `
CONTENT POLICY (social media optimized):
- Generate ideas suitable for Instagram, Facebook, X (Twitter), and creator fan pages.
- Content can be edgy, bold, spicy, or use mild profanity - but NOT explicit adult content.
- Avoid OnlyFans-specific language (PPV, tips for explicit content, sexting services).
- Focus on engagement, personality, lifestyle, behind-the-scenes, and creator brand building.
- Ideas should drive followers, comments, and genuine connection - not explicit adult transactions.
`;

function buildPrompt(opts: {
  platform: string;
  goal: string;
  effort: number;
  format: string;
  tone: string;
  useTrends: boolean;
  spicyMode: boolean;
  creatorContext: string;
  trendContext: string;
  swapOnly: boolean;
  existingIdeasForContext?: DailyPostIdeaPayload[];
  toneSettings?: {
    formality?: number;
    humor?: number;
    empathy?: number;
    spiciness?: number;
    profanity?: number;
    emojiLevel?: number;
  };
  generateAllFormats?: boolean;
  analyzeMyPageEngagement?: boolean;
  fanHubAnalytics?: {
    topPostTypes?: string[];
    avgLikes?: number;
    avgComments?: number;
    topEngagementTimes?: string[];
    recentTips?: number;
  };
  creatorGender?: string;
  targetAudienceGender?: string;
  creatorHint?: string;
}): string {
  const {
    platform,
    goal,
    effort,
    format,
    tone,
    useTrends,
    spicyMode,
    creatorContext,
    trendContext,
    swapOnly,
    existingIdeasForContext,
    toneSettings,
  } = opts;

  const goalGuidance =
    goal === "reach"
      ? "Prioritize discoverability and shareability (hooks, trends, broad appeal)."
      : goal === "engagement"
      ? "Prioritize comments, saves, and DMs (questions, polls, relatable moments)."
      : goal === "followers"
      ? "Balance reach and follow-worthy value; include clear follow triggers."
      : "Prioritize link clicks, DMs, or product/service interest where relevant.";

  const effortGuidance =
    effort <= 5
      ? "Quick, low-effort ideas (single photo, short clip, simple text)."
      : effort <= 15
      ? "Medium effort: reels, carousels, or short series (15 min–1 hr)."
      : "Higher effort: polished reels, multi-slide carousels, or planned series.";

  // Platform-specific format guidance
  const platformFormatGuidance = platform === "fan_hub"
    ? "For My Page/Fan Hub: Generate ideas using formats: 'photo', 'video', 'text', or 'poll'. These are NOT Instagram formats - avoid 'reel', 'carousel', 'story'. Focus on feed posts that engage your fan community."
    : platform === "twitter"
    ? "For X/Twitter: Generate ideas using formats: 'tweet', 'thread', 'poll', or 'video'. Focus on concise, punchy content."
    : platform === "facebook"
    ? "For Facebook: Generate ideas using formats: 'photo', 'video', 'post', or 'live'. Focus on shareable, community-building content."
    : "";

  const formatGuidance =
    format === "auto"
      ? platform === "fan_hub"
        ? "Generate 3 varied ideas using My Page formats: photo posts, video posts, text updates, or polls. NO Instagram-specific formats."
        : platform === "twitter"
        ? "Generate 3 varied X/Twitter ideas: tweets, threads, polls, or short videos."
        : (opts as any).generateAllFormats
        ? "Generate exactly 4 ideas, ONE for each format: 1 Reel, 1 Carousel, 1 Photo, 1 Story. Each must be clearly suited to its format."
        : "Generate a mix: e.g. 2 reels + 1 carousel, or 1 reel + 1 photo + 1 story, varied and scannable."
      : `Prefer format: ${format}. All ideas should be clearly ${format}-friendly.`;

  // Build tone style guidance from settings
  const toneStyleGuidance = toneSettings ? `
WRITING STYLE PREFERENCES:
${toneSettings.formality !== undefined ? `- Formality (${toneSettings.formality}/100): ${toneSettings.formality < 30 ? 'Very casual, use slang' : toneSettings.formality < 50 ? 'Casual and conversational' : toneSettings.formality < 70 ? 'Balanced tone' : 'Professional and polished'}` : ''}
${toneSettings.humor !== undefined ? `- Humor (${toneSettings.humor}/100): ${toneSettings.humor < 30 ? 'Serious, minimal humor' : toneSettings.humor < 50 ? 'Light occasional humor' : toneSettings.humor < 70 ? 'Witty and playful' : 'Very funny, comedic'}` : ''}
${toneSettings.empathy !== undefined ? `- Warmth (${toneSettings.empathy}/100): ${toneSettings.empathy < 30 ? 'Direct and straightforward' : toneSettings.empathy < 50 ? 'Friendly' : toneSettings.empathy < 70 ? 'Warm and understanding' : 'Very supportive'}` : ''}
${toneSettings.profanity !== undefined && toneSettings.profanity > 0 ? `- Profanity (${toneSettings.profanity}/100): ${toneSettings.profanity < 30 ? 'Very mild swearing OK' : toneSettings.profanity < 50 ? 'Moderate casual swearing' : 'Frequent swearing acceptable'}` : '- Keep language clean, no swearing'}
${toneSettings.emojiLevel !== undefined ? `- Emoji usage (${toneSettings.emojiLevel}/100): ${toneSettings.emojiLevel < 20 ? 'No emojis' : toneSettings.emojiLevel < 40 ? 'Minimal emojis (1-2)' : toneSettings.emojiLevel < 60 ? 'Moderate emojis' : 'Heavy emoji usage'}` : ''}
` : '';

  const ideaCount = swapOnly ? "ONE" : opts.generateAllFormats ? "exactly 4 (one per format: Reel, Carousel, Photo, Story)" : "exactly 3";
  
  // Creator profile guidance for gender-appropriate content
  const creatorProfileGuidance = (opts.creatorGender || opts.targetAudienceGender) ? `
CREATOR PROFILE (CRITICAL - follow strictly):
${opts.creatorGender ? `- The creator is: ${opts.creatorGender}` : ''}
${opts.targetAudienceGender ? `- Target audience: ${opts.targetAudienceGender === 'Male' ? 'Men' : opts.targetAudienceGender === 'Female' ? 'Women' : opts.targetAudienceGender === 'Both' ? 'Both men and women' : 'All audiences'}` : ''}

IMPORTANT RULES:
${opts.creatorGender === 'Female' && opts.targetAudienceGender === 'Male' ? `- Generate content ideas featuring the FEMALE creator appealing to MALE audience
- Ideas should show HER (the creator): bikini photos, lingerie looks, selfies, body shots, behind-the-scenes of her content
- Do NOT suggest photos of men or content featuring men
- Focus on feminine aesthetics, curves, confidence, seduction, flirtation aimed at male viewers` : ''}
${opts.creatorGender === 'Male' && opts.targetAudienceGender === 'Female' ? `- Generate content ideas featuring the MALE creator appealing to FEMALE audience
- Ideas should show HIM (the creator): shirtless photos, gym content, suits, confidence poses
- Do NOT suggest photos of women or content featuring women
- Focus on masculine aesthetics, physique, charm, romance aimed at female viewers` : ''}
${opts.creatorGender === 'Female' && opts.targetAudienceGender === 'Female' ? `- Generate content ideas featuring the FEMALE creator appealing to FEMALE audience
- Ideas should show HER: confidence, beauty, lifestyle, behind-the-scenes, relatability
- Focus on aesthetics that appeal to women viewers` : ''}
${opts.creatorGender === 'Male' && opts.targetAudienceGender === 'Male' ? `- Generate content ideas featuring the MALE creator appealing to MALE audience
- Ideas should show HIM: physique, fitness, lifestyle, confidence
- Focus on aesthetics that appeal to male viewers` : ''}
${opts.creatorGender === 'Couple' ? `- Generate content ideas featuring BOTH partners
- Ideas should show the couple together: couple content, duo shots, relationship moments
- Appeal to the specified target audience` : ''}
` : '';
  
  // Fan Hub / My Page specific guidance
  const fanHubGuidance = opts.platform === "fan_hub" && opts.fanHubAnalytics ? `
FAN HUB ANALYTICS CONTEXT:
- Your top performing post types: ${opts.fanHubAnalytics.topPostTypes?.join(", ") || "varied content"}
- Average likes per post: ${opts.fanHubAnalytics.avgLikes || "N/A"}
- Average comments per post: ${opts.fanHubAnalytics.avgComments || "N/A"}
- Best engagement times: ${opts.fanHubAnalytics.topEngagementTimes?.join(", ") || "varies"}
- Recent tip activity: ${opts.fanHubAnalytics.recentTips || 0} tips this week

Generate ideas that mirror your top-performing content patterns. Focus on what drives engagement, tips, and subscriber retention.
` : "";

  // Add randomness seed to ensure unique ideas each time
  const uniqueSeed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  return `You are a content strategist for social creators. Generate ${ideaCount} FRESH, UNIQUE post ideas for today.

UNIQUENESS REQUIREMENT (CRITICAL):
- Session ID: ${uniqueSeed}
- EVERY idea must be completely NEW and DIFFERENT from anything you've generated before
- DO NOT repeat common/generic ideas like "behind the scenes", "day in my life", "Q&A" unless given a unique creative spin
- Be CREATIVE and SPECIFIC - avoid generic templates
- Each title, hook, and caption must be ORIGINAL and FRESH
- Think of angles, themes, and concepts that feel NEW and UNEXPECTED

PLATFORM: ${platform}
GOAL: ${goal}. ${goalGuidance}
EFFORT (minutes): ${effort}. ${effortGuidance}
PREFERRED FORMAT: ${format}. ${formatGuidance}
${platformFormatGuidance}
TONE: ${tone}. Keep hooks and copy in this voice.
${spicyMode ? "Creator allows slightly bolder/sexier framing (still non-explicit per policy)." : "Keep content family-friendly and broadly safe."}
${toneStyleGuidance}
${CONTENT_POLICY}

${creatorContext ? `CREATOR CONTEXT (use to tailor ideas):\n${creatorContext}\n` : "No creator profile provided; use broad, relatable angles."}
${creatorProfileGuidance}
${opts.creatorHint ? `
CREATOR'S IDEA DIRECTION (IMPORTANT - incorporate this):
The creator wants ideas related to: "${opts.creatorHint}"
Generate ideas that incorporate this theme/direction while still being unique and fresh.
` : ""}
${useTrends && trendContext ? `TRENDS / CONTEXT (use where relevant):\n${trendContext}\n` : ""}
${fanHubGuidance}

${existingIdeasForContext?.length ? `EXISTING IDEAS (DO NOT DUPLICATE - generate completely different ideas):\n${existingIdeasForContext.map((i) => `${i.title}: ${i.hook}`).join("\n")}\n` : ""}

OUTPUT STRICT JSON ONLY (no markdown, no code fence):
{
  "ideas": [
    {
      "id": "idea_<short_unique_id>",
      "format": "${platform === "fan_hub" ? "photo | video | text | poll" : platform === "twitter" ? "tweet | thread | poll | video" : "reel | carousel | photo | story | mixed"}",
      "title": "Short punchy title (3-6 words)",
      "hook": "One sentence that grabs attention (first line of caption)",
      "shotList": ["Shot/scene 1", "Shot 2", "Shot 3", "..."],
      "captionStarter": "Optional 1-2 sentence caption start",
      "cta": "Optional call-to-action line",${platform === "fan_hub" ? "" : `
      "hashtags": ["#tag1", "#tag2", "..."],`}
      "whyThisWorks": "One sentence on why this fits the goal/platform",
      "trendBased": true/false,
      "trendContext": "Brief 5-10 word description of the trend this capitalizes on (only if trendBased is true)"
    }
  ]
}

Rules: shotList must have 3-5 items. id must be unique.${platform === "fan_hub" ? " DO NOT include hashtags for My Page/Fan Hub content." : ""} If generating one (swap), return one idea in ideas array.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authUser = await verifyAuth(req);
  if (!authUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "generateDailyPostIdeas",
    limit: 30,
    windowMs: 60_000,
    identifier: authUser.uid,
  });
  if (!ok) return;

  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(authUser.uid).get();
  const userData = userDoc.exists ? userDoc.data() : {};
  const creatorPersonality = userData?.creatorPersonality || "";
  const toneFromProfile = userData?.aiTone || userData?.tone || "";
  const niche = userData?.niche || "";
  // Get user's tone settings for style preferences
  const userToneSettings = userData?.settings?.tone || {};
  // Get creator profile for gender-aware content generation
  const creatorGender = userData?.creatorGender || "";
  const targetAudienceGender = userData?.targetAudienceGender || "";

  const {
    platform = "instagram",
    goal = "balanced_followers_engagement",
    effort = 15,
    format = "auto",
    tone,
    useTrends = false,
    spicyMode = false,
    swapId,
    seed,
    generateAllFormats = false,
    analyzeMyPageEngagement = false,
    creatorHint = "",
  } = (req.body || {}) as GenerateDailyPostIdeasBody;

  // Map balanced_followers_engagement to goal with engagement bias
  const mappedGoal =
    goal === "balanced_followers_engagement"
      ? "followers"
      : goal === "sales_subs"
      ? "sales_subs"
      : goal;

  const effectiveTone = tone || toneFromProfile || "relatable";
  const creatorContext = [creatorPersonality, niche].filter(Boolean).join("\n");

  let trendContext = "";
  if (useTrends) {
    try {
      const trendRes = await fetch(
        `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}/api/getTrendingContext`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: (req.headers.authorization as string) || "",
          },
          body: JSON.stringify({ niche: niche || "lifestyle", platforms: [platform] }),
        }
      );
      if (trendRes.ok) {
        const data = await trendRes.json();
        trendContext = data.trendContext || "";
      }
    } catch (e) {
      console.warn("Trends fetch failed:", e);
    }
  }

  const swapOnly = Boolean(swapId);
  let existingIdeas: DailyPostIdeaPayload[] = [];
  if (swapOnly && Array.isArray((req.body as any)?.existingIdeas)) {
    existingIdeas = (req.body as any).existingIdeas;
  }

  try {
    // For My Page / Fan Hub, fetch analytics data
    let fanHubAnalytics = undefined;
    if (platform === "fan_hub" && analyzeMyPageEngagement) {
      try {
        const postsSnap = await db.collection("creators").doc(authUser.uid).collection("fanPosts")
          .orderBy("createdAt", "desc").limit(20).get();
        
        let totalLikes = 0;
        let totalComments = 0;
        const postTypes: Record<string, number> = {};
        
        postsSnap.forEach((doc) => {
          const data = doc.data();
          totalLikes += data.likes || 0;
          totalComments += data.commentsCount || 0;
          const type = data.mediaType || "text";
          postTypes[type] = (postTypes[type] || 0) + 1;
        });
        
        const postCount = postsSnap.size || 1;
        const topTypes = Object.entries(postTypes)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([t]) => t);
        
        // Get recent tips count
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const tipsSnap = await db.collection("purchases")
          .where("creatorId", "==", authUser.uid)
          .where("type", "==", "tip")
          .where("createdAt", ">=", weekAgo.toISOString())
          .get();
        
        fanHubAnalytics = {
          topPostTypes: topTypes,
          avgLikes: Math.round(totalLikes / postCount),
          avgComments: Math.round(totalComments / postCount),
          topEngagementTimes: ["evenings", "weekends"],
          recentTips: tipsSnap.size,
        };
      } catch (e) {
        console.warn("Failed to fetch fan hub analytics:", e);
      }
    }

    const model = await getModelForTask("strategy", authUser.uid);
    const prompt = buildPrompt({
      platform,
      goal: mappedGoal,
      effort,
      format,
      tone: effectiveTone,
      useTrends,
      spicyMode: Boolean(spicyMode),
      creatorContext,
      trendContext,
      swapOnly,
      existingIdeasForContext: existingIdeas,
      toneSettings: userToneSettings,
      generateAllFormats: Boolean(generateAllFormats),
      analyzeMyPageEngagement: Boolean(analyzeMyPageEngagement),
      fanHubAnalytics,
      creatorGender,
      targetAudienceGender,
      creatorHint,
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: seed ? 0.6 : 0.8,
      },
    });

    const raw = result.response.text().trim();
    let parsed: { ideas: DailyPostIdeaPayload[] };
    try {
      parsed = parseJSON(raw) as { ideas: DailyPostIdeaPayload[] };
    } catch (e) {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned || "{}");
    }

    let ideas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];
    
    // Generate placeholder image URL using Picsum (fallback only)
    const getPlaceholderImage = (index: number): string => {
      const seed = Date.now() + index * 137;
      return `https://picsum.photos/seed/${seed}/600/600`;
    };
    
    // Build image prompt that matches the content idea
    const buildImagePrompt = (idea: any, hint?: string): string => {
      const title = idea.title || "";
      const shotList = idea.shotList || [];
      
      // Start with creator hint if provided - this is the most relevant context
      let mainSubject = hint ? hint.trim() : "";
      
      // Fallback to extracting subject from title/shotList if no hint
      if (!mainSubject) {
        // Extract the core concept from title or first shot
        const titleLower = title.toLowerCase();
        if (titleLower.includes('beach')) mainSubject = "beach scene, ocean, sand, tropical setting";
        else if (titleLower.includes('pool')) mainSubject = "poolside scene, water, summer vibes";
        else if (titleLower.includes('bikini')) mainSubject = "beach/pool aesthetic, summer fashion";
        else if (titleLower.includes('lingerie') || titleLower.includes('bedroom')) mainSubject = "cozy bedroom aesthetic, soft lighting, intimate setting";
        else if (titleLower.includes('gym') || titleLower.includes('fitness') || titleLower.includes('workout')) mainSubject = "gym environment, fitness equipment, energetic atmosphere";
        else if (titleLower.includes('morning') || titleLower.includes('routine')) mainSubject = "morning light, cozy home interior";
        else if (titleLower.includes('cooking') || titleLower.includes('food') || titleLower.includes('kitchen')) mainSubject = "kitchen scene, cooking, delicious food";
        else if (titleLower.includes('selfie') || titleLower.includes('mirror')) mainSubject = "mirror selfie aesthetic, ring light, bedroom or bathroom";
        else if (titleLower.includes('travel') || titleLower.includes('vacation')) mainSubject = "travel destination, scenic landscape";
        else if (titleLower.includes('outfit') || titleLower.includes('fashion') || titleLower.includes('style')) mainSubject = "fashion photoshoot, stylish outfit";
        else if (shotList.length > 0) mainSubject = shotList[0];
        else mainSubject = title;
      }
      
      // Build a descriptive prompt that will generate relevant imagery
      const subjectPerson = creatorGender === 'Female' 
        ? "beautiful woman, feminine, attractive" 
        : creatorGender === 'Male' 
        ? "handsome man, masculine, attractive"
        : "attractive person";
      
      return `Professional social media photo of ${subjectPerson} - ${mainSubject}. Style: high quality photography, Instagram aesthetic, professional lighting, lifestyle content, no text or watermarks, photorealistic.`;
    };
    
    // Check if Replicate is configured
    const replicateApiToken = process.env.REPLICATE_API_TOKEN;
    const useAIImages = replicateApiToken && process.env.DISABLE_AI_IMAGES !== "true";
    
    console.log('[generateDailyPostIdeas] Image generation config:', {
      hasReplicateToken: !!replicateApiToken,
      useAIImages,
      creatorGender,
      targetAudienceGender,
      creatorHint: creatorHint || '(none)',
    });
    
    // Process ideas with images - sequential to avoid rate limits
    const processedIdeas: typeof ideas = [];
    
    // Initialize Replicate once if available
    let replicate: any = null;
    if (useAIImages) {
      try {
        const Replicate = (await import("replicate")).default;
        replicate = new Replicate({ auth: replicateApiToken });
      } catch (e) {
        console.error('[generateDailyPostIdeas] Failed to initialize Replicate:', e);
      }
    }
    
    for (let index = 0; index < ideas.length; index++) {
      const idea = ideas[index];
      const baseIdea = {
        ...idea,
        id: idea.id || `idea_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        shotList: Array.isArray(idea.shotList) ? idea.shotList : [],
        hashtags: Array.isArray(idea.hashtags) ? idea.hashtags : [],
      };
      
      // Use Replicate FLUX Schnell for fast image generation (~$0.003/image, ~1-2 sec)
      if (replicate) {
        try {
          const imagePrompt = buildImagePrompt(idea, creatorHint);
          
          // Using FLUX Schnell - fastest model, ~1-2 seconds, $0.003/image
          console.log(`[generateDailyPostIdeas] v7 - Generating image ${index + 1}/${ideas.length} with FLUX Schnell`);
          console.log(`[generateDailyPostIdeas] v7 - Prompt: ${imagePrompt}`);
          
          // Add delay between requests to avoid rate limiting (except for first)
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          const output = await replicate.run(
            "black-forest-labs/flux-schnell",
            {
              input: {
                prompt: imagePrompt,
                go_fast: true,
                num_outputs: 1,
                aspect_ratio: "1:1",
                output_format: "webp",
                output_quality: 80,
                num_inference_steps: 4, // Schnell uses fewer steps
              }
            }
          );
          
          console.log('[generateDailyPostIdeas] v7 - FLUX Schnell output:', typeof output, Array.isArray(output) ? `array[${output.length}]` : 'not array');
          
          let imageUrl: string | null = null;
          
          // Handle different output formats from Replicate
          if (Array.isArray(output) && output.length > 0) {
            const firstItem = output[0];
            if (typeof firstItem === 'string' && firstItem.startsWith('http')) {
              imageUrl = firstItem;
            } else if (firstItem && typeof firstItem === 'object') {
              // Could be a FileOutput object with url property
              const fileOutput = firstItem as any;
              if (fileOutput.url && typeof fileOutput.url === 'string') {
                imageUrl = fileOutput.url;
              } else if (fileOutput.href && typeof fileOutput.href === 'string') {
                imageUrl = fileOutput.href;
              }
            }
          } else if (typeof output === 'string' && output.startsWith('http')) {
            imageUrl = output;
          } else if (output && typeof output === 'object') {
            // Handle single FileOutput object
            const fileOutput = output as any;
            if (fileOutput.url && typeof fileOutput.url === 'string') {
              imageUrl = fileOutput.url;
            }
          }
          
          console.log('[generateDailyPostIdeas] v7 - Extracted URL:', imageUrl ? imageUrl.slice(0, 80) + '...' : 'null');
          
          if (imageUrl) {
            // Track successful Replicate usage (don't await, fire and forget)
            trackReplicateUsage(authUser.uid, 1, true).catch(() => {});
            processedIdeas.push({
              ...baseIdea,
              placeholderImage: imageUrl,
              imageSource: 'ai' as const,
            });
            continue;
          } else {
            console.log('[generateDailyPostIdeas] v7 - Could not extract URL from output:', JSON.stringify(output).slice(0, 200));
          }
        } catch (e: any) {
          console.error(`[generateDailyPostIdeas] v7 - Replicate failed for idea ${index + 1}:`, e?.message || e);
          // Track failed usage (don't await)
          trackReplicateUsage(authUser.uid, 1, false, String(e?.message || e)).catch(() => {});
        }
      } else if (useAIImages) {
        console.log(`[generateDailyPostIdeas] v7 - Replicate not initialized, using placeholder`);
      }
      
      // Fallback to placeholder image if AI fails or is disabled
      processedIdeas.push({
        ...baseIdea,
        placeholderImage: getPlaceholderImage(index),
        imageSource: 'unsplash' as const,
      });
    }
    
    ideas = processedIdeas as DailyPostIdeaPayload[];

    if (ideas.length === 0) {
      res.status(200).json({ success: false, error: "No ideas generated", ideas: [] });
      return;
    }

    res.status(200).json({
      success: true,
      ideas,
      settings: {
        platform,
        goal: mappedGoal,
        effort,
        format,
        tone: effectiveTone,
        useTrends,
      },
    });
  } catch (error: any) {
    console.error("generateDailyPostIdeas error:", error);
    res.status(500).json({
      error: error?.message || "Failed to generate ideas",
      note: "Please try again.",
    });
  }
}
