# Instagram Graph API Migration Guide

**Date**: December 2024  
**Status**: Instagram Basic Display API was deprecated on December 4, 2024

---

## Important Changes

### What Changed?
- ❌ **Instagram Basic Display API** - Deprecated (no longer available)
- ✅ **Instagram Graph API** - Now required for all Instagram integrations

### What This Means for EngageSuite.ai
1. **Personal Instagram accounts** no longer supported (unless converted to Business/Creator)
2. **Instagram Business/Creator accounts** required
3. **Facebook Page connection** required (Instagram must be connected to a Facebook Page)
4. **Different OAuth flow** - Uses Facebook Login + Instagram permissions
5. **Code changes needed** - Complete rewrite of Instagram OAuth

---

## Requirements for Instagram Graph API

### User Requirements:
1. ✅ Instagram account must be **Business** or **Creator** account (not personal)
2. ✅ Instagram account must be **connected to a Facebook Page**
3. ✅ User must authorize **Facebook Login** first, then Instagram permissions

### Developer Requirements:
1. ✅ Facebook App (already have this)
2. ✅ Instagram Graph API product added to app
3. ✅ Required permissions requested:
   - `instagram_basic`
   - `instagram_content_publish` (for posting)
   - `pages_show_list` (to see user's pages)
   - `pages_read_engagement` (for analytics)
4. ✅ App Review submitted for permissions
5. ✅ Valid OAuth redirect URIs configured

---

## Updated Setup Steps

### Step 1: Add Instagram Product to Your Meta App

Since you're already at the Instagram Graph API page:

1. **Complete the setup steps you see:**
   - Add required messaging permissions (if needed)
   - Configure webhooks (optional for now)
   - Set up Instagram Business Login

2. **Configure OAuth Redirect URIs:**
   - Go to **Facebook Login → Settings**
   - Add redirect URI: `http://localhost:3000/api/oauth/facebook/callback`
   - Add production URI: `https://your-domain.com/api/oauth/facebook/callback`

### Step 2: Request Required Permissions

1. Go to **App Review → Permissions and Features**
2. Request these permissions:
   - `instagram_basic` - Access to Instagram account
   - `pages_show_list` - See user's Facebook Pages
   - `pages_read_engagement` - Read page engagement data
   - `instagram_content_publish` - Post to Instagram (if implementing posting)

3. Submit for review (or use in Development Mode with test users)

### Step 3: Update Environment Variables

The code will need both Facebook and Instagram credentials:
```env
# Facebook/Instagram Graph API (use same App ID for both)
FACEBOOK_CLIENT_ID=your_app_id
FACEBOOK_CLIENT_SECRET=your_app_secret
```

Note: Instagram Graph API uses the same Facebook App ID and Secret.

---

## User Experience Changes

### Before (Basic Display):
- Connect personal Instagram account directly
- Simple one-step OAuth

### After (Graph API):
- Must have Instagram Business/Creator account
- Must connect Instagram to Facebook Page first
- Two-step authorization (Facebook + Instagram permissions)
- More complex setup for users

---

## Code Migration Status

**Current Status**: ⚠️ Needs Update

The current code uses Instagram Basic Display API endpoints and will not work. We need to:
1. ✅ Create Facebook OAuth endpoints (if not exist)
2. ✅ Update Instagram OAuth to use Facebook Login flow
3. ✅ Add Instagram Business Account ID retrieval
4. ✅ Update token storage structure
5. ✅ Handle Facebook Page connection requirement

---

## Next Steps

1. **Continue with Meta Developer Portal setup** (you're on the right page!)
2. **Complete Instagram Graph API setup steps**
3. **Update EngageSuite.ai code** to use Graph API
4. **Test with Business/Creator account**

Would you like me to:
- Update the Instagram OAuth code to use Graph API?
- Create the new implementation files?
- Update the setup guide for Graph API?

Let me know and I'll proceed!
