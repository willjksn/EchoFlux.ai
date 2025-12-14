# X OAuth 1.0a Callback URL Registration - Quick Fix Guide

## Error Messages

### Error 1: "OAuth 1.0a Callback URL Not Registered"
```
OAuth 1.0a Callback URL Not Registered: The callback URL must be registered in your X Developer Portal. 
Go to your X App settings → User authentication settings → Callback URI / Redirect URL and add: 
https://echoflux.ai/api/oauth/x/callback-oauth1
```

### Error 2: "Invalid callback url. Please check the characters used"
This error means X is rejecting the callback URL format. Common causes:
- URL contains invalid characters
- URL not registered in Developer Portal
- Encoding issues
- Trailing slash or extra spaces

## Step-by-Step Fix

### Step 1: Access X Developer Portal
1. Go to **https://developer.x.com**
2. Sign in with your X account
3. Navigate to **Projects & Apps** in the left sidebar

### Step 2: Find Your App
1. Click on your **Project** (the container for your app)
2. Click on your **App** (the specific application)
3. Click on **Settings** tab (or gear icon)

### Step 3: Enable OAuth 1.0a (If Not Already Enabled)
1. Scroll down to **User authentication settings** section
2. Click **Set up** or **Edit** button
3. Find the **OAuth 1.0a** toggle or checkbox
4. **Enable OAuth 1.0a** (this is separate from OAuth 2.0)
5. Set **App permissions** to **Read and write**

### Step 4: Add the Callback URL
1. In the same **User authentication settings** section, find:
   - **Callback URI / Redirect URL** field, OR
   - **Callback URLs** section, OR
   - **OAuth 1.0a Callback URLs** field

2. Click **Add** or **+** button (if there's a list)
   - OR paste directly into the input field if it's a single field

3. **Copy and paste this exact URL** (no modifications):
   ```
   https://echoflux.ai/api/oauth/x/callback-oauth1
   ```
   
   **IMPORTANT**: 
   - Copy the URL above directly (don't type it manually)
   - Make sure you copy the entire URL including `https://`
   - Don't add any characters, spaces, or modify it in any way

4. **Critical Checks Before Saving:**
   - ✅ Starts with `https://` (not `http://`)
   - ✅ Domain is `echoflux.ai` (not `www.echoflux.ai` or any other variation)
   - ✅ Path is `/api/oauth/x/callback-oauth1` (exact match, lowercase 'x')
   - ✅ **NO trailing slash** (must NOT end with `/`)
   - ✅ No extra spaces before or after
   - ✅ No invisible characters (copy-paste from above, don't type)
   - ✅ Hyphen in "callback-oauth1" is correct (not underscore or space)

5. Click **Save** or **Update** button

### Step 5: Verify the URL Was Added
1. After saving, you should see the URL in a list of callback URLs
2. Verify it appears exactly as: `https://echoflux.ai/api/oauth/x/callback-oauth1`
3. If you see it listed, the registration was successful

### Step 6: Wait for Propagation
- X's systems may take **1-2 minutes** to recognize the new callback URL
- Don't test immediately after saving - wait at least 2 minutes

### Step 7: Test the Connection
1. Go back to your app: **Settings → Connections**
2. Find your X account
3. Click **"Connect OAuth 1.0a"** button
4. If successful, you'll be redirected to X for authorization
5. After authorizing, you should see "✓ Connected - Images and videos can be uploaded"

## Common Mistakes to Avoid

❌ **WRONG**: `https://echoflux.ai/api/oauth/x/callback-oauth1/` (trailing slash)
❌ **WRONG**: `http://echoflux.ai/api/oauth/x/callback-oauth1` (HTTP instead of HTTPS)
❌ **WRONG**: `https://www.echoflux.ai/api/oauth/x/callback-oauth1` (www subdomain)
❌ **WRONG**: `https://echoflux.ai/api/oauth/x/callback-oauth1 ` (trailing space)
❌ **WRONG**: `https://echoflux.ai/api/oauth/X/callback-oauth1` (uppercase X)

✅ **CORRECT**: `https://echoflux.ai/api/oauth/x/callback-oauth1`

**Note**: If X Developer Portal shows the URL differently after saving, delete it and re-add it. Sometimes X's interface can modify URLs slightly.

## Fixing "Invalid callback url. Please check the characters used"

If you get this specific error:

1. **Delete the existing callback URL** in X Developer Portal (if you added it)
2. **Copy the URL fresh** from this guide (don't type it)
3. **Check for hidden characters:**
   - Try copying from a plain text editor
   - Make sure no smart quotes or special characters were added
   - Verify each character is correct
4. **Try registering without the path first** (if X allows):
   - Some X apps require just the domain: `https://echoflux.ai`
   - Then add the full path: `https://echoflux.ai/api/oauth/x/callback-oauth1`
5. **Verify in Developer Portal:**
   - After saving, check that the URL appears exactly as: `https://echoflux.ai/api/oauth/x/callback-oauth1`
   - If it shows differently, delete and re-add it

## Still Getting the Error?

If you've followed all steps and still get the error after 2-3 minutes:

1. **Double-check the URL in X Developer Portal:**
   - Go back to Settings → User authentication settings
   - Verify the URL is exactly: `https://echoflux.ai/api/oauth/x/callback-oauth1`
   - If it's different, delete it and re-add it

2. **Check OAuth 1.0a is Enabled:**
   - Make sure OAuth 1.0a toggle/checkbox is ON
   - OAuth 2.0 being enabled doesn't automatically enable OAuth 1.0a

3. **Verify App Permissions:**
   - Must be set to **"Read and write"** (not just "Read")

4. **Check Your X App Tier:**
   - Free tier has very limited OAuth 1.0a support
   - Basic tier ($200/month) or higher is recommended for production

5. **Try Regenerating Credentials:**
   - In X Developer Portal → Keys and Tokens
   - Regenerate API Key and Secret (if needed)
   - Update your Vercel environment variables with new credentials
   - Wait 5 minutes for changes to propagate

6. **Clear Browser Cache:**
   - Sometimes browser cache can cause issues
   - Try in an incognito/private window

## Verification Checklist

Before testing, verify:
- [ ] OAuth 1.0a is enabled in X Developer Portal
- [ ] App permissions are set to "Read and write"
- [ ] Callback URL is registered exactly as: `https://echoflux.ai/api/oauth/x/callback-oauth1`
- [ ] No trailing slash on the callback URL
- [ ] Using HTTPS (not HTTP)
- [ ] Waited at least 2 minutes after saving
- [ ] Environment variables in Vercel are set correctly (`TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`)

## Need More Help?

- See the full guide: `X_OAUTH1_SETUP_GUIDE.md`
- X Developer Portal: https://developer.x.com
- X OAuth 1.0a Docs: https://docs.x.com/fundamentals/authentication/oauth-1-0a/authorizing-a-request
