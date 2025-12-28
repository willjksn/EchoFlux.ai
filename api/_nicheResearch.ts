/**
 * Niche-Specific Research using Tavily
 * 
 * Performs targeted research for strategy generation based on:
 * - User's niche and audience
 * - Their specific goal
 * - Platform focus
 * 
 * This provides much richer insights than just analyzing user's published content.
 */

import { searchWeb } from "./_webSearch.js";
import { canUseTavily } from "./_tavilyUsage.js";
import { getLatestTrends } from "./_trendsHelper.js";

interface NicheResearchResult {
  category: string;
  query: string;
  results: Array<{
    title: string;
    link: string;
    snippet: string;
  }>;
}

/**
 * Perform comprehensive niche-specific research for strategy generation
 * 
 * @param niche - User's niche
 * @param audience - Target audience
 * @param goal - Primary goal
 * @param platformFocus - Platform focus (optional)
 * @param userId - User ID for usage tracking (optional)
 * @param userPlan - User plan for limit checking (optional)
 * @param userRole - User role (optional)
 */
export async function researchNicheStrategy(
  niche: string,
  audience: string,
  goal: string,
  platformFocus?: string,
  userId?: string,
  userPlan?: string,
  userRole?: string
): Promise<string> {
  try {
    // Get weekly trends first (free, no Tavily cost)
    let weeklyTrends = '';
    try {
      weeklyTrends = await getLatestTrends();
    } catch (error) {
      console.log('[NicheResearch] Could not fetch weekly trends, continuing with Tavily only');
    }

    // Cost control: non-admin users should NOT trigger live Tavily research.
    // They rely on twice-weekly stored trends for strategy generation.
    if (userId && userRole !== 'Admin') {
      if (weeklyTrends) {
        return `WEEKLY TRENDS (Mon/Thu) — NO LIVE RESEARCH:\n${weeklyTrends}\n\nNote: Live niche research is disabled for user strategy generation to control costs.`;
      }
      return "Trend data unavailable. Live niche research is disabled for user strategy generation to control costs.";
    }

    // Detect OnlyFans niche
    const isOnlyFansNiche = niche.toLowerCase().includes('onlyfans') || 
                            niche.toLowerCase().includes('adult content creator') ||
                            platformFocus === 'OnlyFans';

    // Build targeted research queries - focus on niche-specific research
    // Weekly trends already cover: general best practices, platform updates, content creator tips,
    // engagement strategies, hashtag strategies, video content trends
    // So we only need Tavily for 5 niche-specific categories (reduced from 8)
    // For OnlyFans, we add additional OnlyFans-specific queries
    const researchQueries = [
      {
        category: "niche_best_practices",
        query: `${niche} social media strategy best practices ${audience} ${goal}`,
      },
      {
        category: "successful_strategies",
        query: `successful ${niche} content strategy examples ${goal} case studies`,
      },
      {
        category: "competitor_analysis",
        query: `top ${niche} creators ${audience} social media content strategy`,
      },
      {
        category: "content_ideas",
        query: `${niche} content ideas ${audience} ${goal} trending topics`,
      },
      {
        category: "platform_strategy",
        query: platformFocus && platformFocus !== 'Mixed / All'
          ? `${niche} ${platformFocus} strategy ${audience} ${goal}`
          : `${niche} social media platform strategy ${audience} ${goal}`,
      },
      // Removed categories (now covered by weekly trends):
      // - engagement_tactics (covered by weekly trends)
      // - content_formats (covered by weekly trends)
      // - hashtag_strategy (covered by weekly trends)
    ];

    // Add OnlyFans-specific research queries when OnlyFans niche is detected
    if (isOnlyFansNiche) {
      researchQueries.push(
        {
          category: "onlyfans_best_practices",
          query: `OnlyFans content strategy best practices ${audience} ${goal}`,
        },
        {
          category: "onlyfans_trending_content",
          query: `OnlyFans trending content types ${audience} ${goal}`,
        },
        {
          category: "onlyfans_monetization_tips",
          query: `OnlyFans monetization strategies tips ${goal}`,
        },
        {
          category: "onlyfans_engagement_tactics",
          query: `OnlyFans subscriber engagement strategies ${audience}`,
        },
        {
          category: "onlyfans_platform_updates",
          query: `OnlyFans platform updates features changes`,
        }
      );
    }

    const allResearch: NicheResearchResult[] = [];

    // Fetch research for each category (reduced from 8 to 5 searches per strategy)
    // Weekly trends provide general best practices, so we only need niche-specific research
    for (const { category, query } of researchQueries) {
      try {
        console.log(`[NicheResearch] Researching: ${category} - ${query}`);
        
        // Check Tavily usage limits if user info provided
        if (userId && userPlan) {
          const tavilyCheck = await canUseTavily(userId, userPlan, userRole);
          if (!tavilyCheck.allowed) {
            console.log(`[NicheResearch] Tavily limit reached for user ${userId}, skipping ${category}`);
            // Continue with other categories, but skip this one
            continue;
          }
        }
        
        // Use searchWeb with user tracking if provided
        const searchResult = await searchWeb(query, userId, userPlan, userRole);
        
        if (searchResult.success && searchResult.results.length > 0) {
          allResearch.push({
            category,
            query,
            results: searchResult.results.slice(0, 5), // Top 5 results per category
          });
          console.log(`[NicheResearch] Found ${searchResult.results.length} results for ${category}`);
        } else {
          console.log(`[NicheResearch] No results for ${category}: ${searchResult.note || "Unknown error"}`);
        }
      } catch (error: any) {
        console.error(`[NicheResearch] Error researching ${category}:`, error);
        // Continue with other categories even if one fails
      }
    }

    // Format research for AI consumption
    // Include weekly trends if available (no Tavily cost)
    let researchContext = '';
    
    if (weeklyTrends && weeklyTrends !== 'Trend data unavailable. Using general best practices.') {
      researchContext += `\n${weeklyTrends}\n\n`;
    }

    if (allResearch.length === 0) {
      // If no Tavily research but we have weekly trends, use those
      if (researchContext) {
        return `GENERAL SOCIAL MEDIA TRENDS & BEST PRACTICES:\n${researchContext}\n\nNote: Niche-specific research unavailable. Using general trends and best practices for ${niche} niche targeting ${audience}.`;
      }
      return "Niche research unavailable. Using general best practices and goal-specific frameworks.";
    }

    const formattedResearch = allResearch.map((research) => {
      const results = research.results
        .map((r, idx) => `${idx + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.link}`)
        .join("\n\n");
      
      return `\n${research.category.toUpperCase().replace(/_/g, " ")}:\n${results}`;
    }).join("\n\n");

    return `
COMPREHENSIVE RESEARCH FOR STRATEGY GENERATION:

${researchContext ? 'GENERAL SOCIAL MEDIA TRENDS (from weekly research - no cost):' : ''}
${researchContext}

NICHE-SPECIFIC RESEARCH (targeted for ${niche} niche):

Niche: ${niche}
Target Audience: ${audience}
Primary Goal: ${goal}
${platformFocus && platformFocus !== 'Mixed / All' ? `Platform Focus: ${platformFocus}` : 'Platform Focus: Multi-platform'}

${formattedResearch}

KEY INSIGHTS FROM RESEARCH:
- Use successful strategies and tactics that are working in the ${niche} niche for ${audience}
- Incorporate proven content formats and engagement tactics from top performers
- Adapt competitor strategies to fit the specific goal: ${goal}
- Leverage trending topics and hashtags relevant to ${niche} and ${audience}
- Apply platform-specific best practices for ${platformFocus && platformFocus !== 'Mixed / All' ? platformFocus : 'all platforms'}
- Focus on content types and formats that resonate with ${audience} in the ${niche} space
- Build on what's working: Use insights from successful ${niche} creators targeting ${audience}
`;
  } catch (error: any) {
    console.error("[researchNicheStrategy] Error:", error);
    return "Niche research unavailable. Using general best practices and goal-specific frameworks.";
  }
}

