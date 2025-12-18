# Instagram API Implementation Review

## ✅ What We Have Implemented

### 1. OAuth Flow (Business Login)
- **Status**: ✅ Complete
- **File**: `api/oauth/instagram/authorize.ts`, `api/oauth/instagram/callback.ts`
- **Implementation**: 
  - Uses Facebook Login (`https://www.facebook.com/v19.0/dialog/oauth`)
  - Correct scopes: `pages_show_list`, `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`
  - Stores `accessToken`, `accountId`, `pageId`, `facebookAccessToken` in Firestore
  - Finds Instagram Business Account connected to Facebook Page
- **Reference**: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-login-for-instagram

### 2. Webhooks
- **Status**: ✅ Complete
- **File**: `api/webhooks/instagram.ts`
- **Implementation**:
  - Handles GET requests for verification (`hub.verify_token`)
  - Handles POST requests for events (DMs, comments)
  - Verifies signature using `x-hub-signature-256`
  - Processes `messaging` and `comments` events
  - Saves to Firestore `messages` collection
- **Reference**: https://developers.facebook.com/docs/instagram-platform/webhooks

### 3. Data Fetching (DMs & Comments)
- **Status**: ✅ Complete
- **File**: `api/platforms/instagram.ts`
- **Implementation**:
  - `fetchInstagramDMs()` - Fetches conversations via Graph API
  - `fetchInstagramComments()` - Fetches comments on user's media
  - Token refresh logic for expired tokens
  - Error handling for missing permissions

## ❌ What We're Missing

### 1. Content Publishing
- **Status**: ❌ Not Implemented
- **Required**: Two-step publishing process
  - Step 1: Create media container (`POST /{ig-user-id}/media`)
  - Step 2: Publish container (`POST /{ig-user-id}/media_publish`)
- **Reference**: https://developers.facebook.com/docs/instagram-platform/content-publishing

### 2. Hashtag Search (Optional)
- **Status**: ⚠️ Not Implemented (Optional Feature)
- **Reference**: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/hashtag-search

### 3. Creator Marketplace (Optional)
- **Status**: ⚠️ Not Implemented (Optional Feature)
- **Reference**: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/creator-marketplace

## 📋 Implementation Checklist

### Content Publishing (Required)
- [ ] Create `publishInstagramImage()` function
- [ ] Create `publishInstagramReel()` function
- [ ] Create `publishInstagramPost()` wrapper function
- [ ] Handle image URL upload (may need to download and re-upload to Instagram)
- [ ] Handle video URL upload (may need to download and re-upload to Instagram)
- [ ] Implement scheduled posting (if needed)
- [ ] Add error handling for publishing failures
- [ ] Update `Compose.tsx` to call publishing API when user clicks "Publish"
- [ ] Update `Approvals.tsx` to call publishing API when post is approved/published

### Integration Points
- [ ] Update `handlePublishMedia()` in `Compose.tsx` to call Instagram API
- [ ] Update `handleScheduleMedia()` to schedule Instagram posts
- [ ] Update `autoPostScheduled` cron job to publish scheduled Instagram posts
- [ ] Add Instagram-specific error messages

## 🔧 Technical Details

### Instagram Content Publishing API

#### For Images:
```bash
# Step 1: Create media container
POST https://graph.instagram.com/{ig-user-id}/media
{
  "image_url": "https://example.com/image.jpg",
  "caption": "Your caption here"
}

# Response: { "id": "123456789" }

# Step 2: Publish
POST https://graph.instagram.com/{ig-user-id}/media_publish
{
  "creation_id": "123456789"
}
```

#### For Videos/Reels:
```bash
# Step 1: Create media container
POST https://graph.instagram.com/{ig-user-id}/media
{
  "video_url": "https://example.com/video.mp4",
  "caption": "Your caption here",
  "media_type": "REELS"
}

# Response: { "id": "123456789" }

# Step 2: Publish
POST https://graph.instagram.com/{ig-user-id}/media_publish
{
  "creation_id": "123456789"
}
```

### Important Notes:
1. **Media URLs**: Instagram requires publicly accessible HTTPS URLs. If media is in Firebase Storage, ensure it's publicly accessible or download and re-upload.
2. **Video Requirements**: Videos must be:
   - Minimum 3 seconds, maximum 60 seconds for Reels
   - Aspect ratio: 9:16 (vertical) for Reels
   - Format: MP4, MOV
   - Max file size: 100MB
3. **Scheduled Posts**: Instagram Graph API supports scheduled posts using `scheduled_publish_time` parameter in Step 1.
4. **Access Token**: Use the Page Access Token (stored as `accessToken` in our Firestore) for publishing.

## 🎯 Next Steps

1. **Implement Content Publishing** (Priority 1)
   - Create API endpoint: `api/platforms/instagram/publish.ts`
   - Implement two-step publishing process
   - Handle both images and videos/Reels
   - Integrate with existing Compose and Approvals components

2. **Test Publishing Flow** (Priority 2)
   - Test image post publishing
   - Test Reel publishing
   - Test scheduled posting
   - Verify error handling

3. **Optional Features** (Priority 3)
   - Hashtag search (if needed for content discovery)
   - Creator Marketplace integration (if needed)

## 📚 References

- [Instagram Business Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-login-for-instagram)
- [Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing)
- [Webhooks](https://developers.facebook.com/docs/instagram-platform/webhooks)
- [Hashtag Search](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/hashtag-search)
- [Creator Marketplace](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/creator-marketplace)






