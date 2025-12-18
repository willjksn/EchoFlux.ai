// api/generateCaptions.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  checkApiKeys,
  getVerifyAuth,
  getModelRouter,
  withErrorHandling,
} from "./_errorHandler.js";

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

// Retry wrapper for Gemini API
async function generateWithRetry(model: any, request: any, maxRetries = 3) {
  let lastError;
  const baseDelayMs = 2000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await model.generateContent(request);
    } catch (err: any) {
      const status = err?.status;
      const msg = err?.message?.toLowerCase() || "";

      const is429 =
        status === 429 ||
        msg.includes("too many requests") ||
        msg.includes("429");

      if (!is429 || attempt === maxRetries) {
        throw err;
      }

      // Exponential backoff
      let delayMs = baseDelayMs * Math.pow(2, attempt);

      // Adjust delay if Gemini suggests "retry in Xs"
      const retryMatch = /retry in ([0-9.]+)s/i.exec(err?.message || "");
      if (retryMatch && !isNaN(Number(retryMatch[1]))) {
        delayMs = Number(retryMatch[1]) * 1000;
      }

      console.warn(
        `Gemini rate-limited (429). Attempt ${attempt + 1}/${maxRetries + 1}. Retrying in ${
          delayMs / 1000
        }s...`
      );

      await sleep(delayMs);
      lastError = err;
    }
  }

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

  const {
    mediaUrl,
    mediaData,
    goal,
    tone,
    promptText,
    platforms, // Array of selected platforms for platform-specific hashtags
  }: {
    mediaUrl?: string;
    mediaData?: MediaData;
    goal?: string;
    tone?: string;
    promptText?: string;
    platforms?: string[]; // Selected platforms for hashtag generation
  } = req.body || {};
  
  // Normalize tone value for consistent detection
  const normalizedTone = tone?.toLowerCase().trim();
  
  // Detect explicit content context - ONLY for truly explicit tones, NOT "sexy/bold"
  // "Sexy / Bold" should be suggestive but NOT explicit, and should NOT generate OnlyFans hashtags
  const isExplicitContent = normalizedTone === 'explicit/adult content' || 
                           normalizedTone === 'explicit' ||
                           normalizedTone === 'sexy / explicit' ||
                           normalizedTone === 'sexy-explicit' ||
                           normalizedTone === 'sex-explicit' ||
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

  if (mediaUrl) {
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
  const isVideo = finalMedia?.mimeType?.startsWith('video/') || false;

  // Determine platform for context (if OnlyFans)
  const targetPlatform = Array.isArray(platforms) && platforms.includes('OnlyFans') ? 'OnlyFans' 
                        : null;

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

  // Build prompt
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

CRITICAL - PERSPECTIVE REQUIREMENT:
- Write captions FROM THE CONTENT CREATOR'S PERSPECTIVE (first person: "I", "my", "me")
- The captions are what the CONTENT CREATOR is posting, NOT what fans/followers are saying or wanting
- Write as if YOU (the content creator) are posting this content yourself
- DO NOT write from the audience's perspective (e.g., "I want to...", "I wish I could...", "This makes me...")
- DO NOT write as if fans are commenting or reacting to the content
- Write captions that the CONTENT CREATOR would post about their own content
- Use first-person language from the creator's point of view (e.g., "I'm feeling...", "Check out my...", "I wanted to share...")
- The caption should be what the CREATOR is saying about their own post, not what viewers are thinking

${explicitContext}

Generate 3–5 UNIQUE, DIVERSE captions based on:
- Goal: ${goal || "engagement"}${isExplicitContent ? ' (Mix of EXPLICIT SEXUAL content description and sales-focused captions)' : ''}
- Tone: ${tone || "friendly"}${isExplicitContent ? ' (EXPLICIT/ADULT CONTENT - Generate BOLD, EXPLICIT, RAW, UNCENSORED captions with explicit sexual language that describe what is visually shown in explicit detail, plus sales-focused captions)' : ''}
- Extra instructions: ${promptText || "none"}

CRITICAL - VARIETY REQUIREMENT:
- Each caption MUST be completely different from the others
- Avoid repetitive phrases, structures, or themes
- Vary the writing style, sentence length, and approach
- Generate fresh, unique content each time - never reuse or repeat previous captions
- If regenerating, create entirely new captions with different angles, wording, and styles
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

Return ONLY strict JSON like:

[
  {
    "caption": "text",
    "hashtags": ["#one", "#two"]
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

  if (finalMedia) {
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
    const result = await generateWithRetry(model, {
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json" },
    });

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
  } catch (err: any) {
    console.error("AI error:", err);
    res.status(200).json([
      {
        caption: err?.message || "AI generation failed.",
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

  res.status(200).json(captions);
}

export default withErrorHandling(handler);
