# Instagram Content Publishing Implementation

## ✅ What We've Implemented

### 1. Backend API Endpoint
**File**: `api/platforms/instagram/publish.ts`

- ✅ Two-step publishing process:
  - Step 1: Create media container (`POST /{ig-user-id}/media`)
  - Step 2: Publish container (`POST /{ig-user-id}/media_publish`)
- ✅ Supports images, videos, and Reels
- ✅ Supports scheduled posting with `scheduled_publish_time`
- ✅ Error handling with detailed error messages
- ✅ Authentication verification
- ✅ Fetches Instagram account from Firestore

### 2. Frontend Service Function
**File**: `src/services/socialMediaService.ts`

- ✅ `publishInstagramPost()` function
- ✅ Handles authentication tokens
- ✅ Returns container ID and media ID
- ✅ Supports scheduled posting

### 3. Documentation
**Files**: 
- `INSTAGRAM_IMPLEMENTATION_REVIEW.md` - Complete review of Instagram API implementation
- `INSTAGRAM_PUBLISHING_IMPLEMENTATION.md` - This file

## 🔧 How to Use

### Publishing an Image Post
```typescript
import { publishInstagramPost } from '../src/services/socialMediaService';

try {
  const result = await publishInstagramPost(
    'https://example.com/image.jpg', // Public HTTPS URL
    'Your caption here',              // Caption
    'IMAGE',                          // Media type
  );
  
  console.log('Published:', result.mediaId);
} catch (error) {
  console.error('Failed to publish:', error);
}
```

### Publishing a Reel
```typescript
const result = await publishInstagramPost(
  'https://example.com/video.mp4', // Public HTTPS URL
  'Your caption here',              // Caption
  'REELS',                          // Media type
);
```

### Scheduling a Post
```typescript
const scheduledTime = new Date('2024-12-25T10:00:00Z').toISOString();

const result = await publishInstagramPost(
  'https://example.com/image.jpg',
  'Your caption here',
  'IMAGE',
  scheduledTime // ISO 8601 timestamp
);

// Result will have status: 'scheduled' (not 'published')
```

## 📋 Next Steps: Integration

### 1. Update Compose Component
**File**: `components/Compose.tsx`

When user clicks "Publish Now" for Instagram:
- Call `publishInstagramPost()` for each Instagram post
- Update post status to "Published" in Firestore
- Show success/error toast messages

**Example integration**:
```typescript
import { publishInstagramPost } from '../src/services/socialMediaService';

const handlePublishMedia = async () => {
  const platformsToPost = ['Instagram']; // Filter for Instagram
  
  for (const platform of platformsToPost) {
    if (platform === 'Instagram') {
      try {
        const mediaType = item.type === 'video' 
          ? (item.instagramPostType === 'Reel' ? 'REELS' : 'VIDEO')
          : 'IMAGE';
        
        const result = await publishInstagramPost(
          item.mediaUrl, // Must be public HTTPS URL
          item.captionText,
          mediaType
        );
        
        showToast(`Published to Instagram!`, 'success');
      } catch (error: any) {
        showToast(`Failed to publish to Instagram: ${error.message}`, 'error');
      }
    }
  }
};
```

### 2. Update Approvals Component
**File**: `components/Approvals.tsx`

When post is approved/published:
- Call `publishInstagramPost()` for Instagram posts
- Update post status in Firestore

### 3. Update Auto-Post Service
**File**: `api/autoPostScheduled.ts`

For scheduled Instagram posts:
- Query posts with `status: 'Scheduled'` and `scheduledDate <= now`
- Call `publishInstagramPost()` with the scheduled time
- Update post status to "Published"

**Note**: Instagram handles scheduled posts internally, so you can either:
- Option A: Use Instagram's scheduled posting (pass `scheduledPublishTime` when creating container)
- Option B: Store scheduled posts and publish them via cron job (current approach)

## ⚠️ Important Requirements

### Media URL Requirements
1. **Must be publicly accessible**: Instagram needs to download the media
2. **Must be HTTPS**: Instagram requires secure URLs
3. **Must be direct link**: Not a redirect or authentication-protected URL

### Firebase Storage
If media is stored in Firebase Storage:
- Ensure the file is publicly accessible, OR
- Generate a signed URL with long expiration, OR
- Download and re-upload to a public CDN

### Video Requirements (for Reels)
- Minimum: 3 seconds
- Maximum: 60 seconds
- Aspect ratio: 9:16 (vertical)
- Format: MP4, MOV
- Max file size: 100MB

### Access Token
- Uses Page Access Token (stored in Firestore as `accessToken`)
- Token must have `instagram_content_publish` permission
- Token expires after 60 days (needs refresh logic)

## 🧪 Testing Checklist

- [ ] Test image post publishing
- [ ] Test Reel publishing
- [ ] Test scheduled posting
- [ ] Test error handling (invalid URL, expired token, etc.)
- [ ] Test with Firebase Storage URLs (ensure public access)
- [ ] Verify posts appear on Instagram
- [ ] Test multiple posts in sequence
- [ ] Test with different caption lengths

## 📚 API Reference

### Endpoint
```
POST /api/platforms/instagram/publish
```

### Request Body
```json
{
  "mediaUrl": "https://example.com/image.jpg",
  "caption": "Your caption here",
  "mediaType": "IMAGE" | "REELS" | "VIDEO",
  "scheduledPublishTime": "2024-12-25T10:00:00Z" // Optional
}
```

### Response
```json
{
  "success": true,
  "containerId": "123456789",
  "mediaId": "987654321", // Only if published immediately
  "status": "published" | "scheduled",
  "message": "Post published successfully"
}
```

### Error Response
```json
{
  "error": "Failed to publish to Instagram",
  "details": "Error message from Instagram API"
}
```

## 🔗 References

- [Instagram Content Publishing API](https://developers.facebook.com/docs/instagram-platform/content-publishing)
- [Instagram Graph API Reference](https://developers.facebook.com/docs/instagram-api/reference)
- [Instagram Business Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-login-for-instagram)












