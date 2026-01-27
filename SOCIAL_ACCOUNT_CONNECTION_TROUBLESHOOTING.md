# Social Account Connection Troubleshooting Guide

## Current Implementation Status

### ✅ OAuth Endpoints Exist
- **X/Twitter**: `api/oauth/x/authorize.ts` + `api/oauth/x/callback.ts`
- **Instagram**: `api/oauth/instagram/authorize.ts` + `api/oauth/instagram/callback.ts`
- **Facebook/Meta**: `api/oauth/meta/authorize.ts` + `api/oauth/meta/callback.ts`

### ✅ Token Storage
- Tokens stored in: `users/{userId}/social_accounts/{platform}`
- Structure: `{ platform, connected, accessToken, refreshToken, expiresAt, accountId, accountUsername, accountName }`

### ✅ Data Loading
- Firestore listener in `DataContext.tsx` (line 446-464)
- Automatically loads accounts from `users/{userId}/social_accounts/`
- Updates `socialAccounts` state when accounts change

---

## Common Issues & Solutions

### Issue 1: Accounts Not Appearing After Connection

**Symptoms:**
- OAuth flow completes successfully
- Redirect shows success message
- But account doesn't show as connected in Settings

**Possible Causes:**

#### A. Firestore Listener Not Working
**Check:**
1. Open browser DevTools → Console
2. Look for errors when connecting account
3. Check if `onSnapshot` is firing

**Solution:**
- The listener should automatically update when a new account is added
- If not working, check Firestore rules allow reading `social_accounts`

#### B. Data Structure Mismatch
**Check:**
1. Go to Firebase Console → Firestore
2. Navigate to `users/{yourUserId}/social_accounts/`
3. Check if documents exist with correct structure

**Expected Structure:**
```json
{
  "platform": "X",
  "connected": true,
  "accessToken": "...",
  "refreshToken": "...",
  "expiresAt": "2024-...",
  "accountId": "...",
  "accountUsername": "...",
  "accountName": "...",
  "lastSyncedAt": "2024-..."
}
```

**Solution:**
- Ensure document ID matches platform name (lowercase): `x`, `instagram`, `facebook`
- Ensure `platform` field matches exactly: `"X"`, `"Instagram"`, `"Facebook"`

#### C. Platform Name Mismatch
**Check:**
- Document ID in Firestore vs. Platform enum in code
- X should be stored as document ID `"x"` but platform field `"X"`

**Solution:**
- Verify callback stores correct platform name
- Check `DataContext.tsx` line 459: `accounts[item.platform as Platform]`

---

### Issue 2: OAuth Flow Fails

**Symptoms:**
- Click "Connect" → Redirects to platform
- Authorize → Redirects back
- Shows error message

**Possible Causes:**

#### A. Environment Variables Missing
**Required Variables:**
```env
# X/Twitter
TWITTER_CLIENT_ID=your_client_id
TWITTER_CLIENT_SECRET=your_client_secret
# OR
X_CLIENT_ID=your_client_id
X_CLIENT_SECRET=your_client_secret

# Instagram (via Facebook)
INSTAGRAM_CLIENT_ID=your_facebook_app_id
INSTAGRAM_CLIENT_SECRET=your_facebook_app_secret

# Facebook/Meta
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
# OR
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
```

**Check:**
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Verify all required variables are set
3. Ensure they're available in Production, Preview, and Development

**Solution:**
- Add missing variables
- Redeploy if needed (Vercel auto-deploys on env var changes)

#### B. Callback URL Mismatch
**X/Twitter:**
- Must be EXACTLY: `https://echoflux.ai/api/oauth/x/callback`
- Check X Developer Portal → OAuth 2.0 Settings → Callback URLs
- Must match exactly (no trailing slash, exact domain)

**Instagram/Facebook:**
- Must match what's in Facebook App Settings → Facebook Login → Valid OAuth Redirect URIs
- Format: `https://echoflux.ai/api/oauth/instagram/callback`
- Or: `https://echoflux.ai/api/oauth/meta/callback`

**Solution:**
- Update callback URLs in platform developer portals
- Ensure they match exactly what's in the code

#### C. App Not Approved (Instagram/Facebook)
**Instagram Requirements:**
- Instagram Business Account required
- Account must be connected to a Facebook Page
- App must be in "Live" mode (not Development)
- May require App Review for certain permissions

**Solution:**
- Use Instagram Business Account (not personal)
- Connect Instagram to Facebook Page
- Complete Facebook App Review if needed

---

### Issue 3: Tokens Stored But No Data Visible

**Symptoms:**
- Account shows as "Connected" in Settings
- But no DMs/comments appear in Inbox
- No stats show in Dashboard

**Possible Causes:**

#### A. Data Fetching Not Implemented
**Check:**
- Inbox component loads messages from `messages` collection
- Messages need to be synced from platforms via API

**Current Status:**
- OAuth tokens are stored ✅
- But message/comment syncing may not be active
- Stats fetching exists but may need platform-specific implementation

#### B. Missing Sync Endpoints
**Check if these exist:**
- `/api/social/sync` - Sync messages/comments from platforms
- `/api/social/instagram/sync` - Instagram-specific sync
- `/api/social/x/sync` - X-specific sync
- `/api/social/facebook/sync` - Facebook-specific sync

**Solution:**
- Implement sync endpoints that:
  1. Read tokens from Firestore
  2. Call platform APIs to fetch DMs/comments
  3. Store in `users/{userId}/messages/` collection
  4. Inbox will automatically show them (via Firestore listener)

#### C. Permissions/Scopes Missing
**X/Twitter:**
- Required scopes: `tweet.read`, `tweet.write`, `users.read`, `offline.access`
- For DMs: May need additional permissions

**Instagram:**
- Required scopes: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`
- For comments: May need `pages_manage_metadata`

**Facebook:**
- Required scopes: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`
- For messages: `pages_messaging`

**Solution:**
- Update OAuth scopes in authorize endpoints
- Re-authorize accounts to get new permissions

---

## Diagnostic Steps

### Step 1: Verify OAuth Flow Works
1. Go to Settings → Connections
2. Click "Connect" on X
3. Complete OAuth flow
4. Check browser console for errors
5. Check Network tab for failed API calls

### Step 2: Verify Token Storage
1. Go to Firebase Console → Firestore
2. Navigate to `users/{yourUserId}/social_accounts/`
3. Check if document exists (e.g., `x`, `instagram`, `facebook`)
4. Verify structure matches expected format

### Step 3: Verify Data Loading
1. Open browser DevTools → Console
2. Look for Firestore listener errors
3. Check if `socialAccounts` state updates
4. Add temporary console.log in DataContext to see when accounts load

### Step 4: Test API Endpoints
1. Check if `/api/oauth/x/authorize` returns auth URL
2. Check if `/api/oauth/x/callback` stores token correctly
3. Check if `/api/social/fetchRealStats` returns data

---

## Quick Fixes

### Fix 1: Force Refresh Social Accounts
Add a manual refresh button in Settings:

```typescript
const handleRefreshAccounts = async () => {
  // Force reload from Firestore
  if (!user) return;
  const accountsRef = collection(db, 'users', user.id, 'social_accounts');
  const snapshot = await getDocs(accountsRef);
  const accounts: Record<Platform, SocialAccount | null> = {
    Instagram: null,
    X: null,
    Facebook: null,
    // ... other platforms
  };
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.platform) {
      accounts[data.platform as Platform] = data as SocialAccount;
    }
  });
  setSocialAccounts(accounts);
  showToast('Accounts refreshed', 'success');
};
```

### Fix 2: Check Firestore Rules
Ensure rules allow reading `social_accounts`:

```javascript
match /users/{userId}/social_accounts/{accountId} {
  allow read: if request.auth != null && request.auth.uid == userId;
  allow write: if false; // Only server-side writes via Admin SDK
}
```

### Fix 3: Verify Environment Variables
Create a test endpoint to check env vars (admin only):

```typescript
// api/test/env.ts
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authUser = await verifyAuth(req);
  if (authUser?.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  
  return res.json({
    hasTwitterClientId: !!process.env.TWITTER_CLIENT_ID,
    hasTwitterSecret: !!process.env.TWITTER_CLIENT_SECRET,
    hasInstagramClientId: !!process.env.INSTAGRAM_CLIENT_ID,
    hasInstagramSecret: !!process.env.INSTAGRAM_CLIENT_SECRET,
    hasMetaAppId: !!process.env.META_APP_ID,
    hasMetaSecret: !!process.env.META_APP_SECRET,
  });
}
```

---

## Next Steps

1. **Check Environment Variables** - Verify all required vars are set in Vercel
2. **Check Firestore Data** - Verify tokens are being stored correctly
3. **Check Console Logs** - Look for errors during OAuth flow
4. **Test OAuth Flow** - Try connecting each platform one by one
5. **Verify Callback URLs** - Ensure they match in developer portals

---

## Platform-Specific Notes

### X/Twitter
- Uses OAuth 2.0 with PKCE
- Requires exact callback URL match
- Tokens stored with refresh token for renewal

### Instagram
- Uses Facebook Login (Instagram Basic Display deprecated)
- Requires Instagram Business Account
- Must be connected to Facebook Page
- Uses Page access token as Instagram token

### Facebook
- Uses Facebook Graph API
- Requires Page access (not personal profile)
- Page token used for posting

---

## Testing Checklist

- [ ] Environment variables set in Vercel
- [ ] Callback URLs configured in developer portals
- [ ] OAuth flow completes without errors
- [ ] Tokens appear in Firestore after connection
- [ ] Accounts show as connected in Settings
- [ ] Firestore listener updates `socialAccounts` state
- [ ] Inbox shows messages (if sync implemented)
- [ ] Stats show in Dashboard (if implemented)
