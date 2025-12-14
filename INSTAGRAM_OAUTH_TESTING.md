# Instagram OAuth Testing Checklist

## ✅ Pre-Test Verification

### 1. Environment Variables (Vercel)
- [ ] `INSTAGRAM_CLIENT_ID` is set in Vercel Production environment
- [ ] `INSTAGRAM_CLIENT_SECRET` is set in Vercel Production environment
- [ ] Both variables are visible in Vercel dashboard
- [ ] App has been redeployed after adding variables

### 2. Meta Developer Console Configuration
- [ ] Instagram App is created in Meta Developer Console
- [ ] Instagram Basic Display or Instagram Graph API product is added
- [ ] Redirect URI is added: `https://echoflux.ai/api/oauth/instagram/callback`
- [ ] App is in "Live" mode OR test users are added in "Development" mode

### 3. Required Permissions/Scopes
- [ ] `user_profile` scope is requested
- [ ] `user_media` scope is requested
- [ ] For Business accounts: `instagram_basic`, `pages_read_engagement`, `instagram_content_publish`

## 🧪 Testing Steps

### Test 1: Check Environment Variables
**Goal:** Verify credentials are accessible

1. Open browser console on `https://echoflux.ai`
2. Try to connect Instagram (Settings → Connections → Connect Instagram)
3. Check for error messages:
   - ❌ "Instagram OAuth not configured" → Environment variables missing
   - ❌ "Failed to initiate OAuth flow" → Check Vercel logs
   - ✅ Should redirect to Instagram authorization page

### Test 2: OAuth Authorization Flow
**Goal:** Verify redirect to Instagram works

1. Go to Settings → Connections
2. Click "Connect" next to Instagram
3. **Expected behavior:**
   - ✅ Redirects to Instagram authorization page
   - ✅ Shows your app name requesting permissions
   - ✅ User can authorize or deny

### Test 3: OAuth Callback Flow
**Goal:** Verify token exchange and storage

1. Complete authorization in Test 2
2. Click "Authorize" on Instagram page
3. **Expected behavior:**
   - ✅ Redirects back to `https://echoflux.ai/?oauth_success=instagram`
   - ✅ Success toast message appears
   - ✅ Instagram shows as "Connected" in Settings
   - ✅ Checkmark appears next to Instagram

### Test 4: Verify Token Storage
**Goal:** Confirm token is saved in Firestore

1. After successful connection, check Firestore:
   - Path: `users/{userId}/social_accounts/instagram`
   - Fields should include:
     - ✅ `platform: "Instagram"`
     - ✅ `connected: true`
     - ✅ `accessToken: "..."` (long-lived token)
     - ✅ `expiresAt: "..."` (ISO date string)
     - ✅ `accountId: "..."` (Instagram user ID)
     - ✅ `accountUsername: "..."` (Instagram username)
     - ✅ `lastSyncedAt: "..."` (ISO date string)

### Test 5: Error Handling
**Goal:** Verify error messages work correctly

**Test 5a: User Denies Authorization**
1. Start OAuth flow
2. Click "Cancel" or "Don't Authorize" on Instagram
3. **Expected:** Redirects to `/?error=oauth_denied&platform=instagram`
4. **Expected:** Error toast message appears

**Test 5b: Missing Environment Variables**
1. Temporarily remove `INSTAGRAM_CLIENT_ID` from Vercel
2. Try to connect Instagram
3. **Expected:** Error message "Instagram OAuth not configured"

**Test 5c: Invalid Redirect URI**
1. If redirect URI doesn't match Meta settings
2. **Expected:** Instagram shows error, redirects with error parameter

### Test 6: Disconnect Flow
**Goal:** Verify disconnection works

1. With Instagram connected, click "Disconnect"
2. **Expected behavior:**
   - ✅ Success toast: "Instagram account disconnected successfully"
   - ✅ Page reloads
   - ✅ Instagram shows as "Not Connected"
   - ✅ Firestore document is deleted or `connected: false`

## 🔍 Debugging Tips

### Check Vercel Logs
```bash
vercel logs --follow
```

Look for:
- `Instagram authorize error:` - Issues starting OAuth
- `Instagram callback error:` - Issues with token exchange
- `Instagram token exchange failed:` - Invalid credentials or redirect URI mismatch

### Check Browser Console
- Network tab: Look for `/api/oauth/instagram/authorize` POST request
- Check response for `authUrl`
- Verify redirect happens correctly

### Common Issues & Solutions

**Issue: "Instagram OAuth not configured"**
- ✅ Solution: Add `INSTAGRAM_CLIENT_ID` and `INSTAGRAM_CLIENT_SECRET` to Vercel
- ✅ Redeploy after adding

**Issue: "Invalid redirect URI"**
- ✅ Solution: Add `https://echoflux.ai/api/oauth/instagram/callback` to Meta App settings
- ✅ Check for trailing slashes (should NOT have one)
- ✅ Ensure exact match including protocol (https)

**Issue: "Token exchange failed"**
- ✅ Solution: Verify Client Secret is correct
- ✅ Check that app is in Live mode or add test users
- ✅ Verify redirect URI matches exactly

**Issue: Redirects but doesn't connect**
- ✅ Check Firestore for token storage
- ✅ Verify callback handler is working
- ✅ Check browser console for errors

## 📋 Quick Test Checklist

- [ ] Environment variables set in Vercel
- [ ] Redirect URI added in Meta
- [ ] App redeployed
- [ ] Can click "Connect" button
- [ ] Redirects to Instagram authorization
- [ ] Can authorize on Instagram
- [ ] Redirects back to app successfully
- [ ] Shows success message
- [ ] Instagram shows as "Connected"
- [ ] Token stored in Firestore
- [ ] Can disconnect successfully

## 🎯 Success Criteria

Instagram OAuth is working correctly when:
1. ✅ User can initiate connection from Settings
2. ✅ Redirects to Instagram authorization page
3. ✅ User can authorize the app
4. ✅ Redirects back to app with success
5. ✅ Instagram account shows as connected
6. ✅ Access token is stored in Firestore
7. ✅ User can disconnect the account

## 📞 Next Steps After Testing

If all tests pass:
- ✅ Instagram OAuth is fully functional
- ✅ Ready to use for posting content
- ✅ Ready to fetch Instagram data

If tests fail:
- Check error messages
- Review Vercel logs
- Verify Meta App configuration
- Check environment variables





