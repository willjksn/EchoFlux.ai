/**
 * OnlyFans-Specific Research Helper
 * 
 * Provides centralized function to get OnlyFans-specific research context
 * Combines weekly trends + OnlyFans-specific Tavily searches
 * Returns formatted context for Gemini AI prompts
 */

import { getLatestTrends } from "./_trendsHelper.js";
import { searchWeb } from "./_webSearch.js";
import { canUseTavily, recordTavilyUsage } from "./_tavilyUsage.js";

interface OnlyFansResearchResult {
  category: string;
  query: string;
  results: Array<{
    title: string;
    link: string;
    snippet: string;
  }>;
}

/**
 * Get OnlyFans-specific research context for AI prompts
 * 
 * @param audience - Target audience (e.g., "Subscribers", "Fans")
 * @param goal - Primary goal (e.g., "Engagement", "Sales Conversion")
 * @param userId - User ID for usage tracking (optional)
 * @param userPlan - User plan for limit checking (optional)
 * @param userRole - User role (optional)
 */
export async function getOnlyFansResearchContext(
  audience: string = "Subscribers",
  goal: string = "Engagement",
  userId?: string,
  userPlan?: string,
  userRole?: string
): Promise<string> {
  try {
    // Get weekly trends first (includes OnlyFans category if added to weeklyTrendsJob)
    let weeklyTrends = '';
    try {
      weeklyTrends = await getLatestTrends();
    } catch (error) {
      console.log('[OnlyFansResearch] Could not fetch weekly trends, continuing with Tavily only');
    }

    // OnlyFans-specific research queries
    const onlyfansQueries = [
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
      },
    ];

    const allResearch: OnlyFansResearchResult[] = [];

    // Fetch research for each category
    for (const { category, query } of onlyfansQueries) {
      try {
        console.log(`[OnlyFansResearch] Researching: ${category} - ${query}`);
        
        // Check Tavily usage limits if user info provided
        if (userId && userPlan) {
          const tavilyCheck = await canUseTavily(userId, userPlan, userRole);
          if (!tavilyCheck.allowed) {
            console.log(`[OnlyFansResearch] Tavily limit reached for user ${userId}, skipping ${category}`);
            // Continue with other categories, but skip this one
            continue;
          }
        }
        
        // Use searchWeb with user tracking if provided
        const searchResult = await searchWeb(query, userId, userPlan, userRole);
        
        // Record Tavily usage if user info provided and search was successful
        if (userId && userPlan && searchResult.success && searchResult.results.length > 0) {
          await recordTavilyUsage(userId, userPlan, userRole);
        }
        
        if (searchResult.success && searchResult.results.length > 0) {
          allResearch.push({
            category,
            query,
            results: searchResult.results.slice(0, 5), // Top 5 results per category
          });
          console.log(`[OnlyFansResearch] Found ${searchResult.results.length} results for ${category}`);
        } else {
          console.log(`[OnlyFansResearch] No results for ${category}: ${searchResult.note || "Unknown error"}`);
        }
      } catch (error: any) {
        console.error(`[OnlyFansResearch] Error researching ${category}:`, error);
        // Continue with other categories even if one fails
      }
    }

    // Format research for AI consumption
    let researchContext = '';
    
    if (weeklyTrends && weeklyTrends !== 'Trend data unavailable. Using general best practices.') {
      researchContext += `\n${weeklyTrends}\n\n`;
    }

    if (allResearch.length === 0) {
      // If no Tavily research but we have weekly trends, use those
      if (researchContext) {
        return `ONLYFANS RESEARCH CONTEXT:\n${researchContext}\n\nNote: OnlyFans-specific research unavailable. Using general trends and best practices for OnlyFans creators targeting ${audience}.`;
      }
      return "OnlyFans research unavailable. Using general best practices for adult content creators.";
    }

    const formattedResearch = allResearch.map((research) => {
      const results = research.results
        .map((r, idx) => `${idx + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.link}`)
        .join("\n\n");
      
      return `\n${research.category.toUpperCase().replace(/_/g, " ")}:\n${results}`;
    }).join("\n\n");

    return `
ONLYFANS-SPECIFIC RESEARCH CONTEXT:

${researchContext ? 'GENERAL SOCIAL MEDIA TRENDS (from weekly research - no cost):' : ''}
${researchContext}

ONLYFANS-SPECIFIC RESEARCH (targeted for OnlyFans creators):

Target Audience: ${audience}
Primary Goal: ${goal}

${formattedResearch}

KEY INSIGHTS FOR ONLYFANS CREATORS:
- Use successful OnlyFans strategies and tactics that are working for ${audience}
- Incorporate proven content formats and engagement tactics from top OnlyFans creators
- Leverage current OnlyFans monetization strategies aligned with ${goal}
- Apply OnlyFans platform-specific best practices and features
- Focus on content types and formats that resonate with ${audience} on OnlyFans
- Stay current with OnlyFans platform updates and new features
- Build on what's working: Use insights from successful OnlyFans creators targeting ${audience}
`;
  } catch (error: any) {
    console.error("[getOnlyFansResearchContext] Error:", error);
    return "OnlyFans research unavailable. Using general best practices for adult content creators.";
  }
}


