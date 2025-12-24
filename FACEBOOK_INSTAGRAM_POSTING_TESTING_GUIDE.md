# Facebook & Instagram Posting Testing Guide

## Overview

This guide provides a step-by-step path for testing the Facebook and Instagram posting functionality, including offline scheduled posting capabilities.

---

## Pre-Testing Setup

### 1. Prerequisites

Before testing, ensure you have:

- [ ] Facebook Business Page (or access to one)
- [ ] Instagram Business Account (connected to Facebook Page)
- [ ] Facebook Developer Account
- [ ] Facebook App created in Developer Console
- [ ] App has Instagram Graph API and Facebook Graph API products added
- [ ] OAuth redirect URIs configured
- [ ] Test user access (if using app in Development mode)

### 2. Facebook App Configuration

#### Step 1: Create Facebook App
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click "My Apps" → "Create App"
3. Select "Business" type
4. Enter app name and contact email

#### Step 2: Add Products
1. In App Dashboard, add:
   - **Facebook Login** (for OAuth)
   - **Instagram Graph API** (for Instagram posting)
   - **Facebook Graph API** (for Facebook posting)

#### Step 3: Configure OAuth Settings
1. Go to Facebook Login → Settings
2. Add Valid OAuth Redirect URIs:
   ```
   https://your-domain.com/api/oauth/facebook/callback
   https://your-domain.com/api/oauth/instagram/callback
   ```

#### Step 4: Request Permissions
1. Go to App Review → Permissions and Features
2. Request these permissions:
   - `pages_manage_posts` - Required for posting
   - `pages_read_engagement` - For analytics
   - `pages_show_list` - To list user's pages
   - `instagram_basic` - For Instagram access
   - `instagram_content_publish` - For Instagram posting

#### Step 5: Get Test Tokens
1. Use Graph API Explorer to generate test tokens
2. Convert to long-lived tokens
3. Get Page Access Token (not User Access Token)
4. Get Instagram Business Account ID

### 3. Environment Variables

Set these in your `.env` or Vercel environment:

```env
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
INSTAGRAM_CLIENT_SECRET=your_instagram_client_secret  # Usually same as FB_APP_SECRET
```

### 4. Test Accounts Setup

#### Facebook Page Setup:
1. Create or use existing Facebook Business Page
2. Note the Page ID (found in Page Settings → Page Info)
3. Ensure you're an admin of the page

#### Instagram Account Setup:
1. Convert Instagram account to Business account (Settings → Account → Switch to Professional Account)
2. Connect to Facebook Page
3. Note the Instagram Business Account ID (use Graph API Explorer: `GET /me/accounts?fields=instagram_business_account`)

---

## Testing Roadmap

### Phase 1: OAuth Connection Testing

**Objective:** Verify users can connect Facebook and Instagram accounts

#### Test 1.1: Connect Facebook Account

**Steps:**
1. Log into the application
2. Navigate to Settings → Social Accounts (or Profile → Connected Accounts)
3. Click "Connect" button next to Facebook
4. Complete OAuth flow:
   - You'll be redirected to Facebook
   - Authorize the app
   - Select the Page you want to connect
   - Grant permissions
   - Redirect back to app
5. Verify connection status

**Expected Results:**
- ✅ OAuth redirect works correctly
- ✅ User can select Facebook Page
- ✅ Permissions are granted
- ✅ Account shows as "Connected" in UI
- ✅ Token stored in Firestore: `users/{userId}/settings/socialAccounts.Facebook`

**Verification:**
```javascript
// Check Firestore
db.collection('users').doc(userId).get()
  .then(doc => {
    const settings = doc.data().settings;
    console.log('Facebook account:', settings.socialAccounts?.Facebook);
    // Should show: { accessToken, accountId, connected: true, ... }
  });
```

#### Test 1.2: Connect Instagram Account

**Steps:**
1. Navigate to Settings → Social Accounts
2. Click "Connect" button next to Instagram
3. Complete OAuth flow (may redirect through Facebook)
4. Verify connection

**Expected Results:**
- ✅ Instagram account connects (via Facebook Page connection)
- ✅ Account shows as "Connected"
- ✅ Token stored: `users/{userId}/settings/socialAccounts.Instagram`
- ✅ Instagram Business Account ID stored

**Verification:**
- Check Firestore for Instagram account data
- Verify `accountId` matches your Instagram Business Account ID

#### Test 1.3: Token Refresh Testing

**Steps:**
1. Connect account with short-lived token
2. Wait for token refresh (or manually trigger)
3. Check token expiration time

**Expected Results:**
- ✅ Token refreshes automatically before expiration
- ✅ New long-lived token stored in Firestore
- ✅ Account remains connected after refresh

**Manual Verification:**
```javascript
// Manually trigger refresh by calling refreshFacebookToken or refreshInstagramToken
// Check token expiration is extended
```

#### Test 1.4: Disconnect Account

**Steps:**
1. Click "Disconnect" for Facebook or Instagram
2. Verify disconnection

**Expected Results:**
- ✅ Account shows as "Disconnected"
- ✅ Token removed or marked as invalid
- ✅ User can reconnect later

---

### Phase 2: Immediate Publishing Testing

**Objective:** Verify posts can be published immediately to platforms

#### Test 2.1: Publish Image Post to Facebook

**Prerequisites:**
- Facebook account connected
- Test image ready (JPG or PNG)

**Steps:**
1. Navigate to Compose page
2. Upload an image file
3. Write a test caption (e.g., "Test post from EngageSuite AI - [timestamp]")
4. Select **Facebook** platform checkbox
5. Click **"Publish Now"** button
6. Wait for confirmation
7. Check Facebook Page for the post

**Expected Results:**
- ✅ Upload shows progress/loading state
- ✅ Success message: "Published to Facebook!"
- ✅ Post appears on Facebook Page within 1-2 minutes
- ✅ Post has correct image and caption
- ✅ Post status in Firestore updates to "Published"
- ✅ Post ID from Facebook stored in post document

**Verification Checklist:**
- [ ] Post appears on Facebook Page feed
- [ ] Image displays correctly
- [ ] Caption text matches what was entered
- [ ] Post timestamp is recent
- [ ] Firestore post document has `status: "Published"`
- [ ] Firestore post document has `externalPostId` (Facebook post ID)
- [ ] Calendar shows post as "Published" (if applicable)

#### Test 2.2: Publish Video Post to Facebook

**Steps:**
1. Upload a video file (MP4, recommended: < 1GB)
2. Write caption
3. Select Facebook
4. Click "Publish Now"
5. Wait for upload (may take longer than images)
6. Check Facebook Page

**Expected Results:**
- ✅ Video uploads successfully
- ✅ Video post appears on Facebook Page
- ✅ Video plays correctly in feed
- ✅ Status updates correctly

**Notes:**
- Facebook video posts may take 2-5 minutes to process
- Check video quality and playback

#### Test 2.3: Publish Image Post to Instagram

**Prerequisites:**
- Instagram Business Account connected
- Square or vertical image (recommended)

**Steps:**
1. Upload image
2. Write caption with hashtags (e.g., "#test #engagesuite")
3. Select **Instagram** platform
4. Click "Publish Now"
5. Check Instagram account

**Expected Results:**
- ✅ Post appears on Instagram feed
- ✅ Image displays correctly
- ✅ Caption and hashtags appear
- ✅ Status updates to "Published"

**Notes:**
- Instagram may have stricter image requirements
- Aspect ratio should be square (1:1) or vertical (4:5, 9:16)
- Caption can be up to 2,200 characters

#### Test 2.4: Publish Video/Reel to Instagram

**Steps:**
1. Upload vertical video (9:16 aspect ratio recommended for Reels)
2. Write caption
3. Select Instagram
4. Publish
5. Check if it posts as Reel or regular video

**Expected Results:**
- ✅ Video posts successfully
- ✅ Posts as Reel (if vertical format)
- ✅ Appears in Reels tab on Instagram
- ✅ Plays correctly

**Notes:**
- Instagram Reels require vertical format (9:16)
- Videos must be 15-90 seconds for Reels
- Regular videos can be up to 60 minutes

#### Test 2.5: Publish to Multiple Platforms Simultaneously

**Steps:**
1. Upload image or video
2. Write caption
3. Select **both Facebook and Instagram** checkboxes
4. Click "Publish Now"
5. Check both platforms

**Expected Results:**
- ✅ Post publishes to both platforms
- ✅ Both posts appear correctly
- ✅ Status updated for both platforms
- ✅ No duplicate posts on same platform

#### Test 2.6: Error Handling - Invalid Token

**Steps:**
1. Manually invalidate token in Firestore (set `accessToken: "invalid_token"`)
2. Attempt to publish post
3. Observe error handling

**Expected Results:**
- ✅ System detects invalid token
- ✅ Attempts token refresh automatically
- ✅ If refresh fails, shows error message
- ✅ Prompts user to reconnect account
- ✅ No crash or blank screen

#### Test 2.7: Error Handling - Missing Media

**Steps:**
1. Write caption only (no media)
2. Select platform
3. Attempt to publish

**Expected Results:**
- ✅ Validation prevents publishing without media (if required)
- ✅ Clear error message: "Please add media to publish"
- ✅ User can add media and retry

---

### Phase 3: Scheduled Posting Testing

**Objective:** Verify posts can be scheduled and publish automatically when user is offline

#### Test 3.1: Schedule Post for Immediate Future

**Steps:**
1. Upload image/video
2. Write caption
3. Select platform
4. Click "Schedule" button
5. Set scheduled time = **now + 10 minutes**
6. Confirm schedule
7. **Stay logged in** (for initial test)
8. Wait 10 minutes
9. Check platform for published post

**Expected Results:**
- ✅ Post saves with status "Scheduled"
- ✅ Post appears in Calendar view
- ✅ Post publishes automatically at scheduled time
- ✅ Post appears on platform
- ✅ Status updates to "Published" in Firestore
- ✅ Calendar updates to show published post

**Verification:**
```javascript
// Check Firestore before scheduled time
// Post should have: status: "Scheduled", scheduledDate: <future timestamp>

// Check after scheduled time
// Post should have: status: "Published", publishedAt: <timestamp>
```

#### Test 3.2: Schedule Post - User Offline

**Critical Test for Offline Functionality**

**Steps:**
1. Schedule post for **now + 15 minutes**
2. **Close browser / log out / go offline**
3. Wait 15 minutes
4. Log back in
5. Check platform for published post
6. Check Firestore for status update
7. Check Calendar for status update

**Expected Results:**
- ✅ Post publishes automatically even when user is offline
- ✅ Post appears on platform at scheduled time
- ✅ Status updates in Firestore (even if user is offline)
- ✅ User sees "Published" status when they return
- ✅ Calendar shows post as published

**How to Verify Cron Job Ran:**
```javascript
// Check Vercel logs or Cloud Functions logs
// Should see: "Processing scheduled posts..." at scheduled time
// Should see: "Published post {postId} to {platform}"

// Or check Firestore post document for:
// - status: "Published"
// - publishedAt: <timestamp close to scheduledDate>
// - externalPostId: <platform post ID>
```

#### Test 3.3: Batch Scheduled Posts

**Steps:**
1. Schedule 5 posts at different times:
   - Post 1: now + 5 minutes
   - Post 2: now + 10 minutes
   - Post 3: now + 15 minutes
   - Post 4: now + 20 minutes
   - Post 5: now + 25 minutes
2. Each with different content (to identify them)
3. Log out / go offline
4. Wait 30 minutes
5. Log back in
6. Check all 5 posts published correctly

**Expected Results:**
- ✅ All 5 posts publish at their scheduled times
- ✅ No posts are skipped
- ✅ No duplicate posts
- ✅ Each post has correct content
- ✅ All statuses update correctly

#### Test 3.4: Schedule Post in Past (Should Publish Immediately)

**Steps:**
1. Schedule post for **5 minutes ago** (past time)
2. Verify behavior

**Expected Results:**
- ✅ Post publishes immediately (not scheduled)
- ✅ Or shows error: "Scheduled time must be in the future"
- ✅ No posts scheduled for past times

#### Test 3.5: Edit Scheduled Post

**Steps:**
1. Schedule a post
2. Before scheduled time, edit:
   - Change caption
   - Change scheduled time
   - Add/remove platforms
3. Verify changes saved
4. Wait for new scheduled time
5. Verify post publishes with updated content

**Expected Results:**
- ✅ Changes save correctly
- ✅ Post publishes with updated content
- ✅ Post publishes at new scheduled time
- ✅ No duplicate posts

#### Test 3.6: Cancel/Delete Scheduled Post

**Steps:**
1. Schedule a post
2. Before scheduled time, delete the post
3. Wait past scheduled time
4. Verify post does NOT publish

**Expected Results:**
- ✅ Post deleted from Firestore
- ✅ Post removed from Calendar
- ✅ Post does NOT publish to platform
- ✅ No orphaned posts

---

### Phase 4: Cron Job / Auto-Post Testing

**Objective:** Verify the scheduled post processor works correctly

#### Test 4.1: Verify Cron Job Configuration

**Steps:**
1. Check `vercel.json` for cron configuration:
   ```json
   {
     "crons": [{
       "path": "/api/autoPostScheduled",
       "schedule": "*/5 * * * *"  // Every 5 minutes
     }]
   }
   ```
2. Or check Cloud Functions scheduled trigger

**Expected Results:**
- ✅ Cron job configured correctly
- ✅ Runs every 5-15 minutes
- ✅ Endpoint accessible

#### Test 4.2: Manual Cron Job Trigger

**Steps:**
1. Schedule a post for **now + 2 minutes**
2. Wait 2 minutes
3. Manually call: `GET /api/autoPostScheduled`
4. Check response
5. Verify post was processed

**Expected Results:**
- ✅ Endpoint returns success response
- ✅ Response includes: `processed: X, posted: Y`
- ✅ Scheduled post is processed
- ✅ Post publishes to platform

**Manual Test:**
```bash
# Using curl
curl -X GET https://your-domain.com/api/autoPostScheduled \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected response:
{
  "success": true,
  "processed": 1,
  "posted": 1,
  "errors": []
}
```

#### Test 4.3: Cron Job Processes Multiple Users

**Steps:**
1. Create test users: User A, User B
2. User A schedules a post
3. User B schedules a post
4. Both posts scheduled for same time
5. Wait for scheduled time
6. Verify both posts publish

**Expected Results:**
- ✅ Cron job processes posts for all users
- ✅ Both posts publish correctly
- ✅ No interference between users
- ✅ Each user's posts go to their connected accounts

#### Test 4.4: Cron Job Error Handling

**Steps:**
1. Schedule a post with invalid token (manually corrupt token)
2. Schedule another post with valid token
3. Wait for scheduled time
4. Check cron job logs
5. Verify valid post publishes, invalid post fails gracefully

**Expected Results:**
- ✅ Valid post publishes successfully
- ✅ Invalid post marked as "Failed" or retries
- ✅ Error logged but doesn't crash cron job
- ✅ User notified of failure

---

### Phase 5: Error Handling & Edge Cases

#### Test 5.1: Rate Limiting

**Steps:**
1. Rapidly publish 10+ posts in 1 minute
2. Observe behavior

**Expected Results:**
- ✅ Rate limit errors caught
- ✅ Posts queued for retry
- ✅ Retry after appropriate delay
- ✅ User notified of delays

**Notes:**
- Facebook: ~600 posts per hour per page
- Instagram: ~25 posts per day per account

#### Test 5.2: Network Failures

**Steps:**
1. Disable network connection
2. Attempt to publish post
3. Re-enable network
4. Check retry behavior

**Expected Results:**
- ✅ Post marked for retry
- ✅ Retry attempts made with exponential backoff
- ✅ Post eventually publishes when network returns
- ✅ User notified after max retries

#### Test 5.3: Large File Uploads

**Steps:**
1. Upload very large video file (e.g., 500MB)
2. Attempt to publish
3. Observe handling

**Expected Results:**
- ✅ Upload progress shown
- ✅ File size validated
- ✅ Large files handled gracefully
- ✅ Clear error if file too large

**Notes:**
- Facebook: Videos up to 4GB
- Instagram: Videos up to 100MB for feed, 4GB for Reels

#### Test 5.4: Invalid Media Format

**Steps:**
1. Upload unsupported file format (e.g., .txt, .pdf)
2. Attempt to publish

**Expected Results:**
- ✅ Validation prevents publishing
- ✅ Clear error message: "Unsupported file format"
- ✅ Lists supported formats

#### Test 5.5: Caption Length Limits

**Steps:**
1. Write extremely long caption (10,000+ characters)
2. Attempt to publish

**Expected Results:**
- ✅ Validation checks caption length
- ✅ Shows character count
- ✅ Prevents publishing if too long
- ✅ Platform-specific limits enforced:
  - Facebook: 63,206 characters
  - Instagram: 2,200 characters

---

### Phase 6: Post Type Testing

#### Test 6.1: Instagram Reels

**Steps:**
1. Upload vertical video (9:16 aspect ratio, 15-90 seconds)
2. Select Instagram
3. Publish
4. Verify it posts as Reel

**Expected Results:**
- ✅ Video posts as Instagram Reel
- ✅ Appears in Reels tab
- ✅ Has Reel-specific features (effects, audio, etc.)

#### Test 6.2: Instagram Stories (if supported)

**Steps:**
1. Upload vertical image/video (9:16)
2. Select "Instagram Stories" option (if available)
3. Publish

**Expected Results:**
- ✅ Posts to Instagram Stories
- ✅ Appears in Stories feed
- ✅ Expires after 24 hours

**Note:** Stories API may require additional permissions

#### Test 6.3: Facebook Video Posts

**Steps:**
1. Upload video
2. Select Facebook
3. Publish

**Expected Results:**
- ✅ Video posts to Facebook
- ✅ Plays in feed
- ✅ Supports long-form videos

#### Test 6.4: Carousel/Album Posts

**Steps:**
1. Upload multiple images (2-10 images)
2. Select platform
3. Publish

**Expected Results:**
- ✅ Creates carousel/album post
- ✅ All images included
- ✅ Swipeable on platform

**Note:** May require different API endpoint

---

## Testing Checklist

### Pre-Implementation Testing (Current State)
- [ ] Verify posts can be created in Compose
- [ ] Verify posts save to Firestore
- [ ] Verify scheduled posts appear in Calendar
- [ ] Verify OAuth connection flow works
- [ ] Document what currently works vs. what's missing

### Post-Implementation Testing (After Fixes)

#### OAuth & Connection
- [ ] Facebook account connects successfully
- [ ] Instagram account connects successfully
- [ ] Tokens stored correctly
- [ ] Token refresh works
- [ ] Disconnect works

#### Immediate Publishing
- [ ] Facebook image post publishes
- [ ] Facebook video post publishes
- [ ] Instagram image post publishes
- [ ] Instagram video/Reel posts
- [ ] Multi-platform publishing works
- [ ] Error handling for invalid tokens
- [ ] Error handling for missing media

#### Scheduled Publishing
- [ ] Post schedules correctly
- [ ] Post publishes at scheduled time (user online)
- [ ] Post publishes at scheduled time (user offline)
- [ ] Batch scheduled posts work
- [ ] Edit scheduled post works
- [ ] Delete scheduled post works
- [ ] Past scheduled time handled correctly

#### Cron Job / Auto-Post
- [ ] Cron job runs on schedule
- [ ] Processes multiple users
- [ ] Handles errors gracefully
- [ ] Logs activity correctly

#### Error Handling
- [ ] Rate limiting handled
- [ ] Network failures handled
- [ ] Large files handled
- [ ] Invalid formats rejected
- [ ] Caption length validated

#### Post Types
- [ ] Instagram Reels work
- [ ] Instagram Stories work (if supported)
- [ ] Facebook Videos work
- [ ] Carousel posts work

---

## Test Data & Content

### Test Images
- Prepare test images:
  - Square (1:1) - for Instagram
  - Vertical (9:16) - for Stories/Reels
  - Horizontal (16:9) - for Facebook
  - Various sizes (small, medium, large)

### Test Videos
- Prepare test videos:
  - Short video (15-30 seconds)
  - Vertical video (9:16) for Reels
  - Horizontal video (16:9) for Facebook
  - Various file sizes

### Test Captions
- Prepare test captions:
  - Short: "Test post #test"
  - Medium: 100-500 characters with hashtags
  - Long: Near platform limits
  - With emojis, mentions, hashtags

---

## Troubleshooting Guide

### Issue: OAuth redirect fails
**Solution:**
- Check redirect URI matches exactly in Facebook App settings
- Verify HTTPS (required for production)
- Check app is not in restricted mode

### Issue: Token refresh fails
**Solution:**
- Verify APP_SECRET is correct
- Check token hasn't expired completely
- Verify permissions still granted
- May need to re-authorize

### Issue: Posts not publishing
**Solution:**
- Check token is valid (not expired)
- Verify page/account permissions
- Check API error logs
- Verify media URL is accessible
- Check rate limits not exceeded

### Issue: Scheduled posts not publishing
**Solution:**
- Verify cron job is running (check logs)
- Check `autoPostScheduled.ts` endpoint is accessible
- Verify Firestore queries work
- Check post `scheduledDate` is correct format
- Verify status is "Scheduled" not "Draft"

### Issue: Wrong post type (e.g., Reel vs Video)
**Solution:**
- Check aspect ratio (9:16 for Reels)
- Verify video length (15-90s for Reels)
- Check API endpoint used
- May need to specify `media_type: "REELS"`

---

## Success Criteria

The posting functionality is considered **fully working** when:

1. ✅ Users can connect Facebook and Instagram accounts via OAuth
2. ✅ Users can publish posts immediately to both platforms
3. ✅ Users can schedule posts for future publication
4. ✅ Scheduled posts publish automatically when user is offline
5. ✅ All post types work (images, videos, Reels, etc.)
6. ✅ Error handling works for all error scenarios
7. ✅ Rate limiting is respected
8. ✅ Cron job processes scheduled posts reliably
9. ✅ User notifications work for failures
10. ✅ Post status updates correctly in UI

---

## Next Steps After Testing

1. **Document Issues Found:**
   - Create bug reports for any issues
   - Prioritize fixes
   - Update implementation plan

2. **Performance Testing:**
   - Test with high volume (100+ scheduled posts)
   - Monitor cron job performance
   - Check database query performance

3. **Security Testing:**
   - Verify token security
   - Test permission boundaries
   - Check for injection vulnerabilities

4. **User Acceptance Testing:**
   - Get feedback from real users
   - Test with actual business scenarios
   - Verify UI/UX is intuitive

---

## Appendix: API Testing Commands

### Test Facebook Graph API Directly

```bash
# Get Page Access Token
curl -X GET "https://graph.facebook.com/v18.0/me/accounts?access_token=USER_TOKEN"

# Post to Page
curl -X POST "https://graph.facebook.com/v18.0/{page-id}/photos" \
  -F "url=https://example.com/image.jpg" \
  -F "message=Test caption" \
  -F "access_token=PAGE_TOKEN"
```

### Test Instagram Graph API Directly

```bash
# Create Media Container
curl -X POST "https://graph.instagram.com/v18.0/{ig-user-id}/media" \
  -F "image_url=https://example.com/image.jpg" \
  -F "caption=Test caption" \
  -F "access_token=ACCESS_TOKEN"

# Publish Media (use container ID from above)
curl -X POST "https://graph.instagram.com/v18.0/{ig-user-id}/media_publish" \
  -F "creation_id={container-id}" \
  -F "access_token=ACCESS_TOKEN"
```

---

**Last Updated:** [Current Date]
**Version:** 1.0











