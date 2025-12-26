# Comment Detection Analysis

## Executive Summary

This project **IS set up to detect when users receive comments under their posts**, with both real-time webhook support and polling-based synchronization. However, some configuration steps are required for full functionality.

---

## ✅ Implemented Features

### 1. Real-Time Webhook Support

The project includes webhook handlers for receiving instant notifications when comments are posted:

#### **Instagram** (`api/webhooks/instagram.ts`)
- ✅ Webhook endpoint: `/api/webhooks/instagram`
- ✅ Handles comment events from Instagram Graph API
- ✅ Signature verification for security
- ✅ Saves comments to Firestore `users/{userId}/messages` collection
- ✅ Creates notifications for new comments
- ✅ Maps comments to posts via `postId` field

**Status**: Code implemented, requires webhook configuration in Facebook Developer Console

#### **Facebook** (`api/webhooks/facebook.ts`)
- ✅ Webhook endpoint: `/api/webhooks/facebook`
- ✅ Handles comment events from Facebook Graph API
- ✅ Processes both direct comments and feed events
- ✅ Signature verification for security
- ✅ Saves comments to Firestore
- ✅ Creates notifications

**Status**: Code implemented, requires webhook configuration in Facebook Developer Console

#### **YouTube** (`api/webhooks/youtube.ts`)
- ✅ Webhook endpoint: `/api/webhooks/youtube`
- ✅ Handles PubSubHubbub notifications for new comments
- ✅ Extracts video ID and comment data
- ✅ Maps comments to videos via `postId` field
- ✅ Signature verification support

**Status**: Code implemented, requires PubSubHubbub subscription setup

---

### 2. Polling-Based Synchronization

The project includes a comprehensive polling service that fetches comments from all platforms:

#### **Sync Service** (`api/syncSocialData.ts`)
- ✅ Supports all 6 platforms: Instagram, X/Twitter, TikTok, YouTube, LinkedIn, Facebook
- ✅ Platform-specific comment fetching functions
- ✅ Incremental syncing (only fetches comments since last sync)
- ✅ Error handling and retry logic
- ✅ Sync status tracking in Firestore

**Platform-Specific Implementations**:
- ✅ **Instagram**: `syncInstagramComments()` - Fetches comments via Graph API
- ✅ **X/Twitter**: `syncTwitterComments()` - Fetches mentions/replies
- ✅ **TikTok**: `syncTikTokComments()` - Fetches video comments
- ✅ **YouTube**: `syncYouTubeComments()` - Fetches video comments
- ✅ **LinkedIn**: `syncLinkedInComments()` - Fetches post comments
- ✅ **Facebook**: `syncFacebookComments()` - Fetches page post comments

**Status**: Code fully implemented, but **cron job not configured** (see Issues section)

---

### 3. Frontend Real-Time Detection

The frontend is set up to automatically detect and display new comments:

#### **Firestore Real-Time Listeners** (`components/contexts/DataContext.tsx`)
- ✅ Listens to `users/{userId}/messages` collection
- ✅ Automatically updates when new comments arrive
- ✅ Filters by `type: "Comment"` vs `type: "DM"`
- ✅ Orders by timestamp (newest first)

#### **UI Components**
- ✅ **Dashboard** (`components/Dashboard.tsx`): Displays comments in unified inbox with filters
- ✅ **MessageCard** (`components/MessageCard.tsx`): Renders comment cards with user info
- ✅ **Filtering**: Users can filter by type (All/DM/Comment) and platform

**Status**: Fully functional - comments appear in real-time when saved to Firestore

---

### 4. Data Structure

Comments are stored with the following structure:

```typescript
{
  id: string;                    // Unique comment ID
  platform: Platform;             // Instagram, Facebook, etc.
  type: "Comment";                // Distinguishes from "DM"
  user: {
    name: string;                 // Commenter's name
    avatar: string;               // Profile picture URL
    id: string;                   // Platform user ID
  };
  content: string;                // Comment text
  timestamp: string;              // ISO timestamp
  postId: string;                 // Links to the post being commented on
  sentiment?: "Positive" | "Neutral" | "Negative";
  isRead: boolean;
  isFlagged: boolean;
  isFavorite: boolean;
  createdAt: string;              // When saved to system
}
```

**Storage Location**: `users/{userId}/messages/{commentId}`

---

## ⚠️ Configuration Issues & Gaps

### 1. Missing Cron Job Configuration

**Issue**: The sync service (`api/syncSocialData.ts`) is not scheduled to run automatically.

**Current State**:
- `vercel.json` only has a cron for `autoPostScheduled` (every 15 minutes)
- No cron job configured for `syncSocialData`

**Required Action**:
Add to `vercel.json`:
```json
"crons": [
  {
    "path": "/api/autoPostScheduled",
    "schedule": "*/15 * * * *"
  },
  {
    "path": "/api/syncSocialData",
    "schedule": "*/10 * * * *",
    "headers": {
      "Authorization": "Bearer YOUR_CRON_SECRET"
    }
  }
]
```

**Environment Variable Needed**:
- `CRON_SECRET`: Secret token for authenticating cron requests

---

### 2. Webhook Configuration Required

While the webhook handlers are implemented, they need to be configured with the respective platforms:

#### **Instagram/Facebook Webhooks**
- ✅ Code: Implemented in `api/webhooks/instagram.ts` and `api/webhooks/facebook.ts`
- ❌ Configuration: Needs setup in Facebook Developer Console
- **Required Environment Variables**:
  - `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
  - `INSTAGRAM_WEBHOOK_SECRET`
  - `FACEBOOK_WEBHOOK_VERIFY_TOKEN`
  - `FACEBOOK_WEBHOOK_SECRET`

#### **YouTube Webhooks**
- ✅ Code: Implemented in `api/webhooks/youtube.ts`
- ❌ Configuration: Needs PubSubHubbub subscription
- **Required Environment Variable**:
  - `YOUTUBE_WEBHOOK_SECRET`

**Setup Guide**: See `WEBHOOK_SETUP_GUIDE.md` for detailed instructions

---

### 3. Platform-Specific API Requirements

Some platforms require specific account types or permissions:

#### **Instagram**
- Requires: Instagram Business or Creator account
- Permissions: `instagram_basic`, `pages_read_engagement`
- API: Instagram Graph API

#### **X/Twitter**
- Requires: Twitter Developer Account with Elevated access
- Limitations: Webhooks not available for most apps (polling only)

#### **TikTok**
- Requires: TikTok Business Account
- Limitations: No webhook support (polling only)

#### **LinkedIn**
- Requires: LinkedIn Company Page or Personal Profile
- Limitations: Limited webhook support (polling recommended)

---

## 📊 Detection Methods Summary

| Platform | Webhook | Polling | Status |
|----------|---------|---------|--------|
| Instagram | ✅ Implemented | ✅ Implemented | ⚠️ Needs webhook config |
| Facebook | ✅ Implemented | ✅ Implemented | ⚠️ Needs webhook config |
| YouTube | ✅ Implemented | ✅ Implemented | ⚠️ Needs PubSubHubbub setup |
| X/Twitter | ❌ Not available | ✅ Implemented | ✅ Ready (polling only) |
| TikTok | ❌ Not available | ✅ Implemented | ✅ Ready (polling only) |
| LinkedIn | ⚠️ Limited | ✅ Implemented | ✅ Ready (polling recommended) |

---

## 🔄 How Comment Detection Works

### Real-Time Flow (Webhooks)
1. User receives comment on social media platform
2. Platform sends webhook POST request to `/api/webhooks/{platform}`
3. Webhook handler verifies signature
4. Comment data is extracted and saved to Firestore
5. Notification is created in `users/{userId}/notifications`
6. Frontend Firestore listener detects new document
7. Comment appears in Dashboard inbox in real-time

### Polling Flow (Sync Service)
1. Cron job triggers `/api/syncSocialData` every 10 minutes (when configured)
2. Service fetches all users with connected accounts
3. For each platform, calls platform-specific sync function
4. Fetches comments since last sync timestamp
5. Saves new comments to Firestore
6. Updates sync status with timestamp and counts
7. Frontend detects new comments via Firestore listener

### Frontend Detection
1. `DataContext.tsx` sets up Firestore listener on mount
2. Listens to `users/{userId}/messages` collection
3. Filters by `type: "Comment"`
4. Automatically updates state when new comments arrive
5. Dashboard component re-renders with new comments
6. Users see comments in unified inbox

---

## ✅ What's Working

1. **Code Infrastructure**: All comment detection code is implemented
2. **Frontend Display**: Comments are displayed in Dashboard with filtering
3. **Real-Time Updates**: Firestore listeners will show new comments instantly
4. **Multi-Platform Support**: All 6 platforms have comment fetching logic
5. **Data Storage**: Comments are properly structured and stored
6. **Notifications**: System creates notifications for new comments

---

## ❌ What Needs Configuration

1. **Cron Job**: Add sync service to `vercel.json` crons
2. **Webhook Setup**: Configure webhooks in platform developer consoles
3. **Environment Variables**: Set webhook secrets and verify tokens
4. **Testing**: Verify webhook endpoints are accessible and working

---

## 🎯 Recommendations

### Immediate Actions
1. **Add cron job** to `vercel.json` for automatic syncing
2. **Set environment variables** for webhook secrets
3. **Configure Instagram/Facebook webhooks** in Developer Console
4. **Test webhook endpoints** using ngrok for local development

### Testing Checklist
- [ ] Test Instagram webhook with sample comment
- [ ] Test Facebook webhook with sample comment
- [ ] Test YouTube PubSubHubbub subscription
- [ ] Verify cron job runs and syncs comments
- [ ] Confirm comments appear in Dashboard in real-time
- [ ] Test filtering by type (Comment vs DM)
- [ ] Verify notifications are created

### Documentation
- ✅ `WEBHOOK_SETUP_GUIDE.md` - Detailed webhook setup instructions
- ✅ `API_INTEGRATION_STATUS.md` - Platform API status
- ✅ This document - Comment detection analysis

---

## 📝 Conclusion

**The project IS set up to detect comments**, with comprehensive code for both real-time webhooks and polling-based synchronization. The infrastructure is solid, but requires:

1. **Configuration**: Webhook setup and cron job scheduling
2. **Environment Variables**: Webhook secrets and tokens
3. **Testing**: Verification that webhooks are receiving events

Once configured, the system will:
- ✅ Detect comments in real-time via webhooks (Instagram, Facebook, YouTube)
- ✅ Poll for comments every 10 minutes as fallback
- ✅ Display comments instantly in the Dashboard
- ✅ Create notifications for new comments
- ✅ Support all 6 major social media platforms

The code is production-ready; it just needs the operational configuration to be activated.












