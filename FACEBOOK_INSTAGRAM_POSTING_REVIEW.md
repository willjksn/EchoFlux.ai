# Facebook & Instagram Posting Capability Review

## Executive Summary

This review examines the application's ability to post to Facebook and Instagram business/community/creator pages, including the process for posting planned content when users are offline.

**Status: ❌ NOT FULLY IMPLEMENTED**

The application currently has infrastructure for scheduling posts and storing them in Firestore, but **lacks the actual API integration** to publish posts to Facebook and Instagram platforms. Posts marked as "Published" or "Scheduled" are only saved to the database and never actually sent to the social media platforms.

---

## Current Implementation Analysis

### 1. Post Creation & Scheduling Flow

#### Where Posts Are Created:
- **`components/Compose.tsx`** - Main compose interface
  - Creates `Post` objects with status "Scheduled" or "Published"
  - Saves posts to Firestore: `users/{userId}/posts/{postId}`
  - Creates `CalendarEvent` entries for scheduled posts
  - ✅ **Working:** Post creation and scheduling UI works correctly

#### Key Code Locations:
```typescript
// components/Compose.tsx (lines 811-894)
const handleBulkSchedule = async (publishNow: boolean = false) => {
  // Creates Post with status: publishNow ? 'Published' : 'Scheduled'
  // Saves to Firestore
  // Creates CalendarEvent entries
  // ❌ DOES NOT actually publish to Facebook/Instagram
}
```

### 2. Scheduled Post Processing

#### Current State:
- **`api/autoPostScheduled.ts`** - Stub implementation
  - Endpoint exists but contains placeholder code
  - Does not query Firestore for scheduled posts
  - Does not call Facebook/Instagram APIs
  - Returns success message without actually posting

```typescript
// api/autoPostScheduled.ts (lines 10-59)
export default async function handler(req, res) {
  // ❌ MISSING: Query Firestore for scheduled posts
  // ❌ MISSING: Call Facebook/Instagram Graph API
  // ❌ MISSING: Update post status after publishing
  return res.status(200).json({ success: true, message: "Auto-post service running" });
}
```

### 3. Facebook & Instagram API Integration

#### What Exists:
- **`api/platforms/facebook.ts`** - Partial implementation
  - ✅ Fetches Facebook messages/comments
  - ✅ Token refresh logic
  - ❌ **MISSING:** Post publishing functions

- **`api/platforms/instagram.ts`** - Partial implementation
  - ✅ Fetches Instagram DMs/comments
  - ✅ Token refresh logic
  - ❌ **MISSING:** Post publishing functions

#### What's Missing:

1. **Facebook Graph API Posting Functions:**
   ```typescript
   // NEEDED: api/platforms/facebook.ts
   export async function publishFacebookPost(
     account: FacebookAccount,
     content: string,
     mediaUrl?: string,
     mediaType?: 'image' | 'video',
     scheduledTime?: string
   ): Promise<{ postId: string }>
   ```

2. **Instagram Graph API Posting Functions:**
   ```typescript
   // NEEDED: api/platforms/instagram.ts
   export async function publishInstagramPost(
     account: InstagramAccount,
     content: string,
     mediaUrl: string,
     mediaType: 'IMAGE' | 'CAROUSEL' | 'REELS' | 'STORIES',
     scheduledTime?: string
   ): Promise<{ postId: string }>
   ```

### 4. OAuth & Account Connection

#### Current State:
- ✅ OAuth flow exists (`api/oauth/instagram/authorize.ts`, `api/oauth/instagram/callback.ts`)
- ✅ Social accounts stored in user settings
- ✅ Token storage in Firestore (assumed - needs verification)

#### Issues to Verify:
- Are Page tokens vs User tokens properly handled?
- Are long-lived tokens being exchanged correctly?
- Are required permissions requested during OAuth?

---

## Critical Gaps & Missing Features

### 1. ❌ No Actual Posting Implementation

**Issue:** Posts are created and saved to Firestore but never published to platforms.

**Impact:** Users can schedule posts, but they will never appear on Facebook/Instagram.

**Required Fix:**
- Implement Facebook Graph API posting endpoint
- Implement Instagram Graph API posting endpoint
- Integrate posting functions into the publish flow

### 2. ❌ Scheduled Post Processor Not Functional

**Issue:** `autoPostScheduled.ts` is a stub that doesn't process scheduled posts.

**Impact:** Scheduled posts will never be automatically published when the user is offline.

**Required Fix:**
- Implement Firestore query for posts with `status: 'Scheduled'` and `scheduledDate <= now`
- For each scheduled post, call the appropriate platform API
- Update post status to 'Published' after successful posting
- Handle errors and retry logic

### 3. ❌ No Cron Job/Scheduler Configuration

**Issue:** Even if `autoPostScheduled.ts` was implemented, there's no scheduled execution.

**Impact:** Scheduled posts won't be processed automatically.

**Required Fix:**
- Configure Vercel Cron (see `vercel.json`)
- Or set up Cloud Functions scheduled trigger
- Run every 5-15 minutes to check for posts ready to publish

### 4. ❌ Missing Error Handling & Retry Logic

**Issue:** No retry mechanism for failed posts.

**Impact:** If a post fails (network error, rate limit, etc.), it may never be published.

**Required Fix:**
- Implement exponential backoff retry logic
- Track retry attempts in post document
- Notify users of failed posts
- Queue failed posts for manual review

### 5. ❌ Token Management Concerns

**Issue:** Need to verify token refresh works before posting.

**Impact:** Posts may fail if tokens expire.

**Required Fix:**
- Verify token refresh in `platforms/facebook.ts` and `platforms/instagram.ts` is called before posting
- Handle token expiration errors gracefully
- Re-request OAuth if token refresh fails

### 6. ❌ Missing Post Type Support

**Issue:** Facebook and Instagram have different post types that may not all be supported.

**Impact:** Some post types (Reels, Stories, Carousel, etc.) may not work.

**Required Investigation:**
- Verify Instagram Reels posting support
- Verify Instagram Stories posting support
- Verify Facebook Video posting support
- Verify Carousel/Album posts

---

## Facebook & Instagram API Requirements

### Facebook Graph API Posting

**Required Endpoints:**
1. **Photo Post:**
   ```
   POST /{page-id}/photos
   {
     "url": "image_url",
     "message": "caption",
     "published": false,  // for scheduled
     "scheduled_publish_time": "unix_timestamp"
   }
   ```

2. **Video Post:**
   ```
   POST /{page-id}/videos
   {
     "file_url": "video_url",
     "description": "caption",
     "published": false,
     "scheduled_publish_time": "unix_timestamp"
   }
   ```

3. **Text Post:**
   ```
   POST /{page-id}/feed
   {
     "message": "text",
     "published": false,
     "scheduled_publish_time": "unix_timestamp"
   }
   ```

**Required Permissions:**
- `pages_manage_posts` - Post content
- `pages_read_engagement` - Read engagement
- `pages_show_list` - Access user's pages

### Instagram Graph API Posting

**Required Endpoints:**
1. **Image Post:**
   ```
   POST /{ig-user-id}/media
   {
     "image_url": "url",
     "caption": "text",
     "access_token": "..."
   }
   Then: POST /{ig-user-id}/media_publish
   ```

2. **Video/Reel:**
   ```
   POST /{ig-user-id}/media
   {
     "media_type": "REELS",
     "video_url": "url",
     "caption": "text"
   }
   Then: POST /{ig-user-id}/media_publish
   ```

**Required Permissions:**
- `instagram_basic` - Basic access
- `instagram_content_publish` - Publish content
- `pages_show_list` - Access pages

**Important Notes:**
- Instagram requires a 2-step process: create media container, then publish
- Instagram Business/Creator accounts only (not personal)
- Reels and Stories have different endpoints

---

## Recommended Implementation Path

### Phase 1: Core Posting Functions

1. **Implement Facebook Posting:**
   ```typescript
   // api/platforms/facebook.ts
   export async function publishFacebookPost(
     account: FacebookAccount,
     post: {
       content: string;
       mediaUrl?: string;
       mediaType?: 'image' | 'video';
       scheduledDate?: string;
     }
   ): Promise<{ postId: string; success: boolean }>
   ```

2. **Implement Instagram Posting:**
   ```typescript
   // api/platforms/instagram.ts
   export async function publishInstagramPost(
     account: InstagramAccount,
     post: {
       content: string;
       mediaUrl: string;
       mediaType: 'IMAGE' | 'VIDEO' | 'REELS';
       scheduledDate?: string;
     }
   ): Promise<{ postId: string; success: boolean }>
   ```

### Phase 2: Immediate Publishing

1. **Create API Endpoint:**
   ```typescript
   // api/publishPost.ts
   export default async function handler(req, res) {
     // Verify auth
     // Get post from Firestore
     // Call appropriate platform API
     // Update post status
     // Return result
   }
   ```

2. **Update Compose Component:**
   - When user clicks "Publish Now", call `/api/publishPost`
   - Show loading state
   - Handle errors
   - Update UI on success

### Phase 3: Scheduled Post Processing

1. **Complete `autoPostScheduled.ts`:**
   ```typescript
   export default async function handler(req, res) {
     // Query all users' posts where:
     //   status === 'Scheduled'
     //   scheduledDate <= now + 5 minutes
     //   
     // For each post:
     //   - Get user's social account tokens
     //   - Call publishPost API
     //   - Update status to 'Published' or 'Failed'
     //   - Log errors
   }
   ```

2. **Configure Cron Job:**
   ```json
   // vercel.json
   {
     "crons": [{
       "path": "/api/autoPostScheduled",
       "schedule": "*/5 * * * *"  // Every 5 minutes
     }]
   }
   ```

### Phase 4: Error Handling & Retry

1. **Add Retry Logic:**
   - Track retry count in post document
   - Exponential backoff (5min, 15min, 1hr, 6hr)
   - Max 3 retries before marking as failed

2. **User Notifications:**
   - Email/push notification on post failure
   - Dashboard alert for failed posts
   - Option to retry manually

---

## Testing Roadmap

### Prerequisites

1. **Set Up Test Accounts:**
   - Facebook Business Page (or use existing)
   - Instagram Business Account (connected to Facebook Page)
   - Facebook Developer App with proper permissions
   - Long-lived Page Access Token

2. **Environment Variables:**
   ```
   FACEBOOK_APP_ID=...
   FACEBOOK_APP_SECRET=...
   INSTAGRAM_CLIENT_SECRET=...
   ```

### Test Cases

#### 1. OAuth Connection Testing

**Test:** Verify users can connect Facebook/Instagram accounts

**Steps:**
1. Navigate to Settings → Social Accounts
2. Click "Connect" for Facebook
3. Complete OAuth flow
4. Verify token is stored in Firestore
5. Repeat for Instagram

**Expected Result:**
- OAuth flow completes successfully
- Account shows as "Connected" in UI
- Token stored in `users/{userId}/settings/socialAccounts`

**Test:** Verify token refresh works

**Steps:**
1. Connect account with short-lived token
2. Wait for token refresh (or manually trigger)
3. Verify new long-lived token is stored

**Expected Result:**
- Token refreshes automatically before expiration
- New token stored in Firestore

#### 2. Immediate Publishing Testing

**Test:** Publish image post to Facebook

**Steps:**
1. Go to Compose
2. Upload image
3. Write caption
4. Select Facebook platform
5. Click "Publish Now"
6. Verify post appears on Facebook Page

**Expected Result:**
- Post publishes immediately
- Post appears on Facebook Page within 1-2 minutes
- Post status updates to "Published" in Firestore
- Post ID from Facebook stored in post document

**Test:** Publish video post to Instagram

**Steps:**
1. Upload video in Compose
2. Write caption
3. Select Instagram platform
4. Click "Publish Now"
5. Verify post appears on Instagram

**Expected Result:**
- Video uploads successfully
- Post appears on Instagram feed
- Status updates correctly

#### 3. Scheduled Post Testing (Offline)

**Test:** Schedule post and verify it publishes when user is offline

**Steps:**
1. Create post with scheduled time = now + 10 minutes
2. Click "Schedule"
3. Close browser / go offline
4. Wait for scheduled time
5. Verify cron job runs (`/api/autoPostScheduled`)
6. Check Facebook/Instagram for published post
7. Check Firestore - post status should be "Published"

**Expected Result:**
- Post publishes automatically at scheduled time
- Post appears on platform
- Status updates in Firestore
- No user intervention required

**Test:** Batch scheduled posts

**Steps:**
1. Schedule 5 posts at different times (next 1 hour)
2. Go offline
3. Verify all posts publish correctly at their scheduled times

**Expected Result:**
- All posts publish at correct times
- No posts are skipped or duplicated
- Each post appears on platform

#### 4. Error Handling Testing

**Test:** Handle expired token

**Steps:**
1. Manually expire a token in Firestore
2. Attempt to publish post
3. Verify error is handled gracefully

**Expected Result:**
- System detects expired token
- Attempts token refresh
- If refresh fails, prompts user to reconnect account
- Error message shown to user

**Test:** Handle rate limiting

**Steps:**
1. Publish multiple posts rapidly (10+ in 1 minute)
2. Verify rate limit handling

**Expected Result:**
- Rate limit errors caught
- Posts queued for retry
- Retry after appropriate delay
- User notified of delays

**Test:** Handle network failures

**Steps:**
1. Simulate network failure (disable network during publish)
2. Verify retry logic

**Expected Result:**
- Post marked for retry
- Retry attempts made with backoff
- User notified after max retries

#### 5. Post Type Testing

**Test:** Instagram Reels

**Steps:**
1. Upload vertical video (9:16 aspect ratio)
2. Select Instagram
3. Verify it posts as Reel

**Expected Result:**
- Video posts as Instagram Reel (not regular video)
- Appears in Reels tab on Instagram

**Test:** Facebook Video

**Steps:**
1. Upload video
2. Select Facebook
3. Publish

**Expected Result:**
- Video posts correctly to Facebook
- Video plays in feed

**Test:** Carousel Posts

**Steps:**
1. Upload multiple images (2-10)
2. Select Facebook or Instagram
3. Publish

**Expected Result:**
- Multiple images create carousel/album post
- All images included
- Swipeable on platform

#### 6. Integration Testing

**Test:** End-to-end scheduled post flow

**Steps:**
1. User creates post in Compose
2. Schedules for future time
3. Post saved to Firestore with status "Scheduled"
4. Calendar shows scheduled post
5. Cron job runs at scheduled time
6. Post publishes to platform
7. Post status updates to "Published"
8. Calendar updates to show published post

**Expected Result:**
- Complete flow works without errors
- All components update correctly
- User can see status at each stage

### Test Environment Setup

1. **Create Test Facebook Page:**
   - Go to Facebook Business Suite
   - Create test page
   - Note Page ID

2. **Create Test Instagram Business Account:**
   - Convert to Business account
   - Connect to Facebook Page
   - Note Instagram Business Account ID

3. **Set Up Facebook Developer App:**
   - Create app in Facebook Developers
   - Add Instagram Basic Display and Instagram Graph API products
   - Configure OAuth redirect URIs
   - Request required permissions
   - Generate test tokens

4. **Configure Environment:**
   ```env
   FACEBOOK_APP_ID=your_app_id
   FACEBOOK_APP_SECRET=your_app_secret
   FACEBOOK_PAGE_ID=test_page_id
   INSTAGRAM_BUSINESS_ACCOUNT_ID=test_ig_account_id
   ```

### Automated Testing

**Recommended Test Script:**
```typescript
// tests/postPublishing.test.ts
describe('Post Publishing', () => {
  it('should publish Facebook post immediately', async () => {
    // Create post
    // Call publish API
    // Verify post on Facebook
    // Clean up
  });

  it('should schedule post and auto-publish', async () => {
    // Schedule post
    // Wait for cron execution
    // Verify post published
  });

  it('should handle token expiration', async () => {
    // Expire token
    // Attempt publish
    // Verify refresh/error handling
  });
});
```

---

## Security Considerations

1. **Token Storage:**
   - Verify tokens stored securely in Firestore
   - Use Firestore security rules to protect tokens
   - Encrypt tokens at rest (if required)

2. **Permission Scopes:**
   - Request minimum required permissions
   - Verify OAuth scopes include posting permissions
   - Handle permission denial gracefully

3. **Rate Limiting:**
   - Respect platform rate limits
   - Implement backoff for rate limit errors
   - Queue posts if rate limited

4. **Error Logging:**
   - Log errors without exposing tokens
   - Sanitize error messages before returning to client
   - Monitor for suspicious activity

---

## Monitoring & Alerts

### Key Metrics to Track:

1. **Publishing Success Rate:**
   - % of posts that publish successfully
   - Track by platform (Facebook vs Instagram)
   - Track by post type (image, video, text)

2. **Scheduled Post Processing:**
   - Number of posts processed per cron run
   - Average processing time
   - Failed post count

3. **Token Issues:**
   - Token refresh failures
   - Token expiration errors
   - OAuth reconnection requests

4. **Error Rates:**
   - API errors by type
   - Network failures
   - Rate limit hits

### Alerts to Configure:

1. **High Failure Rate:**
   - Alert if >5% of posts fail in 1 hour
   - Email/Slack notification

2. **Cron Job Failures:**
   - Alert if cron job fails to run
   - Alert if cron job throws errors

3. **Token Issues:**
   - Alert on multiple token refresh failures
   - Alert on OAuth reconnection spike

---

## Next Steps & Action Items

### Immediate (Priority 1):

1. ✅ **Complete this review document**
2. ⬜ **Implement Facebook posting function** (`api/platforms/facebook.ts`)
3. ⬜ **Implement Instagram posting function** (`api/platforms/instagram.ts`)
4. ⬜ **Create publish API endpoint** (`api/publishPost.ts`)
5. ⬜ **Update Compose component** to call publish API

### Short-term (Priority 2):

6. ⬜ **Complete `autoPostScheduled.ts` implementation**
7. ⬜ **Configure Vercel Cron job**
8. ⬜ **Add error handling and retry logic**
9. ⬜ **Test with real Facebook/Instagram accounts**

### Medium-term (Priority 3):

10. ⬜ **Add post type support** (Reels, Stories, Carousel)
11. ⬜ **Implement monitoring and alerts**
12. ⬜ **Add user notifications for failed posts**
13. ⬜ **Create admin dashboard for post status**

### Long-term (Priority 4):

14. ⬜ **Add analytics tracking** (publish success, engagement)
15. ⬜ **Implement bulk posting optimizations**
16. ⬜ **Add post preview before publishing**
17. ⬜ **Support for post editing before publishing**

---

## Conclusion

The application has a solid foundation for posting to Facebook and Instagram with a good UI/UX for creating and scheduling posts. However, **the critical missing piece is the actual API integration** to publish posts to these platforms. 

**Key Takeaways:**
- ✅ Post creation and scheduling UI works
- ✅ Firestore storage works
- ❌ **No actual publishing to platforms**
- ❌ **Scheduled posts never execute**

**Estimated Implementation Time:**
- Core posting functions: 2-3 days
- Scheduled post processing: 1-2 days
- Testing and bug fixes: 2-3 days
- **Total: ~1-2 weeks** for full implementation

**Risk Level:** Medium
- Technical complexity is moderate
- API documentation is available
- Main risk is handling edge cases and error scenarios

---

## References

- [Facebook Graph API - Publishing Posts](https://developers.facebook.com/docs/graph-api/reference/page/feed)
- [Instagram Graph API - Publishing Content](https://developers.facebook.com/docs/instagram-api/guides/content-publishing)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- Current codebase:
  - `api/platforms/facebook.ts`
  - `api/platforms/instagram.ts`
  - `api/autoPostScheduled.ts`
  - `components/Compose.tsx`
  - `components/Calendar.tsx`
