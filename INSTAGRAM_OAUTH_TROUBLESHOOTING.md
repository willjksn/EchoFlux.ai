# Instagram OAuth "Invalid platform app" Error - Troubleshooting Guide

## Error: "Invalid Request: Request parameters are invalid: Invalid platform app"

This error means Instagram doesn't recognize your app as a valid Instagram app. Here's how to fix it:

## ✅ Step-by-Step Fix

### Step 1: Verify App Type in Meta Developer Console

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Select your app
3. Go to **Settings** → **Basic**
4. Check **App Type**:
   - ✅ Should be **"Consumer"** or **"Business"**
   - ❌ NOT "None" or missing

### Step 2: Add Instagram Basic Display Product

1. In your Meta App, go to **Products** (left sidebar)
2. Click **"+ Add Product"**
3. Find **"Instagram"** → **"Basic Display"**
4. Click **"Set Up"**
5. Complete the setup wizard

### Step 3: Verify Instagram App ID

1. After adding Instagram Basic Display, go to **Products** → **Instagram** → **Basic Display**
2. You should see:
   - **Instagram App ID** (this is your `INSTAGRAM_CLIENT_ID`)
   - **Instagram App Secret** (this is your `INSTAGRAM_CLIENT_SECRET`)
3. **Important:** These are DIFFERENT from your Facebook App ID (`875668391474933`)

### Step 4: Configure Valid OAuth Redirect URIs

1. In **Instagram Basic Display** settings
2. Scroll to **"Valid OAuth Redirect URIs"**
3. Add: `https://echoflux.ai/api/oauth/instagram/callback`
4. Click **"Save Changes"**

### Step 5: Verify App Mode

1. Go to **Settings** → **Basic**
2. Check **App Mode**:
   - **Development Mode**: Only test users can use it
   - **Live Mode**: Anyone can use it (requires app review for some features)

### Step 6: Add Test Users (if in Development Mode)

If your app is in Development Mode:
1. Go to **Roles** → **Roles** (left sidebar)
2. Click **"Add Test Users"**
3. Add your Instagram account as a test user
4. The test user must accept the invitation

## 🔍 Common Issues

### Issue 1: Using Facebook App ID Instead of Instagram App ID
**Symptom:** Getting "Invalid platform app" error

**Solution:**
- Make sure you're using the **Instagram App ID** from Instagram Basic Display
- NOT the Facebook App ID (`875668391474933`)
- These are two different apps/products

### Issue 2: Instagram Basic Display Not Added
**Symptom:** Can't find Instagram App ID

**Solution:**
- Add Instagram Basic Display product to your app
- Complete the setup wizard
- Then you'll see Instagram App ID and Secret

### Issue 3: Wrong OAuth Endpoint
**Symptom:** Error persists after adding product

**Solution:**
- Make sure you're using Instagram Basic Display (not Graph API)
- Endpoint should be: `https://api.instagram.com/oauth/authorize`
- Scopes should be: `user_profile,user_media`

### Issue 4: App Not in Correct Mode
**Symptom:** Works for you but not others

**Solution:**
- If in Development Mode, add test users
- Or switch to Live Mode (may require app review)

## 📋 Checklist

Before testing again, verify:

- [ ] App Type is set (Consumer or Business)
- [ ] Instagram Basic Display product is added
- [ ] Instagram App ID is visible (different from Facebook App ID)
- [ ] Instagram App Secret is visible
- [ ] Redirect URI `https://echoflux.ai/api/oauth/instagram/callback` is added
- [ ] App is in Live Mode OR test users are added
- [ ] `INSTAGRAM_CLIENT_ID` in Vercel matches Instagram App ID
- [ ] `INSTAGRAM_CLIENT_SECRET` in Vercel matches Instagram App Secret

## 🎯 Quick Verification

1. **Check your Vercel environment variables:**
   - `INSTAGRAM_CLIENT_ID` should match Instagram App ID (NOT Facebook App ID)
   - `INSTAGRAM_CLIENT_SECRET` should match Instagram App Secret

2. **Check Meta Developer Console:**
   - Products → Instagram → Basic Display should exist
   - Should show Instagram App ID and Secret
   - Redirect URI should be configured

3. **Test again:**
   - Try connecting Instagram again
   - Should work after proper configuration

## 🔗 Important URLs

- **Meta Developer Console:** https://developers.facebook.com/
- **Instagram Basic Display Docs:** https://developers.facebook.com/docs/instagram-basic-display-api
- **OAuth Redirect URI:** `https://echoflux.ai/api/oauth/instagram/callback`





