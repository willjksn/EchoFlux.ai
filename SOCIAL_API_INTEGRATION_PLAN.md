# Social Media API Integration Plan

## Overview
Connecting real social media APIs to fetch live follower counts, engagement metrics, and enable actual posting.

## Phase 1: Infrastructure Setup

### 1. Add OAuth Token Storage
- Add `SocialAccount` interface for storing OAuth tokens
- Add `socialAccounts` array to User interface
- Store tokens securely in Firestore (encrypted or in a secure subcollection)

### 2. Create OAuth Service Structure
- Base OAuth service interface
- Platform-specific implementations (Instagram, Facebook, etc.)
- Token refresh logic
- Error handling

### 3. Create API Endpoints
- `/api/oauth/instagram/authorize` - Start OAuth flow
- `/api/oauth/instagram/callback` - Handle OAuth callback
- `/api/social/instagram/stats` - Fetch Instagram stats
- Similar for other platforms

## Phase 2: Platform Integrations

### Priority Order:
1. **Instagram** - Most popular, well-documented API
2. **Facebook** - Similar to Instagram (Meta platforms)
3. **TikTok** - Growing platform
4. **X (Twitter)** - Essential for many businesses
5. **LinkedIn** - B2B focus
6. **YouTube** - Video content
7. **Threads** - New but growing

## Phase 3: Implementation Details

### Instagram Integration
- Uses Instagram Basic Display API or Instagram Graph API
- Requires Facebook App setup
- OAuth flow: User authorizes → Get access token → Store token
- Fetch stats: followers, following, posts count, engagement

### Facebook Integration
- Uses Facebook Graph API
- Similar OAuth flow
- Can fetch page stats, post metrics

### Token Storage
- Store in Firestore: `users/{userId}/social_accounts/{platform}`
- Include: accessToken, refreshToken, expiresAt, accountId
- Encrypt sensitive tokens (or use Firebase App Check + Firestore rules)

## Phase 4: Update Services

### Update `socialStatsService.ts`
- Check if real API tokens exist
- If yes: Fetch from real APIs
- If no: Fall back to aggregated post data (current behavior)

### Update Dashboard
- Show connection status per platform
- Display real-time follower counts
- Show connection badges/indicators

## Security Considerations
- Never expose tokens to frontend
- Use server-side API routes for all API calls
- Implement token refresh automatically
- Handle token expiration gracefully
- Use environment variables for API keys

## Environment Variables Needed
```
INSTAGRAM_CLIENT_ID=
INSTAGRAM_CLIENT_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
X_API_KEY=
X_API_SECRET=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
```

