# Account Connection Debug Guide

## Quick Diagnostic Steps

### 1. Check if Tokens Are Being Stored

**In Browser Console:**
```javascript
// After connecting an account, check Firestore
// Go to Firebase Console → Firestore → users → {yourUserId} → social_accounts
```

**Expected Structure:**
- Document ID: `x`, `instagram`, or `facebook` (lowercase)
- Document fields:
  ```json
  {
    "platform": "X",  // Must match Platform enum exactly
    "connected": true,
    "accessToken": "...",
    "refreshToken": "...",  // X only
    "expiresAt": "2024-...",
    "accountId": "...",
    "accountUsername": "...",
    "accountName": "...",
    "lastSyncedAt": "2024-..."
  }
  ```

### 2. Check DataContext Listener

**The listener should:**
- Watch `users/{userId}/social_accounts/` subcollection
- Update `socialAccounts` state when documents change
- Map documents by `platform` field to state

**To Debug:**
1. Open browser DevTools → Console
2. Add breakpoint in DataContext.tsx line 457-462
3. Check if `items` array contains your accounts
4. Check if `platform` field matches exactly

### 3. Common Issues

#### Issue: Platform Name Mismatch
**Problem:** Document has `platform: "Twitter"` but code expects `"X"`

**Fix:** Ensure callbacks store correct platform name:
- X: `platform: "X"` (not "Twitter")
- Instagram: `platform: "Instagram"`
- Facebook: `platform: "Facebook"`

#### Issue: Document ID Mismatch
**Problem:** Document ID is `"X"` but should be `"x"` (lowercase)

**Fix:** Callbacks should use lowercase document IDs:
- `doc('x')` for X
- `doc('instagram')` for Instagram
- `doc('facebook')` for Facebook

#### Issue: Missing `connected` Field
**Problem:** Document exists but `connected` is missing or `false`

**Fix:** Ensure callbacks set `connected: true`

### 4. Test Connection Flow

1. **Go to Settings → Connections**
2. **Click "Connect" on X**
3. **Complete OAuth flow**
4. **Check browser console for errors**
5. **Check Network tab for failed API calls**
6. **Go to Firebase Console → Firestore**
7. **Verify document exists in `users/{userId}/social_accounts/x`**
8. **Refresh page and check if account shows as connected**

### 5. Manual Refresh (If Needed)

If accounts aren't showing, you can manually trigger a refresh by:
1. Disconnecting and reconnecting
2. Or reloading the page (listener should pick up changes)

### 6. Environment Variables Check

**Required for X:**
- `TWITTER_CLIENT_ID` or `X_CLIENT_ID`
- `TWITTER_CLIENT_SECRET` or `X_CLIENT_SECRET`

**Required for Instagram:**
- `INSTAGRAM_CLIENT_ID` (Facebook App ID)
- `INSTAGRAM_CLIENT_SECRET` (Facebook App Secret)

**Required for Facebook:**
- `META_APP_ID` or `FACEBOOK_APP_ID`
- `META_APP_SECRET` or `FACEBOOK_APP_SECRET`

**To Check:**
- Go to Vercel Dashboard → Project → Settings → Environment Variables
- Verify all are set
- Redeploy if you just added them

### 7. Callback URL Check

**X/Twitter:**
- Must be: `https://echoflux.ai/api/oauth/x/callback`
- Check in X Developer Portal → OAuth 2.0 Settings

**Instagram:**
- Must be: `https://echoflux.ai/api/oauth/instagram/callback`
- Check in Facebook App → Facebook Login → Valid OAuth Redirect URIs

**Facebook:**
- Must be: `https://echoflux.ai/api/oauth/meta/callback`
- Check in Facebook App → Facebook Login → Valid OAuth Redirect URIs

---

## Next Steps After Connection Works

Once accounts connect successfully:
1. **Implement message/comment syncing** - Fetch DMs and comments from APIs
2. **Implement stats fetching** - Get follower counts, engagement metrics
3. **Test publishing** - Verify auto-posting works
