# Meta (Facebook & Instagram) OAuth Setup Guide for EngageSuite.ai

This guide will walk you through setting up Facebook and Instagram OAuth connections in the Meta Developer Portal for testing with EngageSuite.ai.

---

## Prerequisites

- Access to [Meta for Developers](https://developers.facebook.com/)
- A Facebook account
- Your EngageSuite.ai app domain (for production) or `localhost:3000` (for local testing)

---

## Part 1: Setting Up Instagram Basic Display API

EngageSuite.ai currently supports Instagram Basic Display API for connecting Instagram accounts.

### Step 1: Create or Select a Meta App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Click **"My Apps"** in the top right
3. Click **"Create App"** (or select an existing app)

   **⚠️ If you see a popup asking about "Meta Horizon Store" or "Link PC VR":**
   - This popup is for VR apps - **close it or click "Cancel"**
   - Look for **"Other"** or **"None of these"** option
   - You need to create a **regular Meta App**, not a VR/Horizon app

4. Choose **"Consumer"** as the app type (or "Business" if Consumer is not available)
   - If you see options like "Meta Horizon Store" or "Link PC VR", look for **"Other"** or **"Consumer"**
   - Avoid selecting "Meta Horizon Store" or "Link PC VR" options

5. Fill in:
   - **App Name**: `EngageSuite.ai` (or your preferred name)
   - **App Contact Email**: Your email
6. Click **"Create App"**

**Alternative Method if you can't find the right app type:**
- Go directly to: https://developers.facebook.com/apps/creation/
- Look for "Consumer" or "Business" app type
- Avoid VR/Horizon related options

### Step 2: Add Instagram Basic Display Product

1. In your app dashboard, find **"Add Products"** or go to **Settings → Basic**
2. Look for **"Instagram Basic Display"** in the products list
3. Click **"Set Up"** or **"Add"** next to Instagram Basic Display
4. Click **"Create New App"** or continue with your existing app

### Step 3: Configure Instagram Basic Display Settings

1. In the left sidebar, click **"Instagram Basic Display"** → **"Basic Display"**
2. You'll see two important values:
   - **Instagram App ID** (this is your `INSTAGRAM_CLIENT_ID`)
   - **Instagram App Secret** (this is your `INSTAGRAM_CLIENT_SECRET` - click "Show" to reveal it)

3. Scroll down to **"Valid OAuth Redirect URIs"**
4. Add these redirect URIs (one per line):

   **For Local Development:**
   ```
   http://localhost:3000/api/oauth/instagram/callback
   ```

   **For Production (replace with your actual domain):**
   ```
   https://your-app.vercel.app/api/oauth/instagram/callback
   https://engagesuite.ai/api/oauth/instagram/callback
   ```

5. Click **"Save Changes"**

### Step 4: Add Instagram Testers (Required for Testing)

1. In the left sidebar, go to **"Instagram Basic Display"** → **"Basic Display"**
2. Scroll to **"User Token Generator"** section
3. Click **"Add or Remove Instagram Testers"**
4. Add your Instagram account as a tester:
   - Enter your Instagram username or user ID
   - Click **"Submit"**
5. **Important**: You (the Instagram account owner) must accept the test invitation:
   - Go to your Instagram app on your phone
   - Go to **Settings → Apps and Websites → Tester Invites**
   - Accept the invitation

### Step 5: Get Your Credentials

1. In **"Instagram Basic Display"** → **"Basic Display"**
2. Copy these values:
   - **Instagram App ID** → This is your `INSTAGRAM_CLIENT_ID`
   - **Instagram App Secret** → Click "Show" and copy this as your `INSTAGRAM_CLIENT_SECRET`

---

## Part 2: Setting Up Facebook Login (Optional - Not Yet Implemented)

⚠️ **Note**: Facebook OAuth is not yet implemented in EngageSuite.ai. The backend routes need to be created. If you want Facebook support, we'll need to implement it first.

However, if you want to prepare for future Facebook integration:

### Step 1: Add Facebook Login Product

1. In your Meta App dashboard, go to **"Add Products"**
2. Find **"Facebook Login"** and click **"Set Up"**

### Step 2: Configure Facebook Login Settings

1. Go to **"Facebook Login"** → **"Settings"** in the left sidebar
2. Add **Valid OAuth Redirect URIs**:

   **For Local Development:**
   ```
   http://localhost:3000/api/oauth/facebook/callback
   ```

   **For Production:**
   ```
   https://your-app.vercel.app/api/oauth/facebook/callback
   https://engagesuite.ai/api/oauth/facebook/callback
   ```

3. Click **"Save Changes"**

### Step 3: Get Facebook Credentials

1. Go to **Settings → Basic** in your app dashboard
2. You'll find:
   - **App ID** → This will be your `FACEBOOK_CLIENT_ID`
   - **App Secret** → Click "Show" to reveal `FACEBOOK_CLIENT_SECRET`

---

## Part 3: Setting Environment Variables

### For Local Development (.env.local)

1. Create or edit `.env.local` in your project root
2. Add these variables:

```env
# Instagram Basic Display API
INSTAGRAM_CLIENT_ID=your_instagram_app_id_here
INSTAGRAM_CLIENT_SECRET=your_instagram_app_secret_here

# Facebook Login (when implemented)
FACEBOOK_CLIENT_ID=your_facebook_app_id_here
FACEBOOK_CLIENT_SECRET=your_facebook_app_secret_here
```

3. Restart your development server: `npm run dev`

### For Vercel Production

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your EngageSuite.ai project
3. Go to **Settings → Environment Variables**
4. Add each variable:
   - **Name**: `INSTAGRAM_CLIENT_ID`
   - **Value**: Your Instagram App ID
   - **Environment**: Select all (Production, Preview, Development)
   - Click **"Save"**
5. Repeat for:
   - `INSTAGRAM_CLIENT_SECRET`
   - `FACEBOOK_CLIENT_ID` (when needed)
   - `FACEBOOK_CLIENT_SECRET` (when needed)
6. **Redeploy** your application after adding variables

---

## Part 4: Testing the Connection

### Test Instagram Connection

1. Start your local development server: `npm run dev`
2. Open `http://localhost:3000`
3. Log in to EngageSuite.ai
4. Go to **Settings → Connections** (or wherever the social account connection UI is)
5. Click **"Connect"** next to Instagram
6. You should be redirected to Instagram's authorization page
7. Authorize the connection
8. You should be redirected back to EngageSuite.ai with a success message
9. Your Instagram account should now show as "Connected"

### Troubleshooting Instagram Connection

**Error: "Invalid redirect_uri"**
- Make sure the redirect URI in Meta Developer Portal exactly matches:
  - For local: `http://localhost:3000/api/oauth/instagram/callback`
  - Check for trailing slashes, http vs https, etc.

**Error: "User not authorized"**
- Make sure you added yourself as an Instagram tester
- Make sure you accepted the tester invitation in your Instagram app

**Error: "OAuth not configured"**
- Check that `INSTAGRAM_CLIENT_ID` and `INSTAGRAM_CLIENT_SECRET` are set in your environment variables
- Restart your dev server after adding environment variables

**500 Error when connecting**
- Check your Vercel function logs for detailed error messages
- Verify Firebase environment variables are also set correctly

---

## Part 5: App Review (For Production)

For production use, you'll need to submit your app for Meta App Review:

1. Go to **App Review** in your Meta App dashboard
2. Request permissions you need:
   - `instagram_basic` - For Instagram Basic Display
   - `pages_read_engagement` - For Facebook Page insights (if implementing Facebook)
3. Provide details about how your app uses these permissions
4. Submit for review

**Note**: For testing, you can use your app in Development Mode with testers. For production, you'll need approval.

---

## Current Status in EngageSuite.ai

✅ **Implemented:**
- Instagram Basic Display API OAuth flow
- OAuth routes: `/api/oauth/instagram/authorize` and `/api/oauth/instagram/callback`
- Token storage in Firestore
- Connection UI in Settings

❌ **Not Yet Implemented:**
- Facebook Login OAuth flow
- Facebook Pages API integration
- Facebook Graph API for stats

---

## Next Steps

1. Complete the Instagram setup using this guide
2. Test the Instagram connection locally
3. Once working, add environment variables to Vercel
4. Test in production
5. (Optional) Request Facebook OAuth implementation if needed

---

## Need Help?

If you encounter issues:
1. Check Vercel function logs for detailed error messages
2. Verify all environment variables are set correctly
3. Ensure redirect URIs match exactly (case-sensitive, no trailing slashes)
4. Make sure you're added as an Instagram tester and have accepted the invitation

---

## Quick Reference: Environment Variables

```env
# Instagram (Required for Instagram connection)
INSTAGRAM_CLIENT_ID=your_app_id_here
INSTAGRAM_CLIENT_SECRET=your_app_secret_here

# Facebook (Future - not yet implemented)
FACEBOOK_CLIENT_ID=your_app_id_here
FACEBOOK_CLIENT_SECRET=your_app_secret_here
```

---

## Redirect URIs Summary

**Instagram:**
- Local: `http://localhost:3000/api/oauth/instagram/callback`
- Production: `https://your-domain.com/api/oauth/instagram/callback`

**Facebook (when implemented):**
- Local: `http://localhost:3000/api/oauth/facebook/callback`
- Production: `https://your-domain.com/api/oauth/facebook/callback`
