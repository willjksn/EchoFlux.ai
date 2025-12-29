# OnlyFans Studio Dynamic Integration Plan

## Overview
This plan outlines how to connect OnlyFans Studio guides and tips to Gemini AI, integrate weekly Tavily searches for OnlyFans-specific updates, and incorporate creator analytics/insights into dynamic content generation.

## Current State Analysis

### OnlyFans Studio (`components/OnlyFansContentBrain.tsx`)
- **Current Features:**
  - AI Captions generation
  - Post Ideas generation
  - Shoot Concepts generation
  - Weekly Plan generation (uses `generateContentStrategy` API)
  - Monetization Planner
- **Current AI Integration:**
  - Uses `/api/generateCaptions` for captions
  - Uses `/api/generateText` for post ideas and shoot concepts
  - Uses `/api/generateContentStrategy` for weekly plans
  - Uses `/api/generateMonetizationPlan` for monetization planning
- **Issues:**
  - Content is static - doesn't adapt to weekly trends
  - No OnlyFans-specific research in Tavily searches
  - Creator analytics/insights not integrated
  - Guides and tips are not AI-powered or dynamic

### Tavily Weekly Search System
- **Location:** `api/_nicheResearch.ts` - `researchNicheStrategy()` function
- **Current Behavior:**
  - Performs 5 niche-specific Tavily searches per strategy generation
  - Includes weekly trends from Firestore (`weekly_trends` collection)
  - Weekly trends updated every Monday
- **Missing:**
  - OnlyFans-specific research queries
  - OnlyFans Studio guides/tips integration

### Weekly Trends System
- **Location:** `api/_trendsHelper.ts` - `getLatestTrends()` function
- **Current Behavior:**
  - Fetches from Firestore `weekly_trends/latest` document
  - Contains general social media trends
- **Missing:**
  - OnlyFans-specific trend categories
  - OnlyFans Studio best practices

### Analytics Integration
- **Current State:**
  - `generateContentStrategy` accepts `analyticsData` parameter
  - Analytics context is built and passed to Gemini
  - OnlyFans Studio doesn't use analytics data
- **Missing:**
  - OnlyFans Studio features don't accept/use analytics
  - No way for creators to input their own insights

## Implementation Plan

### Phase 1: Enhance Weekly Tavily Searches for OnlyFans

#### 1.1 Update `_nicheResearch.ts` to Include OnlyFans-Specific Queries
**File:** `api/_nicheResearch.ts`

**Changes:**
- Detect when niche contains "OnlyFans" or "Adult Content Creator"
- Add OnlyFans-specific research categories:
  - `onlyfans_best_practices`: "OnlyFans content strategy best practices [audience] [goal]"
  - `onlyfans_trending_content`: "OnlyFans trending content types [audience] [goal]"
  - `onlyfans_monetization_tips`: "OnlyFans monetization strategies tips [goal]"
  - `onlyfans_engagement_tactics`: "OnlyFans subscriber engagement strategies [audience]"
  - `onlyfans_platform_updates`: "OnlyFans platform updates features changes"

**Implementation:**
```typescript
// In researchNicheStrategy function, after line 58
const isOnlyFansNiche = niche.toLowerCase().includes('onlyfans') || 
                        niche.toLowerCase().includes('adult content creator') ||
                        platformFocus === 'OnlyFans';

if (isOnlyFansNiche) {
  // Add OnlyFans-specific queries
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
```

#### 1.2 Update Weekly Trends to Include OnlyFans Category
**File:** `api/_trendsHelper.ts` (or the job that populates weekly_trends)

**Changes:**
- Add OnlyFans-specific trend category to weekly trends
- Query: "OnlyFans creator tips strategies 2024"
- Store in `weekly_trends/latest` document

**Note:** This requires updating the weekly trends job (likely a separate cron job or scheduled function). The job should include:
```typescript
{
  category: "onlyfans_creator_tips",
  query: "OnlyFans creator tips strategies best practices 2024",
  // ... results from Tavily
}
```

### Phase 2: Connect OnlyFans Studio to Gemini with Dynamic Context

#### 2.1 Create OnlyFans-Specific Research Helper
**New File:** `api/_onlyfansResearch.ts`

**Purpose:**
- Centralized function to get OnlyFans-specific research
- Combines weekly trends + OnlyFans-specific Tavily searches
- Returns formatted context for Gemini

**Implementation:**
```typescript
export async function getOnlyFansResearchContext(
  audience: string,
  goal: string,
  userId?: string,
  userPlan?: string,
  userRole?: string
): Promise<string> {
  // Get weekly trends (includes OnlyFans category if added)
  const weeklyTrends = await getLatestTrends();
  
  // Get OnlyFans-specific research via Tavily
  const onlyfansResearch = await researchOnlyFansStrategy(
    audience,
    goal,
    userId,
    userPlan,
    userRole
  );
  
  return `${weeklyTrends}\n\n${onlyfansResearch}`;
}
```

#### 2.2 Update OnlyFans Studio API Endpoints

**2.2.1 Update Caption Generation**
**File:** `api/generateCaptions.ts`

**Changes:**
- When platform is OnlyFans, fetch OnlyFans research context
- Include in Gemini prompt for better, current captions

**2.2.2 Update Post Ideas Generation**
**File:** `api/generateText.ts` (or wherever post ideas are generated)

**Changes:**
- Detect OnlyFans context
- Include OnlyFans research in prompt
- Make suggestions current and trend-aware

**2.2.3 Update Weekly Plan Generation**
**File:** `components/OnlyFansContentBrain.tsx` (line 288)

**Current:** Uses `generateContentStrategy` API
**Enhancement:** 
- Already uses `generateContentStrategy` which includes niche research
- Ensure OnlyFans niche triggers OnlyFans-specific research (Phase 1)

**2.2.4 Update Shoot Concepts Generation**
**File:** `api/generateText.ts`

**Changes:**
- Include OnlyFans research context
- Make shoot concepts current with trends

**2.2.5 Update Monetization Planner**
**File:** `api/generateMonetizationPlan.ts`

**Changes:**
- Include OnlyFans research context
- Use current monetization strategies

### Phase 3: Integrate Creator Analytics/Insights

#### 3.1 Add Analytics Input to OnlyFans Studio UI
**File:** `components/OnlyFansContentBrain.tsx`

**Changes:**
- Add optional "Analytics & Insights" section to each tab
- Allow creators to input:
  - Subscriber count
  - Engagement rates
  - Top performing content types
  - Best posting times
  - Revenue metrics
  - Custom insights/notes

**UI Addition:**
```typescript
// New state
const [creatorAnalytics, setCreatorAnalytics] = useState({
  subscriberCount: '',
  engagementRate: '',
  topContentTypes: [],
  bestPostingTimes: [],
  revenueMetrics: {},
  customInsights: ''
});

// Add collapsible section in each tab
<div className="mb-4">
  <button onClick={() => setShowAnalytics(!showAnalytics)}>
    Include My Analytics & Insights
  </button>
  {showAnalytics && (
    <div>
      {/* Analytics input fields */}
    </div>
  )}
</div>
```

#### 3.2 Pass Analytics to API Endpoints
**File:** `components/OnlyFansContentBrain.tsx`

**Changes:**
- Include `analyticsData` in all API calls
- Format similar to `generateContentStrategy` analytics context

**Example:**
```typescript
// In handleGenerateCaptions
body: JSON.stringify({
  // ... existing fields
  analyticsData: creatorAnalytics.subscriberCount ? {
    subscriberCount: creatorAnalytics.subscriberCount,
    engagementRate: creatorAnalytics.engagementRate,
    topContentTypes: creatorAnalytics.topContentTypes,
    bestPostingTimes: creatorAnalytics.bestPostingTimes,
    customInsights: creatorAnalytics.customInsights
  } : undefined
})
```

#### 3.3 Update API Endpoints to Use Analytics
**Files:**
- `api/generateCaptions.ts`
- `api/generateText.ts`
- `api/generateMonetizationPlan.ts`

**Changes:**
- Accept `analyticsData` parameter
- Build analytics context similar to `generateContentStrategy.ts` (lines 71-94)
- Include in Gemini prompt

**Example Context Building:**
```typescript
let analyticsContext = '';
if (analyticsData) {
  analyticsContext = `
CREATOR ANALYTICS & INSIGHTS:
- Subscriber Count: ${analyticsData.subscriberCount || 'Not provided'}
- Engagement Rate: ${analyticsData.engagementRate || 'Not provided'}
- Top Performing Content Types: ${analyticsData.topContentTypes?.join(', ') || 'Not provided'}
- Best Posting Times: ${analyticsData.bestPostingTimes?.join(', ') || 'Not provided'}
- Custom Insights: ${analyticsData.customInsights || 'None'}

Use this data to:
1. Tailor suggestions to what's already working
2. Focus on content types that perform well
3. Schedule suggestions around best posting times
4. Scale what's successful
`;
}
```

### Phase 4: Make Guides and Tips Dynamic

#### 4.1 Create OnlyFans Guides/Tips API Endpoint
**New File:** `api/getOnlyFansGuides.ts`

**Purpose:**
- Generate dynamic guides and tips using Gemini
- Uses OnlyFans research context
- Updates based on weekly Tavily searches

**Implementation:**
```typescript
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Get OnlyFans research context
  const researchContext = await getOnlyFansResearchContext(
    req.body.audience || 'Subscribers',
    req.body.goal || 'Engagement',
    user?.uid,
    userPlan
  );
  
  // Get creator analytics if provided
  const analyticsContext = buildAnalyticsContext(req.body.analyticsData);
  
  // Generate dynamic guides using Gemini
  const prompt = `
You are an OnlyFans content strategy expert. Generate current, actionable guides and tips.

${researchContext}

${analyticsContext}

Generate:
1. Content Strategy Tips (5-7 tips)
2. Engagement Tactics (5-7 tactics)
3. Monetization Strategies (5-7 strategies)
4. Common Mistakes to Avoid (5-7 mistakes)
5. Platform Best Practices (5-7 practices)

Make all suggestions current, specific, and actionable. Base them on the latest research and trends provided above.
`;
  
  // Use Gemini to generate
  // Return formatted guides
}
```

#### 4.2 Add Guides/Tips Section to OnlyFans Studio
**File:** `components/OnlyFansContentBrain.tsx`

**Changes:**
- Add new tab: "Guides & Tips"
- Fetch dynamic guides on tab open
- Display in organized sections
- Refresh button to get latest updates

**Implementation:**
```typescript
const [guides, setGuides] = useState(null);
const [guidesLoading, setGuidesLoading] = useState(false);

const fetchGuides = async () => {
  setGuidesLoading(true);
  try {
    const response = await fetch('/api/getOnlyFansGuides', {
      method: 'POST',
      body: JSON.stringify({
        audience: 'Subscribers',
        goal: 'Engagement',
        analyticsData: creatorAnalytics
      })
    });
    const data = await response.json();
    setGuides(data.guides);
  } finally {
    setGuidesLoading(false);
  }
};
```

### Phase 5: Ensure Weekly Updates Flow Through

#### 5.1 Update Weekly Trends Job
**Location:** (Separate cron job or scheduled function)

**Changes:**
- Include OnlyFans-specific queries in weekly trends
- Store in `weekly_trends/latest` document
- Categories to include:
  - `onlyfans_creator_tips`
  - `onlyfans_monetization_strategies`
  - `onlyfans_platform_updates`
  - `onlyfans_engagement_tactics`

#### 5.2 Cache Invalidation Strategy
**Purpose:**
- Ensure OnlyFans Studio always uses latest trends
- Don't cache stale research data

**Implementation:**
- Weekly trends are fetched fresh from Firestore (already implemented)
- Tavily searches are performed on-demand (already implemented)
- Guides can be cached for 24 hours, then refresh

## Implementation Order

1. **Phase 1.1** - Update `_nicheResearch.ts` for OnlyFans queries
2. **Phase 1.2** - Update weekly trends job (if accessible)
3. **Phase 2.1** - Create `_onlyfansResearch.ts` helper
4. **Phase 2.2** - Update API endpoints to use OnlyFans research
5. **Phase 3** - Add analytics input and integration
6. **Phase 4** - Create dynamic guides/tips
7. **Phase 5** - Ensure weekly updates flow

## Testing Checklist

- [ ] OnlyFans niche triggers OnlyFans-specific Tavily searches
- [ ] Weekly trends include OnlyFans category
- [ ] OnlyFans Studio features use dynamic research context
- [ ] Creator analytics are accepted and used in prompts
- [ ] Guides and tips update with weekly trends
- [ ] All OnlyFans Studio tabs benefit from dynamic context
- [ ] Analytics integration improves suggestion quality

## Files to Modify

1. `api/_nicheResearch.ts` - Add OnlyFans queries
2. `api/_trendsHelper.ts` - (May need to update trends job separately)
3. `api/_onlyfansResearch.ts` - **NEW FILE**
4. `api/generateCaptions.ts` - Add OnlyFans research context
5. `api/generateText.ts` - Add OnlyFans research context
6. `api/generateMonetizationPlan.ts` - Add OnlyFans research + analytics
7. `api/getOnlyFansGuides.ts` - **NEW FILE**
8. `components/OnlyFansContentBrain.tsx` - Add analytics input, guides tab

## Notes

- Weekly trends job may be in a separate codebase (Vercel cron, Cloud Functions, etc.)
- Need to verify where weekly trends are populated
- Analytics input is optional - don't break existing functionality
- All changes should be backward compatible
- OnlyFans-specific features should only activate when OnlyFans is detected



