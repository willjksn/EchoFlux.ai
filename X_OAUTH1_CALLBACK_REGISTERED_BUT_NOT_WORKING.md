# Callback URL Registered But Still Getting Error

## Problem
You've registered the callback URL `https://echoflux.ai/api/oauth/x/callback-oauth1` in X Developer Portal, but you're still getting the error:
```
OAuth 1.0a Callback URL Not Registered
```

## Most Common Causes

### 1. URL Registered in Wrong Section ⚠️ MOST COMMON

**Problem**: You registered the URL in the **OAuth 2.0** section instead of the **OAuth 1.0a** section.

**Fix**:
1. Go to X Developer Portal → Your App → Settings → User authentication settings
2. Look for **TWO separate sections**:
   - **OAuth 2.0** (for regular posting)
   - **OAuth 1.0a** (for media uploads) ← **You need this one**
3. Make sure the URL is in the **OAuth 1.0a Callback URLs** section
4. If it's only in OAuth 2.0, add it to OAuth 1.0a as well

### 2. OAuth 1.0a Not Enabled

**Problem**: OAuth 1.0a is disabled even though you added the callback URL.

**Fix**:
1. Go to X Developer Portal → Your App → Settings → User authentication settings
2. Find the **OAuth 1.0a** toggle or checkbox
3. **Enable it** (this is separate from OAuth 2.0)
4. Set **App permissions** to **Read and write**
5. **Save** the changes
6. **Then** add the callback URL

### 3. URL Format Mismatch

**Problem**: The URL in Developer Portal doesn't match exactly what the code is sending.

**Check**:
- ✅ Must be exactly: `https://echoflux.ai/api/oauth/x/callback-oauth1`
- ❌ NOT: `https://echoflux.ai/api/oauth/x/callback-oauth1/` (trailing slash)
- ❌ NOT: `https://www.echoflux.ai/api/oauth/x/callback-oauth1` (www subdomain)
- ❌ NOT: `https://echoflux.ai/api/oauth/X/callback-oauth1` (uppercase X)
- ❌ NOT: `https://echoflux.ai/api/oauth/x/callback_oauth1` (underscore instead of hyphen)

**Fix**:
1. Go to Developer Portal
2. **Delete** the existing callback URL
3. **Copy and paste** exactly: `https://echoflux.ai/api/oauth/x/callback-oauth1`
4. Verify it appears correctly in the list
5. Save and wait 2-3 minutes

### 4. Changes Not Propagated

**Problem**: X's systems haven't recognized the change yet.

**Fix**:
1. After saving in Developer Portal, **wait 2-3 minutes**
2. Don't test immediately after saving
3. Try again after waiting

### 5. App Tier Limitations

**Problem**: Free tier may have restrictions on OAuth 1.0a callback URLs.

**Fix**:
- Upgrade to **Basic tier ($200/month)** or higher for full OAuth 1.0a support
- Free tier has very limited OAuth 1.0a functionality

## Step-by-Step Verification

### Step 1: Verify OAuth 1.0a is Enabled
1. Go to https://developer.x.com
2. Navigate to: **Projects & Apps** → **Your Project** → **Your App** → **Settings**
3. Scroll to **User authentication settings**
4. Click **Set up** or **Edit**
5. **Verify**:
   - ✅ OAuth 1.0a toggle/checkbox is **ON**
   - ✅ App permissions are set to **"Read and write"**

### Step 2: Verify Callback URL Location
1. In the same **User authentication settings** section
2. Look for **TWO separate callback URL sections**:
   - One for **OAuth 2.0**
   - One for **OAuth 1.0a** ← **Check this one**
3. **Verify** the URL is in the **OAuth 1.0a** section

### Step 3: Verify URL Format
1. In the OAuth 1.0a Callback URLs list
2. **Verify** the URL appears exactly as: `https://echoflux.ai/api/oauth/x/callback-oauth1`
3. **Check**:
   - No trailing slash
   - Lowercase 'x' in the path
   - Hyphen (not underscore) in 'callback-oauth1'
   - No extra spaces

### Step 4: Delete and Re-Add (If Needed)
If the URL looks correct but still doesn't work:
1. **Delete** the callback URL from the list
2. **Wait 30 seconds**
3. **Add it again** by copying exactly: `https://echoflux.ai/api/oauth/x/callback-oauth1`
4. **Save**
5. **Wait 2-3 minutes**
6. **Test again**

## Still Not Working?

### Try This Diagnostic Checklist

1. **Double-check OAuth 1.0a is enabled** (not just OAuth 2.0)
2. **Verify URL is in OAuth 1.0a section** (not OAuth 2.0 section)
3. **Check URL format** (copy-paste from this guide, don't type)
4. **Delete and re-add** the URL
5. **Wait 2-3 minutes** after saving
6. **Check App permissions** are "Read and write"
7. **Verify your X app tier** (Basic or higher recommended)

### Regenerate API Keys

Sometimes regenerating keys helps:
1. Go to X Developer Portal → **Keys and Tokens**
2. **Regenerate** API Key and API Secret Key
3. **Update** Vercel environment variables with new keys
4. **Wait 5 minutes** for changes to propagate
5. **Try again**

### Check X Developer Portal Status

1. Make sure your app is not in a restricted state
2. Verify your developer account is in good standing
3. Check if there are any warnings or notices in the Developer Portal

### Contact X Support

If you've tried everything above:
- X Developer Support: https://developer.x.com/en/portal/support
- Include details about:
  - Your app name
  - The exact callback URL you registered
  - Screenshot of your OAuth 1.0a settings
  - The exact error message you're receiving

## Quick Reference

**Correct Callback URL**: `https://echoflux.ai/api/oauth/x/callback-oauth1`

**Where to Register**:
- X Developer Portal → Your App → Settings → User authentication settings → **OAuth 1.0a Callback URLs** (NOT OAuth 2.0)

**Requirements**:
- OAuth 1.0a must be **enabled**
- App permissions must be **"Read and write"**
- URL must match **exactly** (no trailing slash, correct case)
- Wait **2-3 minutes** after saving
