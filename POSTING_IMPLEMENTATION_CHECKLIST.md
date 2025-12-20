# Facebook & Instagram Posting - Implementation Checklist

## Backend Tasks

### 1. Facebook Posting API Functions
**File:** `api/platforms/facebook.ts`
- [ ] Add `publishFacebookPhoto()` - Post images to Facebook Page
- [ ] Add `publishFacebookVideo()` - Post videos to Facebook Page
- [ ] Add `publishFacebookText()` - Post text-only to Facebook Page
- [ ] Add `publishFacebookPost()` - Main function that routes by media type
- [ ] Handle scheduled posting (use `scheduled_publish_time` parameter)
- [ ] Return Facebook post ID on success
- [ ] Handle token refresh before posting

**Required API Endpoints:**
- `POST /{page-id}/photos` (for images)
- `POST /{page-id}/videos` (for videos)
- `POST /{page-id}/feed` (for text)

### 2. Instagram Posting API Functions
**File:** `api/platforms/instagram.ts`
- [ ] Add `createInstagramMediaContainer()` - Step 1: Create media container
- [ ] Add `publishInstagramMedia()` - Step 2: Publish the container
- [ ] Add `publishInstagramPost()` - Main function (2-step process)
- [ ] Support image posts (IMAGE type)
- [ ] Support video posts (VIDEO type)
- [ ] Support Reels (REELS type - requires 9:16 aspect ratio)
- [ ] Handle scheduled posting (Instagram Basic Display API limitation - may need workaround)
- [ ] Return Instagram post ID on success
- [ ] Handle token refresh before posting

**Required API Endpoints:**
- `POST /{ig-user-id}/media` (create container)
- `POST /{ig-user-id}/media_publish` (publish)

### 3. Publish Post API Endpoint
**File:** `api/publishPost.ts` (NEW FILE)
- [ ] Verify user authentication
- [ ] Get post from Firestore (`users/{userId}/posts/{postId}`)
- [ ] Get user's social account tokens
- [ ] Route to appropriate platform function (Facebook or Instagram)
- [ ] Update post status to "Published" in Firestore
- [ ] Store external post ID (from platform) in Firestore
- [ ] Handle errors and return appropriate responses
- [ ] Support publishing to multiple platforms in one request

**Endpoint:** `POST /api/publishPost`
**Request Body:**
```typescript
{
  postId: string;
  platforms?: Platform[]; // Optional: override post.platforms
}
```

### 4. Complete Scheduled Post Processor
**File:** `api/autoPostScheduled.ts`
- [ ] Query Firestore for scheduled posts:
  - Collection: `users/{userId}/posts`
  - Filter: `status === 'Scheduled'` AND `scheduledDate <= now + 5 minutes`
- [ ] Iterate through all users
- [ ] For each scheduled post:
  - Get user's social account tokens
  - Call `publishPost` API for each platform
  - Update post status to "Published" or "Failed"
  - Log results
- [ ] Return summary: `{ processed: number, posted: number, failed: number }`
- [ ] Handle errors gracefully (don't crash on one failed post)

### 5. Configure Cron Job
**File:** `vercel.json` (or Cloud Functions config)
- [ ] Add cron job configuration:
  ```json
  {
    "crons": [{
      "path": "/api/autoPostScheduled",
      "schedule": "*/5 * * * *"  // Every 5 minutes
    }]
  }
  ```
- [ ] Or set up Cloud Functions scheduled trigger

### 6. Error Handling & Retry Logic
**Files:** `api/publishPost.ts`, `api/autoPostScheduled.ts`
- [ ] Implement exponential backoff retry (3 attempts max)
- [ ] Track retry count in Firestore post document
- [ ] Handle rate limiting (Facebook: 600/hour, Instagram: 25/day)
- [ ] Queue failed posts for manual review
- [ ] Log errors without exposing tokens

### 7. Token Management
**Files:** `api/platforms/facebook.ts`, `api/platforms/instagram.ts`
- [ ] Verify token refresh functions work before posting
- [ ] Handle token expiration errors gracefully
- [ ] Return clear error if token refresh fails (prompt re-connection)

---

## Frontend Tasks

### 1. Update Compose Component - Immediate Publishing
**File:** `components/Compose.tsx`
- [ ] Update `handleBulkSchedule()` when `publishNow === true`:
  - After saving post to Firestore, call `/api/publishPost`
  - Show loading state during publish
  - Handle success/error responses
  - Update post status in UI
  - Show success message: "Published to {platform}!"
- [ ] Update `handlePost()` in ImageGenerator/VideoGenerator:
  - Call `/api/publishPost` after saving
  - Show publish progress
  - Handle errors

**Function to Add:**
```typescript
const handlePublishNow = async (postId: string, platforms: Platform[]) => {
  setIsPublishing(true);
  try {
    const response = await fetch('/api/publishPost', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAuthToken()}`
      },
      body: JSON.stringify({ postId, platforms })
    });
    
    if (!response.ok) throw new Error('Publish failed');
    
    showToast('Published successfully!', 'success');
    // Update local state
  } catch (error) {
    showToast('Failed to publish. Please try again.', 'error');
  } finally {
    setIsPublishing(false);
  }
};
```

### 2. Update Calendar Component - Publish Button
**File:** `components/Calendar.tsx`
- [ ] Add "Publish Now" button for scheduled posts
- [ ] Call `/api/publishPost` when clicked
- [ ] Update post status immediately in UI
- [ ] Show loading state

### 3. Update Approvals Component - Publish Button
**File:** `components/Approvals.tsx`
- [ ] Add "Publish Now" button for Approved/Scheduled posts
- [ ] Call `/api/publishPost` API
- [ ] Update post status after successful publish
- [ ] Handle errors

### 4. Add Publish Status Indicators
**Files:** `components/Compose.tsx`, `components/Calendar.tsx`, `components/Approvals.tsx`
- [ ] Show "Publishing..." loading state
- [ ] Show "Published" checkmark after success
- [ ] Show error icon with retry button on failure
- [ ] Display external post ID (link to platform post)

### 5. Error Handling & User Feedback
**All components that publish:**
- [ ] Show clear error messages:
  - "Account not connected" → Link to Settings
  - "Token expired" → Prompt to reconnect account
  - "Rate limit exceeded" → Show retry time
  - "Media too large" → Show size limits
- [ ] Add retry button for failed posts
- [ ] Show publish progress for large files

### 6. Post Status Updates
**Files:** `components/Compose.tsx`, `components/Calendar.tsx`
- [ ] Listen for post status changes in Firestore
- [ ] Update UI when scheduled post auto-publishes
- [ ] Show notification when post publishes successfully
- [ ] Update calendar event status to "Published"

### 7. Validation Before Publishing
**File:** `components/Compose.tsx`
- [ ] Verify platform is connected before allowing publish
- [ ] Check media file size limits (show warning if too large)
- [ ] Validate caption length (platform-specific limits)
- [ ] Check media format is supported
- [ ] Show connection status for each platform

**Example:**
```typescript
const canPublish = (platform: Platform) => {
  const account = socialAccounts[platform];
  return account?.connected && account?.accessToken;
};
```

---

## Quick Implementation Order

### Phase 1: Backend Foundation (Days 1-2)
1. ✅ Facebook posting functions
2. ✅ Instagram posting functions
3. ✅ Publish Post API endpoint
4. ✅ Test with Postman/curl

### Phase 2: Frontend Integration (Day 3)
5. ✅ Update Compose component
6. ✅ Add publish buttons
7. ✅ Add loading/error states

### Phase 3: Scheduled Posts (Days 4-5)
8. ✅ Complete autoPostScheduled.ts
9. ✅ Configure cron job
10. ✅ Test scheduled posting

### Phase 4: Polish & Testing (Days 6-7)
11. ✅ Error handling & retry logic
12. ✅ User notifications
13. ✅ End-to-end testing

---

## Critical Notes

- **Instagram Limitations:**
  - Scheduled posting may require Instagram Content Publishing API (advanced)
  - Reels require specific aspect ratio (9:16) and duration (15-90s)
  - Rate limit: ~25 posts per day per account

- **Facebook Limitations:**
  - Requires Page Access Token (not User Token)
  - Scheduled posts use `scheduled_publish_time` parameter
  - Rate limit: ~600 posts per hour per page

- **OAuth Requirements:**
  - Verify tokens are Page tokens for Facebook
  - Verify Instagram Business Account ID is stored
  - Test token refresh before implementing posting

---

**Total Estimated Time:** 1-2 weeks
**Priority:** HIGH (Core functionality missing)









