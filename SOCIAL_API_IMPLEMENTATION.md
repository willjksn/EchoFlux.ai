# Social Media API Integration - Implementation Status

## ✅ Completed

### 1. Type Definitions
- ✅ Added `SocialAccount` interface to `types.ts`
- ✅ Added `socialAccounts` field to `User` interface
- ✅ Types support OAuth tokens, account info, and sync timestamps

### 2. OAuth Infrastructure
- ✅ Created `src/services/socialMediaOAuth.ts` - Base OAuth service structure
- ✅ Instagram OAuth class implementation
- ✅ Platform abstraction for easy extension

### 3. Instagram API Integration
- ✅ `api/oauth/instagram/authorize.ts` - Start OAuth flow
- ✅ `api/oauth/instagram/callback.ts` - Handle OAuth callback and store tokens
- ✅ `api/social/instagram/stats.ts` - Fetch Instagram stats using stored tokens

### 4. Unified Stats Service
- ✅ `api/social/fetchRealStats.ts` - Aggregate stats from all connected platforms

## 📋 Next Steps

### 1. Frontend OAuth Integration
Create UI components to:
- Connect/disconnect social accounts
- Show connection status per platform
- Initiate OAuth flows from Settings page

### 2. Update Social Stats Service
Modify `src/services/socialStatsService.ts` to:
- Check for real API tokens first
- Fetch from real APIs if tokens exist
- Fall back to aggregated post data if not

### 3. Environment Variables Setup
Add to `.env` or Vercel:
```
INSTAGRAM_CLIENT_ID=your_client_id
INSTAGRAM_CLIENT_SECRET=your_client_secret
```

### 4. Facebook Integration
- Facebook Graph API OAuth endpoints
- Facebook stats fetching

### 5. Other Platforms
- TikTok, X (Twitter), LinkedIn, YouTube, Threads

## 🔧 Required Setup

### Instagram App Setup (Meta Developer)
1. Go to https://developers.facebook.com/
2. Create a Facebook App
3. Add Instagram Basic Display product
4. Configure OAuth redirect URI: `http://localhost:3000/api/oauth/instagram/callback`
5. Get Client ID and Client Secret
6. Add to environment variables

### Instagram API Limitations
- **Basic Display API**: Limited metrics (posts count, user info)
- **Graph API**: Requires Business/Creator account for followers/following
- Current implementation uses Basic Display API

## 🎯 Usage

### To Connect Instagram Account:
1. User clicks "Connect Instagram" in Settings
2. Frontend calls `/api/oauth/instagram/authorize`
3. User redirected to Instagram authorization page
4. User authorizes app
5. Instagram redirects to `/api/oauth/instagram/callback`
6. Backend exchanges code for token and stores in Firestore
7. User redirected back to app with success message

### To Fetch Real Stats:
1. Dashboard loads
2. Checks for connected accounts in Firestore
3. Calls `/api/social/fetchRealStats` for connected platforms
4. Updates user's `socialStats` with real data
5. Falls back to aggregated post data for unconnected platforms

## 📝 Notes

- Tokens stored in Firestore: `users/{userId}/social_accounts/{platform}`
- Tokens should be encrypted in production (consider Firebase App Check + Firestore rules)
- Long-lived tokens (60 days) are automatically requested
- Token refresh logic needed for expired tokens

