// api/generateDailyPostIdeas.ts
// Instant "What to Post" ideas: 3 post ideas with optional regenerateAll or regenerateSingle (swap one card).
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getModelForTask, getModelNameForTask, getCostTierForTask } from "./_modelRouter.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { parseJSON } from "./_geminiShared.js";
import { enforceRateLimit } from "./_rateLimit.js";

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

  return `You are a content strategist for social creators. Generate ${ideaCount} post ideas for today.

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

${useTrends && trendContext ? `TRENDS / CONTEXT (use where relevant):\n${trendContext}\n` : ""}
${fanHubGuidance}

${existingIdeasForContext?.length ? `EXISTING IDEAS (avoid duplicating; generate one different idea for swap):\n${existingIdeasForContext.map((i) => `${i.title}: ${i.hook}`).join("\n")}\n` : ""}

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
    
    // Keyword mapping for Unsplash - returns null if no good match found
    const getUnsplashSearchTerm = (title: string): { term: string; confidence: 'high' | 'medium' | 'low' } => {
      const keywords = title.toLowerCase();
      
      // High confidence mappings - LIFESTYLE/CREATOR CONTENT (check first for priority)
      if (keywords.includes('swimsuit') || keywords.includes('swimwear') || keywords.includes('pool') || keywords.includes('swimming')) 
        return { term: 'swimsuit,pool,summer', confidence: 'high' };
      if (keywords.includes('bikini') || keywords.includes('beach bod') || keywords.includes('tan') || keywords.includes('sunbath')) 
        return { term: 'bikini,beach,summer', confidence: 'high' };
      if (keywords.includes('lingerie') || keywords.includes('boudoir') || keywords.includes('intimate')) 
        return { term: 'boudoir,feminine,elegant', confidence: 'high' };
      if (keywords.includes('legs') || keywords.includes('long legs') || keywords.includes('leggy')) 
        return { term: 'legs,fashion,model', confidence: 'high' };
      if (keywords.includes('feet') || keywords.includes('toes') || keywords.includes('pedicure') || keywords.includes('foot')) 
        return { term: 'feet,pedicure,spa', confidence: 'high' };
      if (keywords.includes('butt') || keywords.includes('booty') || keywords.includes('curves') || keywords.includes('curvy')) 
        return { term: 'fitness,curves,body-positive', confidence: 'high' };
      if (keywords.includes('breast') || keywords.includes('cleavage') || keywords.includes('chest')) 
        return { term: 'fashion,feminine,elegant', confidence: 'high' };
      if (keywords.includes('nail') || keywords.includes('manicure') || keywords.includes('polish') || keywords.includes('fingernail')) 
        return { term: 'nails,manicure,beauty', confidence: 'high' };
      if (keywords.includes('lips') || keywords.includes('lipstick') || keywords.includes('pout') || keywords.includes('kiss')) 
        return { term: 'lips,lipstick,beauty', confidence: 'high' };
      if (keywords.includes('eyes') || keywords.includes('eye') || keywords.includes('lashes') || keywords.includes('eyeliner') || keywords.includes('eyeshadow')) 
        return { term: 'eyes,makeup,beauty', confidence: 'high' };
      if (keywords.includes('miniskirt') || keywords.includes('mini skirt') || keywords.includes('short skirt')) 
        return { term: 'miniskirt,fashion,style', confidence: 'high' };
      if (keywords.includes('dress') || keywords.includes('gown') || keywords.includes('cocktail')) 
        return { term: 'dress,fashion,elegant', confidence: 'high' };
      if (keywords.includes('heels') || keywords.includes('high heels') || keywords.includes('stiletto') || keywords.includes('pumps')) 
        return { term: 'heels,shoes,fashion', confidence: 'high' };
      if (keywords.includes('lingerie') || keywords.includes('lace') || keywords.includes('silk') || keywords.includes('satin')) 
        return { term: 'lace,silk,feminine', confidence: 'high' };
      if (keywords.includes('selfie') || keywords.includes('mirror') || keywords.includes('self portrait')) 
        return { term: 'selfie,portrait,woman', confidence: 'high' };
      if (keywords.includes('body') || keywords.includes('figure') || keywords.includes('physique') || keywords.includes('body check')) 
        return { term: 'fitness,body,wellness', confidence: 'high' };
      if (keywords.includes('hair') || keywords.includes('hairstyle') || keywords.includes('blonde') || keywords.includes('brunette') || keywords.includes('redhead')) 
        return { term: 'hair,hairstyle,beauty', confidence: 'high' };
      if (keywords.includes('smile') || keywords.includes('happy') || keywords.includes('laugh') || keywords.includes('joy')) 
        return { term: 'smile,happy,portrait', confidence: 'high' };
      if (keywords.includes('bed') || keywords.includes('bedroom') || keywords.includes('lazy') || keywords.includes('cozy')) 
        return { term: 'bedroom,cozy,lifestyle', confidence: 'high' };
      if (keywords.includes('bath') || keywords.includes('bubble') || keywords.includes('tub') || keywords.includes('shower')) 
        return { term: 'bath,spa,relaxation', confidence: 'high' };
      if (keywords.includes('gym') || keywords.includes('workout') || keywords.includes('sweat') || keywords.includes('exercise')) 
        return { term: 'gym,workout,fitness', confidence: 'high' };
      if (keywords.includes('yoga') || keywords.includes('stretch') || keywords.includes('flexible') || keywords.includes('pose')) 
        return { term: 'yoga,fitness,flexibility', confidence: 'high' };
      if (keywords.includes('sexy') || keywords.includes('hot') || keywords.includes('sultry') || keywords.includes('seductive')) 
        return { term: 'fashion,glamour,portrait', confidence: 'high' };
      if (keywords.includes('cute') || keywords.includes('adorable') || keywords.includes('sweet') || keywords.includes('innocent')) 
        return { term: 'cute,portrait,natural', confidence: 'high' };
      if (keywords.includes('glam') || keywords.includes('glamour') || keywords.includes('glamorous') || keywords.includes('stunning')) 
        return { term: 'glamour,fashion,elegant', confidence: 'high' };
      if (keywords.includes('tan line') || keywords.includes('suntan') || keywords.includes('bronzed')) 
        return { term: 'summer,tan,beach', confidence: 'high' };
      if (keywords.includes('jewelry') || keywords.includes('necklace') || keywords.includes('earring') || keywords.includes('bracelet')) 
        return { term: 'jewelry,fashion,accessories', confidence: 'high' };
      if (keywords.includes('tattoo') || keywords.includes('ink') || keywords.includes('tattooed')) 
        return { term: 'tattoo,alternative,style', confidence: 'high' };
      if (keywords.includes('piercing') || keywords.includes('belly button') || keywords.includes('navel')) 
        return { term: 'piercing,alternative,style', confidence: 'high' };

      // High confidence mappings - GENERAL CONTENT
      if (keywords.includes('gaming') || keywords.includes('gamer') || keywords.includes('controller') || keywords.includes('esport')) 
        return { term: 'gaming,esports,controller', confidence: 'high' };
      if (keywords.includes('food') || keywords.includes('cook') || keywords.includes('recipe') || keywords.includes('meal') || keywords.includes('dish')) 
        return { term: 'food,cooking,meal', confidence: 'high' };
      if (keywords.includes('fitness') || keywords.includes('workout') || keywords.includes('gym') || keywords.includes('exercise') || keywords.includes('training')) 
        return { term: 'fitness,gym,workout', confidence: 'high' };
      if (keywords.includes('travel') || keywords.includes('vacation') || keywords.includes('trip') || keywords.includes('destination')) 
        return { term: 'travel,adventure,destination', confidence: 'high' };
      if (keywords.includes('music') || keywords.includes('song') || keywords.includes('concert') || keywords.includes('guitar') || keywords.includes('piano')) 
        return { term: 'music,concert,musician', confidence: 'high' };
      if (keywords.includes('makeup') || keywords.includes('skincare') || keywords.includes('beauty routine') || keywords.includes('cosmetic')) 
        return { term: 'makeup,beauty,skincare', confidence: 'high' };
      if (keywords.includes('fashion') || keywords.includes('outfit') || keywords.includes('ootd') || keywords.includes('wardrobe') || keywords.includes('clothing')) 
        return { term: 'fashion,outfit,style', confidence: 'high' };
      if (keywords.includes('dog') || keywords.includes('cat') || keywords.includes('puppy') || keywords.includes('kitten') || keywords.includes('pet')) 
        return { term: 'pets,dog,cat', confidence: 'high' };
      if (keywords.includes('coffee') || keywords.includes('cafe') || keywords.includes('latte') || keywords.includes('espresso')) 
        return { term: 'coffee,cafe,latte', confidence: 'high' };
      if (keywords.includes('sunset') || keywords.includes('sunrise') || keywords.includes('golden hour')) 
        return { term: 'sunset,golden-hour', confidence: 'high' };
      if (keywords.includes('meditation') || keywords.includes('mindful') || keywords.includes('zen')) 
        return { term: 'meditation,wellness,peaceful', confidence: 'high' };
      if (keywords.includes('tech') || keywords.includes('gadget') || keywords.includes('laptop') || keywords.includes('phone') || keywords.includes('setup')) 
        return { term: 'technology,gadgets,laptop', confidence: 'high' };
      if (keywords.includes('nature') || keywords.includes('outdoor') || keywords.includes('hike') || keywords.includes('mountain') || keywords.includes('forest')) 
        return { term: 'nature,hiking,mountains', confidence: 'high' };
      if (keywords.includes('book') || keywords.includes('reading') || keywords.includes('library')) 
        return { term: 'books,reading,library', confidence: 'high' };
      if (keywords.includes('plant') || keywords.includes('garden') || keywords.includes('flower') || keywords.includes('succulent')) 
        return { term: 'plants,garden,flowers', confidence: 'high' };
      if (keywords.includes('car') || keywords.includes('drive') || keywords.includes('road trip') || keywords.includes('vehicle')) 
        return { term: 'car,driving,road', confidence: 'high' };
      if (keywords.includes('beach') || keywords.includes('ocean') || keywords.includes('surf') || keywords.includes('sand')) 
        return { term: 'beach,ocean,surf', confidence: 'high' };
      if (keywords.includes('art') || keywords.includes('paint') || keywords.includes('draw') || keywords.includes('creative') || keywords.includes('canvas')) 
        return { term: 'art,painting,creative', confidence: 'high' };
      if (keywords.includes('party') || keywords.includes('celebration') || keywords.includes('birthday') || keywords.includes('festival')) 
        return { term: 'party,celebration,festival', confidence: 'high' };
      if (keywords.includes('work') || keywords.includes('office') || keywords.includes('desk') || keywords.includes('productivity')) 
        return { term: 'office,workspace,productivity', confidence: 'high' };
      if (keywords.includes('sport') || keywords.includes('basketball') || keywords.includes('football') || keywords.includes('soccer') || keywords.includes('tennis')) 
        return { term: 'sports,athletic,competition', confidence: 'high' };
      if (keywords.includes('wine') || keywords.includes('champagne') || keywords.includes('cocktail') || keywords.includes('drink')) 
        return { term: 'wine,cocktails,celebration', confidence: 'high' };
      if (keywords.includes('date') || keywords.includes('romantic') || keywords.includes('love') || keywords.includes('couple')) 
        return { term: 'romantic,couple,date', confidence: 'high' };
      if (keywords.includes('night out') || keywords.includes('club') || keywords.includes('dancing') || keywords.includes('nightlife')) 
        return { term: 'nightlife,club,dancing', confidence: 'high' };
      
      // Medium confidence - broader categories
      if (keywords.includes('morning') || keywords.includes('routine') || keywords.includes('wake')) 
        return { term: 'morning,routine,lifestyle', confidence: 'medium' };
      if (keywords.includes('night') || keywords.includes('evening') || keywords.includes('late')) 
        return { term: 'night,evening,city-lights', confidence: 'medium' };
      if (keywords.includes('behind') || keywords.includes('scene') || keywords.includes('process') || keywords.includes('making')) 
        return { term: 'behind-the-scenes,creative-process', confidence: 'medium' };
      if (keywords.includes('tip') || keywords.includes('advice') || keywords.includes('hack') || keywords.includes('secret')) 
        return { term: 'lightbulb,ideas,inspiration', confidence: 'medium' };
      if (keywords.includes('story') || keywords.includes('share') || keywords.includes('personal')) 
        return { term: 'storytelling,journal,personal', confidence: 'medium' };
      if (keywords.includes('lifestyle') || keywords.includes('life') || keywords.includes('vibe')) 
        return { term: 'lifestyle,aesthetic,woman', confidence: 'medium' };
      if (keywords.includes('self') || keywords.includes('care') || keywords.includes('relax') || keywords.includes('treat')) 
        return { term: 'selfcare,relaxation,spa', confidence: 'medium' };
      if (keywords.includes('friend') || keywords.includes('hangout') || keywords.includes('social') || keywords.includes('group')) 
        return { term: 'friends,social,hangout', confidence: 'medium' };
      if (keywords.includes('home') || keywords.includes('interior') || keywords.includes('decor') || keywords.includes('room')) 
        return { term: 'interior,home,decor', confidence: 'medium' };
      if (keywords.includes('shop') || keywords.includes('haul') || keywords.includes('unbox') || keywords.includes('buy')) 
        return { term: 'shopping,unboxing,haul', confidence: 'medium' };
      if (keywords.includes('model') || keywords.includes('photoshoot') || keywords.includes('pose') || keywords.includes('posing')) 
        return { term: 'model,photoshoot,portrait', confidence: 'medium' };
      if (keywords.includes('confidence') || keywords.includes('empower') || keywords.includes('fierce') || keywords.includes('boss')) 
        return { term: 'confident,woman,empowerment', confidence: 'medium' };
      
      // Low confidence - generic fallback (will trigger AI if enabled)
      return { term: 'woman,aesthetic,lifestyle', confidence: 'low' };
    };
    
    // Generate Unsplash URL
    const getUnsplashUrl = (searchTerm: string, index: number): string => {
      const seed = Date.now() + index * 1000;
      return `https://source.unsplash.com/featured/600x600/?${encodeURIComponent(searchTerm)}&sig=${seed}`;
    };
    
    // Check if Replicate is configured for AI fallback (enabled by default if token exists)
    const replicateApiToken = process.env.REPLICATE_API_TOKEN;
    const enableAIFallback = replicateApiToken && process.env.DISABLE_AI_IMAGE_FALLBACK !== "true";
    
    // Process ideas with images
    const processedIdeas = await Promise.all(ideas.map(async (idea, index) => {
      const baseIdea = {
        ...idea,
        id: idea.id || `idea_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        shotList: Array.isArray(idea.shotList) ? idea.shotList : [],
        hashtags: Array.isArray(idea.hashtags) ? idea.hashtags : [],
      };
      
      const { term, confidence } = getUnsplashSearchTerm(idea.title || '');
      
      // Use Unsplash for high/medium confidence matches
      if (confidence === 'high' || confidence === 'medium' || !enableAIFallback) {
        return {
          ...baseIdea,
          placeholderImage: getUnsplashUrl(term, index),
          imageSource: 'unsplash',
        };
      }
      
      // Low confidence + AI fallback enabled = generate with Replicate SDXL (~$0.002/image)
      try {
        const Replicate = (await import("replicate")).default;
        const replicate = new Replicate({ auth: replicateApiToken });
        
        // Create a specific, relevant prompt based on the idea
        const imagePrompt = `A visually appealing, Instagram-worthy photo representing: "${idea.title}". ${idea.shotList?.[0] || ''}. Style: modern, aesthetic, bright lighting, social media content, high quality, professional photography, no text or words in the image.`;
        
        const output = await replicate.run(
          "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
          {
            input: {
              prompt: imagePrompt,
              negative_prompt: "text, words, letters, watermark, logo, low quality, blurry, distorted, ugly, amateur",
              width: 1024,
              height: 1024,
              num_outputs: 1,
              scheduler: "K_EULER",
              num_inference_steps: 25, // Faster, still good quality
              guidance_scale: 7.5,
            }
          }
        );
        
        const imageUrl = Array.isArray(output) ? output[0] : output;
        if (typeof imageUrl === 'string') {
          return {
            ...baseIdea,
            placeholderImage: imageUrl,
            imageSource: 'ai',
          };
        }
      } catch (e) {
        console.warn(`AI image fallback failed for idea ${baseIdea.id}, using Unsplash:`, e);
      }
      
      // Final fallback to Unsplash
      return {
        ...baseIdea,
        placeholderImage: getUnsplashUrl(term, index),
        imageSource: 'unsplash',
      };
    }));
    
    ideas = processedIdeas;

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
