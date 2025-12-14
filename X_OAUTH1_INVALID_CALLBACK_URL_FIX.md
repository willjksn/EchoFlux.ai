# Fix: "Invalid callback url. Please check the characters used"

## What This Error Means

This error from X indicates that the callback URL format is being rejected. This can happen even if the URL looks correct.

## Quick Fix Steps

### Step 1: Verify URL Format in Code
The callback URL used in the code is:
```
https://echoflux.ai/api/oauth/x/callback-oauth1
```

**Character breakdown:**
- `https://` - protocol (required)
- `echoflux.ai` - domain (no www, no subdomain)
- `/api/oauth/x/callback-oauth1` - path (lowercase 'x', hyphen in 'callback-oauth1')

### Step 2: Register in X Developer Portal

1. Go to **https://developer.x.com**
2. Navigate to: **Projects & Apps** → **Your Project** → **Your App** → **Settings**
3. Scroll to **User authentication settings**
4. Click **Set up** or **Edit**

### Step 3: Enable OAuth 1.0a First

**CRITICAL**: OAuth 1.0a must be enabled BEFORE adding the callback URL.

1. Find the **OAuth 1.0a** toggle or checkbox
2. **Enable it** (this is separate from OAuth 2.0)
3. Set **App permissions** to **Read and write**
4. **Save** these changes first

### Step 4: Add Callback URL

1. In the **User authentication settings** section, look for:
   - **Callback URI / Redirect URL** (for OAuth 1.0a)
   - **OAuth 1.0a Callback URLs**
   - A separate section specifically for OAuth 1.0a

2. **Important**: Some X apps have separate callback URL fields for OAuth 2.0 and OAuth 1.0a. Make sure you're adding to the **OAuth 1.0a** section.

3. Click **Add** or **+** button

4. **Copy this exact URL** (select all, copy, paste - don't type):
   ```
   https://echoflux.ai/api/oauth/x/callback-oauth1
   ```

5. **Before clicking Save, verify:**
   - ✅ No trailing slash
   - ✅ No spaces before or after
   - ✅ Starts with `https://`
   - ✅ Domain is exactly `echoflux.ai` (not `www.echoflux.ai`)
   - ✅ Path uses lowercase `x` (not uppercase `X`)
   - ✅ Hyphen in `callback-oauth1` (not underscore `_` or space)

6. Click **Save** or **Update**

### Step 5: Verify Registration

After saving:
1. Check that the URL appears in the list exactly as: `https://echoflux.ai/api/oauth/x/callback-oauth1`
2. If it shows differently, **delete it and re-add it**
3. Wait **2-3 minutes** for X's systems to recognize the change

## Common Issues

### Issue 1: URL Not in OAuth 1.0a Section
- **Problem**: You added the URL to OAuth 2.0 callback URLs instead of OAuth 1.0a
- **Fix**: Make sure you're in the OAuth 1.0a section of User authentication settings

### Issue 2: OAuth 1.0a Not Enabled
- **Problem**: You added the callback URL but OAuth 1.0a is disabled
- **Fix**: Enable OAuth 1.0a first, then add the callback URL

### Issue 3: Invalid Characters
- **Problem**: X is rejecting specific characters in the URL
- **Fix**: 
  - Make sure you're using a hyphen `-` in `callback-oauth1` (not underscore `_`)
  - Use lowercase `x` in the path (not uppercase `X`)
  - No special characters or spaces

### Issue 4: URL Modified by X Portal
- **Problem**: X Developer Portal sometimes modifies URLs when you save them
- **Fix**: 
  - After saving, check what URL actually appears in the list
  - If it's different, delete it and re-add it
  - Try copying the URL from a plain text editor to avoid hidden characters

### Issue 5: App Tier Limitations
- **Problem**: Free tier may have restrictions on OAuth 1.0a callback URLs
- **Fix**: Upgrade to Basic tier ($200/month) or higher for full OAuth 1.0a support

## Alternative: Try Simpler Callback URL

If the full path continues to cause issues, try registering just the domain first:

1. Register: `https://echoflux.ai`
2. Test if that works
3. Then try adding the full path: `https://echoflux.ai/api/oauth/x/callback-oauth1`

**Note**: X may require the exact path, so this is just a troubleshooting step.

## Verification Checklist

Before testing again, verify:
- [ ] OAuth 1.0a is **enabled** (toggle/checkbox is ON)
- [ ] App permissions are set to **"Read and write"**
- [ ] Callback URL is in the **OAuth 1.0a section** (not OAuth 2.0 section)
- [ ] Callback URL is exactly: `https://echoflux.ai/api/oauth/x/callback-oauth1`
- [ ] No trailing slash on the URL
- [ ] URL appears correctly in the list after saving
- [ ] Waited at least 2-3 minutes after saving
- [ ] Environment variables in Vercel are correct

## Still Not Working?

If you've tried everything above:

1. **Regenerate API Keys** in X Developer Portal:
   - Go to **Keys and Tokens**
   - Regenerate **API Key** and **API Secret Key**
   - Update Vercel environment variables
   - Wait 5 minutes

2. **Check X Developer Portal Status**:
   - Make sure your app is not in a restricted state
   - Verify your developer account is in good standing

3. **Contact X Support**:
   - If the error persists, it may be an X platform issue
   - X Developer Support: https://developer.x.com/en/portal/support

## Related Files

- Full setup guide: `X_OAUTH1_SETUP_GUIDE.md`
- Quick fix guide: `X_OAUTH1_CALLBACK_URL_FIX.md`
