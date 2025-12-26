# Tavily Usage Analysis & Recommendations

## Current Situation

### Total Tavily Budget
- **1,000 searches/month** total available

### Current Usage Breakdown

#### 1. **Weekly Trends Job (System - Doesn't Count Against Users)**
- **Frequency:** Runs every Monday
- **Searches per run:** 8 searches (one per category)
- **Monthly usage:** ~32 searches/month (8 × 4 weeks)
- **Purpose:** Fetches general social media trends, stores in Firestore
- **Benefit:** All users get access to weekly trends without using their quota
- **Status:** ✅ This is smart - shared resource for all users

#### 2. **Strategy Generation (User-Specific)**
- **Searches per strategy:** 8 searches (via `researchNicheStrategy`)
- **Research categories:** 8 categories per strategy:
  1. Niche best practices
  2. Successful strategies
  3. Competitor analysis
  4. Content ideas
  5. Platform strategy
  6. Engagement tactics
  7. Content formats
  8. Hashtag strategy
- **Current limits:**
  - Free: 1 strategy/month = 8 searches (but Free doesn't get Tavily, uses weekly trends only)
  - Pro: 2 strategies/month = 16 searches
  - Elite: 5 strategies/month = 40 searches

#### 3. **Other Tavily Usage Points (User-Specific)**
- **findTrendsByNiche** (Opportunities page): 1 search per call
- **fetchCurrentInfo** (Voice Assistant - Elite only): 1 search per call
- **getTrendingContext** (AI intelligence features - Elite only): Multiple searches per call
- **analyzeContentGaps, optimizeCaption, predictContentPerformance, repurposeContent** (Elite only): Use getTrendingContext

---

## The Problem

### Current Limits Are Too Generous

**Pro Plan (20 searches/month):**
- 2 strategies × 8 searches = **16 searches**
- Remaining: **4 searches** for other uses
- **Problem:** Users can't use Opportunities, Voice Assistant, or other trend features

**Elite Plan (50 searches/month):**
- 5 strategies × 8 searches = **40 searches**
- Remaining: **10 searches** for other uses
- **Problem:** Elite features (Voice Assistant, AI intelligence) need more searches

### Budget Math

**With 1,000 searches/month:**
- Weekly job: 32 searches
- **Remaining for users: 968 searches**

**If we have:**
- 30 Pro users × 20 searches = 600 searches
- 10 Elite users × 50 searches = 500 searches
- **Total: 1,100 searches** (exceeds budget!)

**Realistic scenario:**
- 50 Pro users × 16 searches (just strategies) = 800 searches
- 20 Elite users × 40 searches (just strategies) = 800 searches
- **Total: 1,600 searches** (way over budget!)

---

## Difference Between "Live Trend Research" and "Enhanced Live Trend Research"

### Current Implementation
**There is NO functional difference** - both use the same Tavily system:
- Same `searchWeb()` function
- Same research quality
- Same 8 searches per strategy

**The ONLY difference is the quota:**
- **Pro:** 20 Tavily searches/month
- **Elite:** 50 Tavily searches/month (2.5x more)

### What This Means
- "Live trend research" = Access to Tavily with 20 searches/month
- "Enhanced live trend research" = Access to Tavily with 50 searches/month
- Both provide the same quality of research, Elite just gets more searches

---

## Recommendations

### Option 1: Reduce Limits (Conservative)
**Goal:** Stay within 1,000 searches/month budget

**New Limits:**
- **Free:** 0 searches (uses weekly trends only) ✅ Already correct
- **Pro:** 16 searches/month (exactly 2 strategies)
- **Elite:** 32 searches/month (exactly 4 strategies)

**Math:**
- 50 Pro users × 16 = 800 searches
- 20 Elite users × 32 = 640 searches
- Weekly job: 32 searches
- **Total: 1,472 searches** (still over, but closer)

**Pricing Updates:**
- Pro: "Live trend research included (16 searches/month - 2 strategies)"
- Elite: "Enhanced live trend research (32 searches/month - 4 strategies)"

**Pros:**
- More realistic budget
- Clear connection between searches and strategies

**Cons:**
- Elite users can't use other Tavily features (Voice Assistant, Opportunities)
- Less value proposition

---

### Option 2: Separate Strategy and Trend Limits (Recommended)
**Goal:** Allow strategies + other features within budget

**New Structure:**
- **Strategy Generation:** Separate limit (doesn't count against Tavily)
- **Tavily Searches:** For other features (Opportunities, Voice Assistant, etc.)

**New Limits:**
- **Free:**
  - Strategies: 1/month (basic, no Tavily - uses weekly trends)
  - Tavily searches: 0
- **Pro:**
  - Strategies: 2/month (with Tavily research - 16 searches)
  - Tavily searches: 4/month (for Opportunities, etc.)
  - **Total: 20 searches/month**
- **Elite:**
  - Strategies: 5/month (with Tavily research - 40 searches)
  - Tavily searches: 10/month (for Voice Assistant, AI intelligence, etc.)
  - **Total: 50 searches/month**

**Implementation:**
- Strategy generation: Deduct from strategy limit + Tavily limit
- Other features: Only deduct from Tavily limit

**Pricing Updates:**
- Pro: "Live trend research included (20 searches/month)"
- Elite: "Enhanced live trend research (50 searches/month)"

**Pros:**
- Users can use both strategies AND other features
- Better value proposition
- Clear separation of concerns

**Cons:**
- More complex tracking (two separate limits)
- Need to update code to track separately

---

### Option 3: Reduce Strategy Searches (Aggressive)
**Goal:** Maximize number of users within budget

**Reduce searches per strategy:**
- Current: 8 searches per strategy
- New: 4 searches per strategy (reduce research categories)

**New Limits:**
- **Free:** 0 searches (uses weekly trends)
- **Pro:** 12 searches/month (3 strategies × 4 searches)
- **Elite:** 24 searches/month (6 strategies × 4 searches)

**Math:**
- 50 Pro users × 12 = 600 searches
- 20 Elite users × 24 = 480 searches
- Weekly job: 32 searches
- **Total: 1,112 searches** (still slightly over, but manageable)

**Pros:**
- More strategies per user
- Better budget management

**Cons:**
- Lower quality research (fewer categories)
- Need to reduce research categories in `_nicheResearch.ts`

---

### Option 4: Hybrid Approach (Best Balance)
**Goal:** Balance quality, features, and budget

**Strategy Generation:**
- Keep 8 searches per strategy (maintain quality)
- But make it more efficient:
  - Cache results better
  - Skip categories if limit reached (already implemented)
  - Use weekly trends more (reduce redundant searches)

**New Limits:**
- **Free:** 0 searches (1 strategy/month, uses weekly trends only)
- **Pro:** 16 searches/month (2 strategies guaranteed, or mix of strategies + other features)
- **Elite:** 40 searches/month (5 strategies guaranteed, or mix of strategies + other features)

**Smart Usage:**
- Strategy generation: Use weekly trends when possible, only use Tavily for niche-specific research
- Other features: Use Tavily for real-time needs

**Pricing Updates:**
- Pro: "Live trend research included (16 searches/month)"
- Elite: "Enhanced live trend research (40 searches/month)"

**Math:**
- 50 Pro users × 16 = 800 searches
- 20 Elite users × 40 = 800 searches
- Weekly job: 32 searches
- **Total: 1,632 searches** (still over, but more realistic)

**Need to:**
- Optimize weekly trends job to cover more categories
- Use weekly trends in strategy generation when possible
- Only use Tavily for niche-specific research

---

## Recommended Solution: Option 4 (Hybrid) with Optimizations

### 1. Optimize Weekly Trends Job
**Current:** 8 searches/week
**Enhancement:** Add more categories, but cache better
- Add niche-specific trend categories
- Store trends by niche/audience
- Reuse in strategy generation

### 2. Smart Strategy Generation
**Current:** Always uses 8 Tavily searches
**Enhancement:** 
- Use weekly trends when available (no Tavily cost)
- Only use Tavily for niche-specific research not in weekly trends
- Reduce to 4-6 searches per strategy on average

### 3. Update Limits
- **Free:** 0 searches (1 strategy/month, weekly trends only)
- **Pro:** 16 searches/month (2 strategies + some other features)
- **Elite:** 40 searches/month (5 strategies + other features)

### 4. Update Pricing Copy
- **Pro:** "Live trend research included (16 searches/month)"
- **Elite:** "Enhanced live trend research (40 searches/month)"
- **Clarify:** Both use the same quality research, Elite gets more searches

---

## Implementation Steps

### Phase 1: Update Limits (Immediate)
1. Update `api/_tavilyUsage.ts`:
   - Pro: 20 → 16
   - Elite: 50 → 40
2. Update pricing pages to reflect new limits
3. Update Terms.tsx

### Phase 2: Optimize Strategy Generation (Short-term)
1. Enhance weekly trends job to include more niche categories
2. Update `researchNicheStrategy` to check weekly trends first
3. Only use Tavily for niche-specific research not in weekly trends
4. Target: 4-6 searches per strategy (down from 8)

### Phase 3: Better Tracking (Medium-term)
1. Add separate tracking for strategy vs. other Tavily usage
2. Show users their usage breakdown
3. Add warnings when approaching limits

---

## Summary

**Key Findings:**
1. ✅ Weekly trends job is smart (shared resource)
2. ❌ Current limits are too generous for 1,000/month budget
3. ❌ "Live" vs "Enhanced" is just quota difference, not quality
4. ✅ Strategy generation uses 8 Tavily searches per strategy
5. ✅ Other features (Opportunities, Voice Assistant) also use Tavily

**Recommended Action:**
- Reduce Pro limit: 20 → 16 searches/month
- Reduce Elite limit: 50 → 40 searches/month
- Optimize strategy generation to use weekly trends more
- Update pricing to clarify limits
- Consider separating strategy and trend limits in future

**Budget Reality:**
- With current limits, you can support ~30-40 active users max
- With recommended limits, you can support ~50-60 active users
- Need to optimize or increase budget for more users


