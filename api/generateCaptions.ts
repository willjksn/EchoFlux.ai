// api/generateCaptions.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  checkApiKeys,
  getVerifyAuth,
  getModelRouter,
  withErrorHandling,
} from "./_errorHandler.js";
import { getGoalFramework, getGoalSpecificCTAs } from "./_goalFrameworks.js";
import { getLatestTrends, getOnlyFansWeeklyTrends } from "./_trendsHelper.js";
import { getOnlyFansResearchContext } from "./_onlyfansResearch.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { getEmojiInstructions, getEmojiExamplesForTone } from "./_emojiHelper.js";
import { sanitizeForAI } from "./_inputSanitizer.js";

async function getGeminiShared() {
  try {
    const module = await import("./_geminiShared.js");
    return { getModel: module.getModel, parseJSON: module.parseJSON };
  } catch (importError: any) {
    console.error("Failed to import _geminiShared:", importError);
    throw new Error(
      `Failed to load Gemini module: ${importError?.message || String(importError)}`
    );
  }
}

type MediaData = { data: string; mimeType: string };
type CaptionResult = { caption: string; hashtags: string[] };

// Sleep helper
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry wrapper for Gemini API with comprehensive error handling
async function generateWithRetry(
  model: any,
  request: any,
  maxRetries: number = 3,
  isVideo: boolean = false
) {
  let lastError;
  const baseDelayMs = isVideo ? 3000 : 2000; // Longer delay for videos

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await model.generateContent(request);
    } catch (err: any) {
      lastError = err;
      const status = err?.status;
      const msg = err?.message?.toLowerCase() || "";
      const errorCode = err?.code;

      // Check for retryable errors
      const is429 =
        status === 429 ||
        msg.includes("too many requests") ||
        msg.includes("429") ||
        errorCode === 429;

      const isTimeout =
        status === 408 ||
        msg.includes("timeout") ||
        msg.includes("timed out") ||
        msg.includes("deadline exceeded") ||
        errorCode === 408 ||
        errorCode === 504;

      const isNetworkError =
        msg.includes("fetch") ||
        msg.includes("network") ||
        msg.includes("connection") ||
        msg.includes("econnreset") ||
        msg.includes("enotfound") ||
        errorCode === "ECONNRESET" ||
        errorCode === "ENOTFOUND" ||
        errorCode === "ETIMEDOUT";

      const isServerError =
        status >= 500 ||
        status === 503 ||
        status === 502 ||
        status === 504 ||
        errorCode === 503 ||
        errorCode === 502 ||
        errorCode === 504;

      // Retry on retryable errors
      const shouldRetry =
        (is429 || isTimeout || isNetworkError || isServerError) &&
        attempt < maxRetries;

      if (!shouldRetry) {
        throw err;
      }

      // Calculate delay with exponential backoff
      let delayMs = baseDelayMs * Math.pow(2, attempt);

      // Adjust delay if Gemini suggests "retry in Xs"
      const retryMatch = /retry in ([0-9.]+)s/i.exec(err?.message || "");
      if (retryMatch && !isNaN(Number(retryMatch[1]))) {
        delayMs = Number(retryMatch[1]) * 1000;
      }

      // Cap delay at 30 seconds
      delayMs = Math.min(delayMs, 30000);

      const errorType = is429
        ? "rate-limited"
        : isTimeout
        ? "timeout"
        : isNetworkError
        ? "network error"
        : "server error";

      console.warn(
        `Gemini ${errorType} (${status || errorCode || "unknown"}). Attempt ${attempt + 1}/${maxRetries + 1}. Retrying in ${(delayMs / 1000).toFixed(1)}s...`
      );

      await sleep(delayMs);
    }
  }

  // If we get here, all retries failed
  throw lastError;
}

// Convert external image/video URL → inlineData
async function fetchMediaFromUrl(mediaUrl: string): Promise<MediaData | null> {
  try {
    const mediaRes = await fetch(mediaUrl);
    if (!mediaRes.ok) {
      console.error("Failed to fetch media:", mediaUrl, mediaRes.status);
      return null;
    }

    const mimeType = mediaRes.headers.get("content-type") || "image/jpeg";
    const arr = await mediaRes.arrayBuffer();
    return { data: Buffer.from(arr).toString("base64"), mimeType };
  } catch (error) {
    console.error("Error fetching media:", error);
    return null;
  }
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Check API key
  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(200).json([
      {
        caption:
          apiKeyCheck.error ||
          "AI captioning not available (missing AI API key).",
        hashtags: [],
      },
    ]);
    return;
  }

  // Verify Firebase Auth Token
  let authUser;
  try {
    const verifyAuth = await getVerifyAuth();
    authUser = await verifyAuth(req);
  } catch (authError: any) {
    console.error("Auth error:", authError);
    res.status(200).json([
      {
        caption: authError?.message || "Authentication failed.",
        hashtags: [],
      },
    ]);
    return;
  }

  if (!authUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Rate limiting: 10 requests per minute per user
  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "generateCaptions",
    limit: 10,
    windowMs: 60_000,
    identifier: authUser.uid,
  });
  if (!ok) return;

  // Fetch user's plan and role from Firestore
  let userPlan = 'Free';
  let userRole: string | undefined;
  try {
    const { getAdminDb } = await import("./_firebaseAdmin.js");
    const db = getAdminDb();
    const userDoc = await db.collection("users").doc(authUser.uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      userPlan = userData?.plan || 'Free';
      userRole = userData?.role;
    }
  } catch (error) {
    console.error("Failed to fetch user plan:", error);
    // Continue with default Free plan
  }

  const {
    mediaUrl,
    mediaUrls,
    mediaData,
    goal,
    tone,
    promptText,
    platforms, // Array of selected platforms for platform-specific hashtags
    emojiEnabled,
    emojiIntensity,
  }: {
    mediaUrl?: string;
    mediaUrls?: string[];
    mediaData?: MediaData;
    goal?: string;
    tone?: string;
    promptText?: string;
    platforms?: string[]; // Selected platforms for hashtag generation
    emojiEnabled?: boolean;
    emojiIntensity?: number;
  } = req.body || {};
  
  // Sanitize text inputs
  const sanitizedPromptText = promptText ? sanitizeForAI(promptText, 2000) : undefined;
  const sanitizedTone = tone ? sanitizeForAI(tone, 100) : undefined;
  const sanitizedGoal = goal ? sanitizeForAI(goal, 100) : undefined;
  
  // Normalize tone value for consistent detection
  const normalizedTone = sanitizedTone?.toLowerCase().trim();
  
  // Detect explicit content context - ONLY for truly explicit tones, NOT "sexy/bold"
  // "Sexy / Bold" should be suggestive but NOT explicit, and should NOT generate OnlyFans hashtags
  const isExplicitContent =
    normalizedTone === 'explicit/adult content' ||
    normalizedTone === 'explicit' ||
    normalizedTone === 'sexy / explicit' ||
    normalizedTone === 'sexy-explicit' ||
    normalizedTone === 'sex-explicit' ||
    normalizedTone === 'erotic' ||
    normalizedTone === 'raw/uncensored' ||
    normalizedTone === 'raw-uncensored' ||
    normalizedTone === 'provocative' ||
    normalizedTone === 'dominant' ||
    normalizedTone === 'submissive' ||
    tone === 'Sexy / Explicit' || // Keep original case check for backwards compatibility
    tone === 'Explicit';
  
  // NEVER generate OnlyFans hashtags in compose - OnlyFans has its own studio
  // OnlyFans platform is hidden in compose, so it should never be selected here
  // Even if somehow OnlyFans is in the platforms array, don't generate OnlyFans hashtags
  const shouldGenerateOnlyFansHashtags = false; // Always false - OnlyFans content belongs in OnlyFans Studio, not compose

  // Model selection
  let model;
  try {
    const getModelForTask = await getModelRouter();
    model = await getModelForTask("caption", authUser.uid);
  } catch (err: any) {
    console.error("Model init error:", err);
    res.status(200).json([
      {
        caption:
          err?.message || "AI model failed to initialize. Check configuration.",
        hashtags: [],
      },
    ]);
    return;
  }

  // Attach image/video if provided
  // Prefer mediaUrl over mediaData to avoid payload size limits
  let finalMedia: MediaData | undefined;
  let finalMediaList: MediaData[] = [];

  const normalizedMediaUrls = Array.isArray(mediaUrls)
    ? mediaUrls
        .map((u) => (typeof u === "string" ? u.trim() : ""))
        .filter(Boolean)
        .slice(0, 6)
    : [];

  if (normalizedMediaUrls.length > 0) {
    // Carousel: fetch each media item
    for (const u of normalizedMediaUrls) {
      const fetched = await fetchMediaFromUrl(u);
      if (fetched) finalMediaList.push(fetched);
    }
  } else if (mediaUrl) {
    // Always use URL if available (avoids payload size issues)
    const fetched = await fetchMediaFromUrl(mediaUrl);
    if (fetched) finalMedia = fetched;
  } else if (mediaData?.data && mediaData?.mimeType) {
    // Only use mediaData if no URL provided (for backwards compatibility)
    // Check size - videos can be larger, images have stricter limits
    const dataSizeMB = (mediaData.data.length * 3) / 4 / 1024 / 1024;
    const isVideoFile = mediaData.mimeType.startsWith('video/');
    const maxSizeMB = isVideoFile ? 20 : 4; // Videos can be up to 20MB, images 4MB
    
    if (dataSizeMB > maxSizeMB) {
      res.status(413).json({
        error: isVideoFile ? "Video too large" : "Image too large",
        note: `Please upload ${isVideoFile ? 'videos' : 'images'} smaller than ${maxSizeMB}MB or use a URL instead.`,
      });
      return;
    }
    finalMedia = mediaData;
  }

  // Detect if media is video or image (after finalMedia is determined)
  const isCarousel = finalMediaList.length > 1;
  
  // Improved video detection - check mimeType more thoroughly
  const isVideo =
    (finalMedia?.mimeType?.startsWith("video/") || false) ||
    (finalMediaList.some((m) => m.mimeType?.startsWith("video/")) || false) ||
    // Also check if mediaUrl contains video file extensions as fallback
    (mediaUrl && /\.(mp4|mov|avi|wmv|flv|webm|mkv|m4v)$/i.test(mediaUrl)) ||
    (normalizedMediaUrls.some((u) => /\.(mp4|mov|avi|wmv|flv|webm|mkv|m4v)$/i.test(u)));
  
  // Log video detection for debugging
  if (isVideo) {
    console.log('[generateCaptions] Video detected:', {
      mimeType: finalMedia?.mimeType,
      mediaUrl,
      isCarousel,
    });
  }

  // Determine platform for context (if OnlyFans)
  const isOnlyFansPlatform =
    Array.isArray(platforms) &&
    platforms.some((p) => String(p).toLowerCase().trim() === "onlyfans");
  const targetPlatform = isOnlyFansPlatform ? "OnlyFans" : null;

  // Build explicit content context - only for truly explicit content
  const explicitContext = isExplicitContent ? `
CRITICAL CONTEXT - EXPLICIT/ADULT CONTENT PLATFORM:
- This caption is for an adult content platform (creator monetization platform)${targetPlatform ? ` (${targetPlatform})` : ''}
- TONE REQUIREMENT: When tone is "Sexy / Explicit" or "Explicit", you MUST generate EXPLICIT, ADULT-ORIENTED captions
- NO CENSORSHIP: Generate truly explicit captions with bold, direct, adult language - not suggestive or implied, but explicitly descriptive
- ANALYZE THE ACTUAL MEDIA CONTENT: Look at what's actually shown in the image/video
- Create explicit captions that DESCRIBE what's visually shown, not generic subscription prompts
- Captions must be EXPLICIT, DETAILED, and DESCRIPTIVE of sexual/explicit content in the media - use explicit adult language
- Use BOLD, DIRECT, EXPLICIT language describing sexual/explicit/intimate content - be EXPLICITLY DESCRIPTIVE, not suggestive or implied
- Make captions specific to what's in the image/video - describe the scene, mood, action, or content shown
- Captions should be explicit and adult-oriented, describing what viewers are seeing in detail
- Avoid generic phrases - instead, describe EXPLICIT/SEXUAL content shown with EXPLICIT, BOLD language and make it enticing
- Include subtle monetization hints naturally, but focus on describing the actual explicit content
- Platform mentions: For descriptive captions, avoid platform names. For sales/monetization captions, can include ${targetPlatform || 'platform name'} when it makes sense naturally (e.g., "Join my ${targetPlatform || 'page'}", "Subscribe on ${targetPlatform || 'my platform'}")
- Focus on creating desire through explicit, descriptive language about what's shown
${shouldGenerateOnlyFansHashtags ? '- HASHTAGS MUST BE EXPLICIT AND MATCH THE CAPTION: Use bold, adult-oriented hashtags that describe the explicit/intimate content shown (e.g., #intimate, #sensual, #boudoir, #explicit, #adultcontent, etc.)' : '- HASHTAGS: Use appropriate hashtags for the content, but DO NOT use OnlyFans-specific hashtags, explicit adult content hashtags, or platform-specific adult content hashtags. Keep hashtags appropriate for general social media platforms.'}
` : '';

  // Get goal-specific framework and current trends
  // Always fetch trends from weekly Tavily updates (even for "engagement" goal)
  let goalContext = '';
  let currentTrends = '';
  let onlyfansResearch = '';
  
  // Always get latest trends from weekly Tavily job (no Tavily calls needed here)
  try {
    // If this is OnlyFans, prefer OnlyFans-filtered weekly trends for relevance.
    currentTrends = isOnlyFansPlatform ? await getOnlyFansWeeklyTrends() : await getLatestTrends();
  } catch (error) {
    console.error('[generateCaptions] Error fetching trends:', error);
    currentTrends = 'Trend data unavailable. Using general best practices.';
  }
  
  // Get OnlyFans-specific research if OnlyFans platform is detected
  if (isOnlyFansPlatform) {
    try {
      const { getAdminDb } = await import("./_firebaseAdmin.js");
      const db = getAdminDb();
      const userDoc = await db.collection("users").doc(authUser.uid).get();
      const userData = userDoc.data();
      const userPlan = userData?.plan || 'Free';
      const userRole = userData?.role;
      
      onlyfansResearch = await getOnlyFansResearchContext(
        'Subscribers', // Default audience for OnlyFans
        goal || 'Engagement',
        authUser.uid,
        userPlan,
        userRole
      );
      console.log('[generateCaptions] OnlyFans research context fetched');
    } catch (error) {
      console.error('[generateCaptions] Error fetching OnlyFans research:', error);
      // Continue without OnlyFans research - not critical
    }
  }
  
  // Get goal-specific framework if a specific goal is provided
  if (goal && goal !== "engagement") {
    goalContext = getGoalFramework(goal);
  }

  const onlyFansPlatformContext = isOnlyFansPlatform
    ? `
ONLYFANS MODE (STRICT):
- This caption is for OnlyFans ONLY (not Instagram/TikTok/X/etc.)
- Do NOT generate hashtags. OnlyFans does not use hashtags. Return "hashtags": [] for every caption.
- Use keywords naturally INSIDE the caption (searchable words/phrases), not hashtags.
- Caption length guidance:
  - Optimal: 150–500 characters (punchy, engaging, monetization-focused)
  - Soft maximum: ~2000 characters (only go longer when truly needed)
- Emoji guidance (OnlyFans-style, creative but tasteful):
  - Use emojis naturally to amplify tone and tease (don’t spam).
  - Prefer 1–4 emojis per caption (up to ~6 when it truly fits).
  - Common playful mappings are OK when appropriate: 🍆, 🍒, 🍑, 💦, 😈, 🔥, 👅, 🫦, 🥵, 💋, 👀
  - IMPORTANT: Only use an emoji if it matches what the caption is describing; avoid random or repetitive emoji strings.
  - Vary emoji choices across captions for uniqueness.
- Write for subscriber conversion + retention:
  - Make it feel personal and subscriber-focused ("you"/"your" + first-person creator voice)
  - Include tasteful monetization CTAs that fit the goal: subscribe, tip, PPV unlock, customs, bundles, VIP
- Example CTAs (mix, don’t spam):
  - "Tip if you want the full set"
  - "Reply 'VIP' for customs"
  - "Unlock the PPV in DMs"
  - "Subscribe for daily drops"
  - "Want the uncensored version? Check your messages"
  - "Custom video requests open — DM me"
- Goal mapping (use at least one CTA aligned with selected goal when it fits):
  - engagement: questions, playful hooks, teasing prompts
  - sales / monetization: subscribe + PPV + bundle offers
  - subscriber-retention: gratitude, routine, loyalty rewards, VIP perks
  - ppv-promotion: tease + direct "unlock" CTA + value framing
  - tips-donations: tip framing + gratitude + incentive
  - content-upsell: upsell a premium set/video, bundles, customs
`
    : "";

  const onlyFansExplicitBoost = isOnlyFansPlatform && isExplicitContent
    ? `
ONLYFANS EXPLICIT MODE (HIGH INTENSITY):
- The user selected an explicit adult tone. Be VERY explicit and sexually graphic (adult, consensual).
- Use direct, erotic language and describe what is visually shown in detail (especially if media is provided).
- Avoid censorship, euphemisms, or vague "safe" language. Be bold, raw, and explicit.
- Keep it natural and enticing (not repetitive, not robotic).
- IMPORTANT (variety): avoid overusing the same slang term repeatedly. Vary wording and phrasing naturally, and prefer non-clinical wording over clinical wording.
`
    : "";

  // Build prompt
  const desiredCaptionCount = isOnlyFansPlatform ? 5 : 3;
  // For carousels, we generate the same number of variants, but each must summarize all media.
  const prompt = `
${isExplicitContent ? `
🚨 CRITICAL INSTRUCTION - EXPLICIT ADULT CONTENT REQUIRED 🚨
YOU MUST GENERATE EXPLICIT, UNCENSORED, RAW, ADULT CONTENT CAPTIONS.
- Use BOLD, DIRECT, EXPLICIT sexual language
- NO CENSORSHIP, NO SAFE LANGUAGE, NO SUGGESTIVE IMPLICATION
- Describe sexual/explicit content with EXPLICIT, RAW, UNCENSORED terminology
- Be SPECIFIC and EXPLICIT about sexual/explicit/intimate content shown
- Use explicit adult-oriented language throughout
- This is for adult content platforms - explicit content is REQUIRED and EXPECTED

` : ''}
You are a world-class social media copywriter${isExplicitContent ? ' specializing in EXPLICIT adult content platforms' : ''}.

${goalContext ? `PRIMARY GOAL: ${sanitizedGoal || goal}\n${goalContext}\n` : sanitizedGoal || goal ? `PRIMARY GOAL: ${sanitizedGoal || goal}\n` : ''}

${currentTrends ? `CURRENT SOCIAL MEDIA TRENDS (from weekly research):\n${currentTrends}\n` : ''}

${onlyfansResearch ? `ONLYFANS-SPECIFIC RESEARCH & BEST PRACTICES:\n${onlyfansResearch}\n` : ''}

${onlyFansPlatformContext}
${onlyFansExplicitBoost}

${Array.isArray(platforms) && platforms.length > 0 ? `
PLATFORM-SPECIFIC OPTIMIZATION REQUIREMENTS:
${platforms.map(platform => {
  const platformName = platform.toLowerCase();
  if (platformName === 'onlyfans') {
    return `- OnlyFans: Do NOT generate hashtags. Optimize for 150–500 characters (soft max ~2000). Add subscriber-focused monetization CTAs (subscribe, tip, PPV unlock, customs) when appropriate.`;
  }
  if (platformName.includes('instagram')) {
    return `- Instagram: Maximum 2,200 characters for captions. Optimal length: 125-150 characters for engagement. Include 10-30 relevant hashtags for maximum reach. Hashtags should be relevant to content, niche, and trending topics. Use 1–4 creative, relevant emojis (don’t spam) to enhance tone.`;
  } else if (platformName.includes('tiktok')) {
    return `- TikTok: Maximum 2,200 characters, but optimal length is 100-300 characters for better engagement. Include 3-5 trending hashtags plus 3-5 niche-specific hashtags. Keep captions concise and engaging. Use 1–5 creative emojis naturally (don’t spam); match emojis to what’s being described.`;
  } else if (platformName.includes('twitter') || platformName === 'x') {
    return `- X (Twitter): Maximum 280 characters. Keep captions concise and punchy. Use 1-2 highly relevant hashtags maximum. Focus on clarity and impact within character limit. Emojis are optional; if used, keep to 0–2 and make them meaningful.`;
  } else if (platformName.includes('linkedin')) {
    return `- LinkedIn: Maximum 3,000 characters. Professional tone recommended. Optimal length: 150-300 characters for best engagement. Include 3-5 professional, industry-relevant hashtags.`;
  } else if (platformName.includes('facebook')) {
    return `- Facebook: No strict limit (63,206 characters max), but optimal length is 40-80 characters for feed posts. Include 2-5 relevant hashtags. Keep captions conversational and engaging. Use 0–3 emojis to add personality (don’t overdo it).`;
  } else if (platformName.includes('threads')) {
    return `- Threads: Maximum 500 characters. Similar to Instagram but shorter. Include 5-10 relevant hashtags. Keep captions concise and engaging. Emojis are optional; if used, keep to 0–3 and make them relevant.`;
  } else if (platformName.includes('youtube')) {
    return `- YouTube: Up to 5,000 characters in description. First 125 characters are most important (shown in preview). Include 3-5 highly relevant hashtags in description. Format with clear sections.`;
  } else if (platformName.includes('pinterest')) {
    return `- Pinterest: Optimal caption length is 100-500 characters. Include 5-10 relevant keywords and hashtags. Focus on descriptive, searchable language.`;
  } else {
    return `- ${platform}: Optimize for platform best practices. Include relevant hashtags.`;
  }
}).join('\n')}

CRITICAL: Ensure all captions respect the character limits and hashtag counts specified for the target platform(s). If OnlyFans is selected, hashtags MUST be empty.

EMOJI GUIDELINES (ALL SOCIAL PLATFORMS):
${getEmojiInstructions({ enabled: emojiEnabled !== false, intensity: emojiIntensity ?? 5 })}${emojiEnabled !== false ? ` Choose emojis that match the tone (examples: ${getEmojiExamplesForTone(tone)}). Emojis should enhance the caption naturally.` : ''}
` : ''}

CRITICAL - PERSPECTIVE REQUIREMENT (MUST FOLLOW):
- Write captions FROM THE CONTENT CREATOR'S PERSPECTIVE (first person: "I", "my", "me")
- The captions are what the CONTENT CREATOR is posting, NOT what fans/followers are saying or wanting
- Write as if YOU (the content creator) are posting this content yourself
- DO NOT write from the audience's perspective (e.g., "I want to...", "I wish I could...", "This makes me...")
- DO NOT write as if fans are commenting or reacting to the content
- Write captions that the CONTENT CREATOR would post about their own content
- Use first-person language from the creator's point of view (e.g., "I'm feeling...", "Check out my...", "I wanted to share...")
- The caption should be what the CREATOR is saying about their own post, not what viewers are thinking

${promptText && (promptText.includes('PERSONALIZE FOR FAN') || promptText.includes('fan')) ? `
🚨 CRITICAL - FAN PERSONALIZATION PERSPECTIVE (READ CAREFULLY) 🚨
- If a fan's name is mentioned in the context, YOU (the creator) are addressing that fan directly
- The caption is YOU talking TO the fan, NOT the fan talking to you
- Example CORRECT: "Hey [fan name], I wanted to share this with you..." (creator speaking to fan)
- Example WRONG: "[creator name], I love when you..." (fan speaking to creator - THIS IS INCORRECT)
- When personalizing for a fan, write as if YOU are posting a caption and addressing that fan by name
- DO NOT reverse the perspective - the fan is NOT writing the caption, YOU are
- The fan's name should appear as someone YOU are addressing, not as someone addressing you
- Always maintain first-person creator perspective: "I", "my", "me" referring to YOU the creator
` : ''}

${explicitContext}

${isOnlyFansPlatform ? `Generate 3–5 UNIQUE, DIVERSE captions` : `Generate EXACTLY ${desiredCaptionCount} DISTINCT caption variants`} based on:
- Goal: ${sanitizedGoal || goal || "engagement"}${isExplicitContent ? ' (Mix of EXPLICIT SEXUAL content description and sales-focused captions)' : sanitizedGoal || goal ? ` (Every caption must directly support achieving: ${sanitizedGoal || goal})` : ''}
- Tone: ${sanitizedTone || tone || "friendly"}${isExplicitContent ? ' (EXPLICIT/ADULT CONTENT - Generate BOLD, EXPLICIT, RAW, UNCENSORED captions with explicit sexual language that describe what is visually shown in explicit detail, plus sales-focused captions)' : ''}
- Extra instructions: ${sanitizedPromptText || "none"}
${goal && goal !== "engagement" ? `\nGOAL-SPECIFIC CTAs TO CONSIDER: ${getGoalSpecificCTAs(goal)}\n` : ''}

CRITICAL - VARIETY REQUIREMENT:
- Each caption MUST be completely different from the others
- Avoid repetitive phrases, structures, or themes
- Vary the writing style, sentence length, and approach
- Generate fresh, unique content each time - never reuse or repeat previous captions
- If regenerating, create entirely new captions with different angles, wording, and styles
${!isOnlyFansPlatform ? `
CAPTION VARIANTS (SOCIAL PLATFORMS):
- Return 3 variants that feel meaningfully different:
  - Variant 1: Short + punchy hook + clear CTA
  - Variant 2: Micro-story / personal angle (creator POV) + soft CTA
  - Variant 3: Value/insight bullets or 2-line structure + engagement question
- Keep each variant within platform limits (if multiple platforms selected, obey the strictest limit).
` : ''}
${isExplicitContent ? `
IMPORTANT - EXPLICIT CONTENT CAPTION REQUIREMENTS:

CRITICAL - EXPLICIT CONTENT REQUIREMENT:
- ALL captions MUST be EXPLICIT and ADULT-ORIENTED when tone is "Sexy / Explicit" or "Explicit"
- ABSOLUTELY NO CENSORSHIP, SAFE LANGUAGE, OR SUGGESTIVE IMPLICATION
- Use BOLD, DIRECT, EXPLICIT, ADULT LANGUAGE - describe sexual/explicit content clearly and explicitly
- Be SPECIFIC and DETAILED - describe explicit content, poses, actions, intimate details, sexual content shown
- Use RAW, UNCENSORED, EXPLICIT language appropriate for adult content platforms
- DO NOT use euphemisms, vague language, or implied content - BE EXPLICIT AND DIRECT
- Describe sexual/explicit content with bold, adult-oriented, explicit terminology
- Generate TRULY EXPLICIT captions - not suggestive or implied, but DIRECTLY, EXPLICITLY DESCRIPTIVE

CAPTION VARIETY - MUST INCLUDE BOTH TYPES:
1. AT LEAST ONE EXPLICIT DESCRIPTIVE CAPTION:
   - ANALYZE THE ACTUAL MEDIA: Look at the image/video and describe what's EXPLICITLY shown in DETAIL
   - Be SPECIFIC and EXPLICIT: Describe sexual/explicit content, poses, intimate actions, explicit details visible
   - Make it EXPLICITLY DESCRIPTIVE: Use bold, direct, explicit language describing sexual/explicit/intimate content
   - Focus on EXPLICIT DETAILS: Describe sexual content, intimate actions, explicit poses, sexual acts shown
   - EXPLICIT DESCRIPTIONS REQUIRED: Be bold, direct, and explicit about sexual/explicit content viewers are seeing
   - Use EXPLICIT, ADULT LANGUAGE: Describe sexual/explicit content with clear, explicit terminology
   - NO PLATFORM MENTIONS: Don't mention "OnlyFans" or "Fanvue" - focus on explicit content description
   ${shouldGenerateOnlyFansHashtags ? '' : '- NO ONLYFANS HASHTAGS: Do not use OnlyFans-specific hashtags or explicit adult content hashtags'}
   
2. AT LEAST ONE SALES/MONETIZATION-FOCUSED CAPTION:
   - Focus on driving subscriptions, purchases, and monetization
   - Use sales-oriented language that promotes exclusivity and subscriber benefits
   - Include CTAs that drive subscriptions, purchases, or exclusive content access
   - Create urgency and desire for paid content or subscriptions
   - Promote exclusive content, subscriber benefits, and monetization opportunities
   - Can be more direct about monetization (but still natural, not spammy)
   ${shouldGenerateOnlyFansHashtags ? '- Platform mentions OPTIONAL: Can include "OnlyFans" or "Fanvue" when it makes sense for sales/monetization (e.g., "Join my OnlyFans", "Subscribe on Fanvue", "Check my page")' : '- NO PLATFORM MENTIONS: Do not mention "OnlyFans" or "Fanvue" - keep content appropriate for general social media'}
   ${shouldGenerateOnlyFansHashtags ? '- Use platform names naturally in sales context when appropriate - not forced or spammy, but helpful for direct CTAs' : ''}

3. ADDITIONAL CAPTIONS (balance as needed):
   - Mix of explicit descriptions and sales-focused approaches
   - Each caption should offer a different angle or focus
   - Variety: Different aspects of content, different sales angles, different moods

ALL CAPTIONS:
- MUST BE EXPLICIT AND ADULT-ORIENTED - NO GENERIC, SAFE, OR CENSORED CONTENT
- When tone is explicit, generate TRULY EXPLICIT captions with BOLD, DIRECT, EXPLICIT ADULT LANGUAGE
- Use RAW, UNCENSORED, EXPLICIT language describing sexual/explicit/intimate content clearly and directly
- Describe sexual/explicit content with EXPLICIT, ADULT-ORIENTED terminology - no euphemisms or vague language
- Be SPECIFIC and DETAILED about explicit/sexual content shown - use explicit language, not suggestive
- Natural language (not spammy or repetitive) but EXPLICIT and ADULT-ORIENTED
- Platform mentions: Only in sales/monetization captions when it makes sense (descriptive captions should avoid platform names)
- Bold, direct, EXPLICIT, RAW language appropriate for adult content platforms - describe sexual/explicit content explicitly
- EACH CAPTION MUST BE UNIQUE - no repetition, varied styles, different approaches, but ALL EXPLICIT
` : ''}

${isVideo ? `
IMPORTANT: You are analyzing a VIDEO file. Watch the entire video and analyze:
- The complete narrative/story being told
- Key scenes and transitions throughout the video
- Actions, movements, and visual elements across all frames
- The overall mood, pacing, and visual style
- Any text, graphics, or on-screen elements
- The beginning, middle, and end of the video
- What happens throughout the entire video duration
${isExplicitContent ? `
- For EXPLICIT content: Analyze sexual/explicit scenes, poses, intimate actions, explicit content shown
- Describe EXPLICIT/SEXUAL details with BOLD, DIRECT, EXPLICIT language - what sexual/explicit content is happening
- Focus on EXPLICIT SEXUAL CONTENT shown throughout the video - describe with explicit adult terminology
` : ''}

Create captions that capture the full video experience, not just a single frame.
` : isCarousel ? `
IMPORTANT: You are analyzing a CAROUSEL (multiple images/videos) for a single post.
- You will be given multiple media items representing one coherent post.
- Do NOT write separate captions per image.
- Write captions that summarize the overall story/vibe across ALL media items in the carousel.
- It is OK to reference changes over time (e.g., day → night outfit change) if that matches the media.
` : `
If an image is provided, analyze the visual content:
- Describe what you see, the mood, colors, composition, and key elements
${isExplicitContent ? `
- For EXPLICIT content: Analyze sexual/explicit details shown - explicit poses, sexual content, intimate actions
- Describe EXPLICIT/SEXUAL aspects with BOLD, DIRECT, EXPLICIT language - what sexual/explicit content is visible
- Focus on EXPLICIT SEXUAL CONTENT displayed in the image - describe with explicit adult terminology
` : ''}
`}
Use this visual context to create engaging, relevant captions.

${!Array.isArray(platforms) || platforms.length === 0 ? `
HASHTAG REQUIREMENTS (when no platform specified):
- Each caption MUST include 5-10 relevant hashtags
- Hashtags should be relevant to the content, niche, and tone
- Use a mix of broad and niche-specific hashtags
- Vary hashtags across captions - don't use the same ones in every caption
- Make hashtags specific to what's in the media content
- Keep hashtags appropriate for general social media platforms
` : ''}
${isExplicitContent ? `
EXPLICIT CONTENT CAPTION REQUIREMENTS - CAPTION VARIETY:

YOU MUST GENERATE A MIX OF CAPTION TYPES:

TYPE 1 - EXPLICIT DESCRIPTIVE CAPTIONS (at least 1 required):
- ANALYZE WHAT'S VISUALLY SHOWN: Describe the actual EXPLICIT/SEXUAL content in the image/video in EXPLICIT DETAIL
- Be SPECIFIC and EXPLICITLY DESCRIPTIVE: Describe sexual/explicit content, poses, intimate actions, explicit details shown
- BOLD, DIRECT, EXPLICIT language: Use RAW, EXPLICIT, ADULT language describing sexual/explicit content viewers are seeing
- Create desire through EXPLICIT description: Make sexual/explicit content sound enticing through EXPLICIT, DETAILED description
- EXPLICIT DETAILS REQUIRED: Be bold and explicit about sexual/explicit/intimate content shown in the media
- Descriptive focus: The caption should make viewers want to see more by describing EXPLICIT/SEXUAL content with EXPLICIT language
- No platform name: Don't mention "OnlyFans" or "Fanvue" - focus on EXPLICIT content description
${shouldGenerateOnlyFansHashtags ? '' : '- NO ONLYFANS HASHTAGS: Do not use OnlyFans-specific hashtags or explicit adult content hashtags'}

TYPE 2 - SALES/MONETIZATION CAPTIONS (at least 1 required):
- Focus on driving subscriptions, purchases, and monetization
- Sales-oriented language: Promote exclusivity, subscriber benefits, paid content access
- Include CTAs: Drive subscriptions, purchases, exclusive content access
- Create urgency: Make viewers want to subscribe or purchase now
- Promote exclusivity: Highlight subscriber benefits, exclusive content, personalized experiences
- Monetization focus: Directly address revenue opportunities (subscriptions, tips, custom content)
- Natural sales language: Not spammy, but clear about monetization benefits
- Platform mentions OPTIONAL: Can include "OnlyFans" or "Fanvue" when it makes sense for sales/monetization (e.g., "Join my OnlyFans", "Subscribe on Fanvue", "Check my page")
- Use platform names naturally in sales context when appropriate - not forced or spammy, but helpful for direct CTAs

ADDITIONAL CAPTIONS:
- Can be a mix: More descriptive, more sales-focused, or balanced
- Variety: Different angles, moods, approaches to the same content
- Each caption offers something unique - COMPLETELY DIFFERENT from the others
- No repetitive structures, phrases, or themes - generate fresh content every time

${shouldGenerateOnlyFansHashtags ? `CRITICAL - EXPLICIT HASHTAGS REQUIRED:
- HASHTAGS MUST MATCH THE EXPLICIT CONTENT: Use bold, adult-oriented hashtags that describe what's shown
- Generate 5-10 explicit hashtags per caption that relate to the intimate/explicit content
- Examples of appropriate explicit hashtags: #intimate #sensual #boudoir #explicit #adultcontent #nsfw #sexy #erotic #seductive #intimatephoto #sensualphotography #boudoirphotography #adult #mature #sexycontent #intimatecontent
- Hashtags should describe: poses, outfits, mood, setting, or explicit/intimate aspects shown
- For sales-focused captions, hashtags can also include: #exclusive #subscriber #premium #customcontent
- Vary hashtags across captions - don't repeat the same ones
- Make hashtags specific to what's in the media (e.g., if lingerie shown: #lingerie #intimates #sexylingerie)
- Do NOT use generic hashtags like #follow #subscribe - use explicit content-descriptive hashtags` : `HASHTAG REQUIREMENTS:
- Generate 5-10 appropriate hashtags per caption that match the content and tone
- Use hashtags relevant to the content shown (e.g., fashion, lifestyle, beauty, etc.)
- DO NOT use OnlyFans-specific hashtags, explicit adult content hashtags, or platform-specific adult content hashtags
- Keep hashtags appropriate for general social media platforms
- Vary hashtags across captions - don't repeat the same ones
- Make hashtags specific to what's in the media`}
` : ''}

CRITICAL - HASHTAG REQUIREMENT:
${isOnlyFansPlatform ? '- OnlyFans does NOT use hashtags. Return empty array: "hashtags": []' : '- Every caption MUST include hashtags in the "hashtags" array (minimum 5 hashtags, unless platform specifies fewer)'}
- Hashtags must be relevant to the content, niche, and tone
- Do NOT return empty hashtag arrays unless this is for OnlyFans
- Hashtags should be formatted as strings in the array (e.g., ["#tag1", "#tag2", "#tag3"])

Return ONLY strict JSON like:

[
  {
    "caption": "text",
    "hashtags": ${isOnlyFansPlatform ? '[]' : '["#one", "#two", "#three", "#four", "#five"]'}
  }
]

${isExplicitContent ? `
IMPORTANT - Caption Variety and Hashtag Requirements:

CAPTION REQUIREMENTS:
- Generate at least ONE explicit descriptive caption (analyzes and describes what's shown in detail)
- Generate at least ONE sales/monetization-focused caption (drives subscriptions, purchases, exclusivity)
- Additional captions can be a mix of both approaches
- All captions must be explicit and adult-oriented

${shouldGenerateOnlyFansHashtags ? `HASHTAG REQUIREMENTS:
- Each caption MUST include 5-10 explicit hashtags
- Hashtags must be bold, adult-oriented, and match the explicit content shown
- Use hashtags like: #intimate #sensual #boudoir #explicit #adultcontent #nsfw #sexy #erotic #seductive #intimatephoto #sensualphotography #boudoirphotography
- For sales-focused captions, also include: #exclusive #subscriber #premium #customcontent
- Hashtags should describe what's shown: poses, outfits, mood, setting, explicit/intimate aspects
- Vary hashtags - don't use the same ones in every caption
- Make hashtags specific to the media content` : `HASHTAG REQUIREMENTS:
- Each caption MUST include 5-10 appropriate hashtags
- Hashtags must match the content and tone, but be appropriate for general social media
- DO NOT use OnlyFans-specific hashtags, explicit adult content hashtags, or platform-specific adult content hashtags
- Use hashtags relevant to the content (e.g., fashion, lifestyle, beauty, style, etc.)
- Vary hashtags - don't use the same ones in every caption
- Make hashtags specific to the media content`}
` : ''}
`.trim();

  const parts: any[] = [{ text: prompt }];

  // Attach media:
  // - Single media: attach inlineData
  // - Carousel: attach ALL media items so the model can summarize the set
  if (finalMediaList.length > 0) {
    for (const m of finalMediaList) {
      parts.push({
        inlineData: {
          data: m.data,
          mimeType: m.mimeType,
        },
      });
    }
  } else if (finalMedia) {
    parts.push({
      inlineData: {
        data: finalMedia.data,
        mimeType: finalMedia.mimeType,
      },
    });
  }

  // Generate captions via Gemini
  let rawText: string;

  try {
    // Use more retries for videos due to longer processing time
    // Increase timeout for longer videos
    const maxRetries = isVideo ? 5 : 3;
    
    // Log before generation for debugging
    console.log('[generateCaptions] Starting generation:', {
      isVideo,
      isCarousel,
      hasMedia: !!finalMedia || finalMediaList.length > 0,
      maxRetries,
    });
    
    const result = await generateWithRetry(
      model,
      {
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
        },
      },
      maxRetries,
      isVideo
    );

    if (!result?.response || typeof result.response.text !== "function") {
      console.error("Bad Gemini response:", result);
      res.status(200).json([
        {
          caption: "AI returned malformed response. Try again.",
          hashtags: [],
        },
      ]);
      return;
    }

    rawText = result.response.text().trim();
    
    // Log successful generation
    if (rawText) {
      console.log('[generateCaptions] Successfully generated captions:', {
        isVideo,
        textLength: rawText.length,
      });
    } else {
      console.warn('[generateCaptions] Empty response text received');
    }
  } catch (err: any) {
    console.error("[generateCaptions] AI error:", {
      error: err,
      message: err?.message,
      status: err?.status,
      code: err?.code,
      isVideo,
    });
    
    // Provide more specific error messages
    const errorMessage = err?.message || "";
    const status = err?.status;
    const errorCode = err?.code;
    
    let userMessage = "AI generation failed. Please try again.";
    
    if (status === 429 || errorCode === 429 || errorMessage.includes("429")) {
      userMessage = "API rate limit reached. Please wait a moment and try again.";
    } else if (
      status === 408 ||
      errorCode === 408 ||
      errorCode === 504 ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("deadline")
    ) {
      userMessage = isVideo
        ? "Video analysis timed out. The video may be too large or processing took too long. Try a smaller video or try again. Longer videos may take more time to process."
        : "Analysis timed out. Please try again.";
    } else if (
      errorMessage.includes("network") ||
      errorMessage.includes("connection") ||
      errorMessage.includes("fetch")
    ) {
      userMessage = "Network error occurred. Please check your connection and try again.";
    } else if (status >= 500 || errorCode >= 500) {
      userMessage = "AI service temporarily unavailable. Please try again in a moment.";
    } else if (errorMessage.includes("quota") || errorMessage.includes("limit")) {
      userMessage = "API quota exceeded. Please try again later.";
    }
    
    res.status(200).json([
      {
        caption: userMessage,
        hashtags: [],
      },
    ]);
    return;
  }

  // Parse JSON response
  let parsed: any;
  try {
    const { parseJSON } = await getGeminiShared();
    parsed = parseJSON(rawText);
  } catch (err) {
    console.warn("JSON parse failed:", err);
    parsed = [{ caption: rawText, hashtags: [] }];
  }

  let captions: CaptionResult[];

  if (Array.isArray(parsed)) {
    captions = parsed;
  } else if (Array.isArray(parsed?.captions)) {
    captions = parsed.captions;
  } else {
    captions = [{ caption: rawText, hashtags: [] }];
  }

  // OnlyFans does not use hashtags. Enforce empty hashtags to keep output clean and consistent.
  if (isOnlyFansPlatform) {
    captions = (captions || []).map((c: any) => ({
      ...c,
      hashtags: [],
    }));
  }

  // Record caption generation usage (only after successful generation)
  try {
    const { recordCaptionGeneration } = await import("./_captionUsage.js");
    await recordCaptionGeneration(authUser.uid, userPlan, userRole, captions.length);
  } catch (usageError) {
    // Don't fail the request if usage tracking fails
    console.error("Failed to record caption generation usage:", usageError);
  }

  res.status(200).json(captions);
}

export default withErrorHandling(handler);
