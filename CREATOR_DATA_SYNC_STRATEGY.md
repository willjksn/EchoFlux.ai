# Creator Data Sync Strategy

## Overview
This document outlines the recommended approach for syncing trending topics, DMs, and comments for creators.

---

## 1. Trending Topics Scraping

### Current Implementation
- `findTrends` API analyzes creator's own posts to find patterns
- Not scraping external trending topics yet

### Recommended Approach

#### Option A: External Trending Topics (New Feature)
**Frequency: Every 4-6 hours**

**Why:**
- Trending topics change slowly (hourly/daily cycles)
- Reduces API costs and rate limit issues
- Most creators don't need minute-by-minute trend updates

**Implementation:**
```typescript
// Background job (Vercel Cron or separate service)
// Runs every 4-6 hours
async function scrapeTrendingTopics() {
  // Aggregate trending topics from:
  // - Instagram Explore (via API)
  // - Twitter/X Trending (via API)
  // - TikTok Trending (via API)
  // - YouTube Trending (via API)
  
  // Store in Firestore: trending_topics/{platform}/{date}
}
```

**Considerations:**
- **API Rate Limits**: Most platforms limit trending endpoints
- **Cost**: Each API call costs money
- **Relevance**: Filter by creator's niche/interests

#### Option B: User-Triggered Analysis (Current)
**Frequency: On-demand (when user clicks "Find Trends")**

**Why:**
- No background costs
- User controls when to analyze
- Can analyze their own content anytime

**Recommendation:** Keep this as primary method, add Option A as premium feature

---

## 2. DMs and Comments Retrieval

### Current Implementation
- Firestore real-time listeners (but using mock data)
- No actual social media API integration yet

### Recommended Approach: Hybrid (Real-time + Polling)

#### For DMs: **Real-time Webhooks (Preferred) + Polling Fallback**

**Primary: Webhooks (Real-time)**
```typescript
// When available from platform APIs
// Instagram: Webhooks for DMs
// Twitter/X: Webhooks for DMs
// TikTok: Webhooks for messages
```

**Frequency:** Instant (as they come in)

**Why:**
- Best user experience
- No unnecessary API calls
- Immediate notifications

**Fallback: Polling**
```typescript
// If webhooks not available or fail
// Poll every 5-15 minutes
```

**Frequency:** Every 5-15 minutes

**Why:**
- Some platforms don't support webhooks
- Backup if webhook fails
- Balances freshness vs API costs

#### For Comments: **Polling (Most Platforms) + Webhooks (Where Available)**

**Frequency:** Every 5-10 minutes

**Why:**
- Comments are less urgent than DMs
- Most platforms have better rate limits for comments
- 5-10 minutes is acceptable delay for most creators

**Platform-Specific:**

| Platform | Method | Frequency | Notes |
|----------|--------|-----------|-------|
| **Instagram** | Webhooks + Polling | 5-10 min | Webhooks available for Business accounts |
| **Twitter/X** | Polling | 5-15 min | Webhooks limited, polling more reliable |
| **TikTok** | Polling | 10-15 min | No webhooks, must poll |
| **YouTube** | Webhooks + Polling | 5-10 min | YouTube Data API v3 supports webhooks |
| **LinkedIn** | Polling | 15-30 min | Rate limits are strict |
| **Facebook** | Webhooks + Polling | 5-10 min | Webhooks available via Graph API |
| **Threads** | Polling | 10-15 min | Similar to Instagram |

---

## 3. Implementation Strategy

### Phase 1: Polling (Quick Win)
```typescript
// api/syncSocialData.ts
// Vercel Cron Job: Runs every 5-10 minutes

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Get all users with connected accounts
  // 2. For each user, fetch DMs/comments from each platform
  // 3. Store in Firestore
  // 4. Trigger notifications for new items
}
```

**Vercel Cron Configuration:**
```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/syncSocialData",
      "schedule": "*/10 * * * *"  // Every 10 minutes
    },
    {
      "path": "/api/scrapeTrendingTopics",
      "schedule": "0 */4 * * *"  // Every 4 hours
    }
  ]
}
```

### Phase 2: Webhooks (Better UX)
```typescript
// api/webhooks/instagram.ts
// api/webhooks/twitter.ts
// etc.

// Receive webhook from platform
// Store immediately in Firestore
// Trigger real-time notification
```

**Webhook Setup:**
- Each platform requires webhook registration
- Need public endpoint (Vercel handles this)
- Verify webhook signatures for security

### Phase 3: Smart Polling (Cost Optimization)
```typescript
// Adaptive polling based on:
// - User activity level
// - Time of day (less frequent at night)
// - Platform rate limits
// - User plan tier (Pro/Elite get faster sync)
```

---

## 4. Rate Limits & Costs

### Platform Rate Limits (Approximate)

| Platform | DMs/Comments Endpoint | Rate Limit | Notes |
|----------|---------------------|------------|-------|
| Instagram | Graph API | 200/hour | Per app |
| Twitter/X | API v2 | 300/15min | Per app |
| TikTok | Business API | 100/hour | Per app |
| YouTube | Data API v3 | 10,000/day | Per app |
| LinkedIn | Marketing API | 500/day | Per app |
| Facebook | Graph API | 200/hour | Per app |

### Cost Optimization Strategies

1. **Batch Requests**: Fetch multiple users' data in one request where possible
2. **Incremental Sync**: Only fetch new items since last sync (use timestamps)
3. **User-Based Frequency**: 
   - Active users: 5 min
   - Inactive users: 30 min
   - Pro/Elite plans: Faster sync
4. **Time-Based Throttling**: Less frequent at night (2am-6am)

---

## 5. Recommended Frequencies Summary

### Trending Topics
- **External scraping**: Every 4-6 hours (background job)
- **User's own content analysis**: On-demand (when user requests)

### DMs
- **Primary**: Real-time webhooks (instant)
- **Fallback**: Poll every 5-10 minutes
- **Priority**: High (users expect immediate DM notifications)

### Comments
- **Primary**: Poll every 5-10 minutes
- **Webhooks**: Use where available (Instagram, YouTube, Facebook)
- **Priority**: Medium (acceptable delay)

### Posts/Analytics
- **Poll**: Every 15-30 minutes
- **Priority**: Low (less time-sensitive)

---

## 6. User Experience Considerations

### Notification Strategy
```typescript
// Real-time notifications for:
// - New DMs (immediate)
// - New comments on recent posts (< 24 hours old)
// - Mentions/tags (immediate)

// Delayed notifications for:
// - Comments on old posts (> 24 hours)
// - Analytics updates
```

### UI Indicators
- Show "Last synced: 2 minutes ago" badge
- Allow manual "Refresh" button
- Show sync status per platform

---

## 7. Implementation Priority

### MVP (Phase 1)
1. ✅ Polling for DMs/comments (every 10 minutes)
2. ✅ User-triggered trend analysis (current)
3. ⏳ Basic notifications

### Phase 2
1. ⏳ Webhook support (Instagram, YouTube, Facebook)
2. ⏳ External trending topics scraping
3. ⏳ Smart polling based on activity

### Phase 3
1. ⏳ Adaptive frequency per user
2. ⏳ Real-time notifications
3. ⏳ Advanced filtering and prioritization

---

## 8. Technical Implementation

### Example: Polling Service
```typescript
// api/syncSocialData.ts
import { getAdminDb } from './_firebaseAdmin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getAdminDb();
  
  // Get all users with connected accounts
  const usersSnapshot = await db.collection('users')
    .where('socialAccounts', '!=', null)
    .get();

  for (const userDoc of usersSnapshot.docs) {
    const user = userDoc.data();
    const userId = userDoc.id;

    // Sync each platform
    for (const platform of ['Instagram', 'Twitter', 'TikTok', ...]) {
      if (user.socialAccounts?.[platform]?.connected) {
        await syncPlatformData(userId, platform, user.socialAccounts[platform]);
      }
    }
  }

  return res.status(200).json({ success: true });
}

async function syncPlatformData(userId: string, platform: string, account: any) {
  // Fetch new DMs/comments since last sync
  // Store in Firestore
  // Trigger notifications
}
```

### Example: Webhook Handler
```typescript
// api/webhooks/instagram.ts
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify webhook signature
  // Process incoming DM/comment
  // Store in Firestore immediately
  // Trigger real-time notification
  
  return res.status(200).json({ success: true });
}
```

---

## Summary

**Trending Topics:**
- External scraping: **Every 4-6 hours** (background job)
- User analysis: **On-demand** (current implementation)

**DMs:**
- **Real-time webhooks** (preferred) + **5-10 min polling** (fallback)

**Comments:**
- **5-10 min polling** (primary) + **webhooks** (where available)

**Key Principle:** Balance freshness with API costs and rate limits. Prioritize DMs (most urgent), then comments, then analytics.

