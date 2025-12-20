# Instagram Token Exchange Failed - Troubleshooting

## Error: "token_exchange_failed"

This error occurs when exchanging the authorization code for an access token fails.

## 🔍 Common Causes & Solutions

### Issue 1: Wrong App ID/Secret (Most Common)

**Problem:** Using Instagram App ID/Secret instead of Facebook App ID/Secret

**Solution:**
- For Instagram Graph API, you MUST use **Facebook App ID** and **Facebook App Secret**
- NOT Instagram App ID/Secret
- Your Facebook App ID: `875668391474933`

**Check Vercel Environment Variables:**
- `INSTAGRAM_CLIENT_ID` should be: `875668391474933` (Facebook App ID)
- `INSTAGRAM_CLIENT_SECRET` should be: Your Facebook App Secret (not Instagram Secret)

### Issue 2: Redirect URI Mismatch

**Problem:** Redirect URI doesn't match exactly what's configured in Meta

**Solution:**
1. Go to Meta Developer Console → Your App
2. Products → Facebook Login → Settings
3. Check "Valid OAuth Redirect URIs"
4. Must include exactly: `https://echoflux.ai/api/oauth/instagram/callback`
5. No trailing slash
6. Must be HTTPS (not HTTP)

### Issue 3: Code Already Used or Expired

**Problem:** Authorization code can only be used once and expires quickly

**Solution:**
- Try connecting Instagram again
- Complete the authorization flow without delay
- Don't refresh the callback page

### Issue 4: Missing Permissions/Scopes

**Problem:** App doesn't have required permissions

**Solution:**
1. Go to Meta Developer Console → Your App
2. Products → Facebook Login → Settings
3. Check "App Review" → "Permissions and Features"
4. Ensure these permissions are approved:
   - `instagram_basic`
   - `pages_show_list`
   - `instagram_content_publish`
   - `pages_read_engagement`

### Issue 5: App Not in Correct Mode

**Problem:** App is in Development Mode and user isn't a test user

**Solution:**
- Add your account as a test user in Meta Developer Console
- Or switch app to Live Mode (may require app review)

## 🔧 Quick Fix Checklist

- [ ] `INSTAGRAM_CLIENT_ID` = Facebook App ID (`875668391474933`)
- [ ] `INSTAGRAM_CLIENT_SECRET` = Facebook App Secret (not Instagram Secret)
- [ ] Redirect URI added in Facebook Login settings: `https://echoflux.ai/api/oauth/instagram/callback`
- [ ] Redirect URI matches exactly (no trailing slash, HTTPS)
- [ ] App redeployed after updating environment variables
- [ ] User has Business/Creator Instagram account
- [ ] Instagram account connected to Facebook Page

## 📋 Verify Configuration

### Step 1: Check Environment Variables

In Vercel:
- Go to Settings → Environment Variables
- Verify `INSTAGRAM_CLIENT_ID` = `875668391474933`
- Verify `INSTAGRAM_CLIENT_SECRET` = Your Facebook App Secret

### Step 2: Check Meta App Settings

1. Meta Developer Console → Your App
2. Settings → Basic
3. Verify App ID matches `875668391474933`
4. Products → Facebook Login → Settings
5. Verify redirect URI is configured

### Step 3: Test Again

1. Try connecting Instagram again
2. Check browser console for error details
3. Check Vercel logs for server-side errors

## 🐛 Debugging

After redeploying with improved error logging, check:
- Browser console for error details
- URL parameters after redirect (may include error details)
- Vercel function logs for detailed error messages

## 📞 Next Steps

1. Verify you're using Facebook App ID/Secret (not Instagram)
2. Ensure redirect URI is configured correctly
3. Redeploy after fixing environment variables
4. Try connecting again









