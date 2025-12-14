# X (Twitter) Integration Setup Guide

Complete step-by-step guide to connect X (Twitter) to your EchoFlux.AI app.

## 📋 Prerequisites

- X Developer Account (free)
- X account (can be personal or business)
- Access to Vercel environment variables

## 🔧 Step 1: Create X Developer Account

1. Go to [X Developer Portal](https://developer.twitter.com/)
2. Sign in with your X account
3. Click **"Sign up"** or **"Apply"** for a developer account
4. Complete the application form:
   - Select **"Making a bot"** or **"Exploring the API"** as your use case
   - Describe your app: "Social media management tool for scheduling and publishing tweets"
   - Accept terms and submit

## 🔑 Step 2: Create an App/Project

1. Once approved, go to [Developer Portal Dashboard](https://developer.twitter.com/en/portal/dashboard)
2. Click **"Create Project"** or **"Create App"**
3. Fill in the details:
   - **App name**: EchoFlux.AI (or your app name)
   - **App environment**: Production
   - **Use case**: Select "Making a bot" or "Exploring the API"
4. Click **"Create"**

## 🔐 Step 3: Configure OAuth Settings

1. In your app settings, go to **"User authentication settings"**
2. Click **"Set up"** or **"Edit"**
3. Configure the following:

   ### App permissions:
   - Select **"Read and write"** (required for posting tweets)
   - Or **"Read and write and Direct message"** (if you need DMs)

   ### Type of App:
   - Select **"Web App, Automated App or Bot"**

   ### App info:
   - **Callback URI / Redirect URL**: 
     ```
     https://echoflux.ai/api/oauth/x/callback
     ```
     **⚠️ IMPORTANT**: 
     - Type this URL manually (don't copy-paste to avoid hidden characters)
     - Must be HTTPS (not HTTP)
     - No trailing slash
     - No spaces before or after
     - Exact match: `https://echoflux.ai/api/oauth/x/callback`
     - If you're using a different domain, replace `echoflux.ai` with your domain
   
   - **Website URL**: 
     ```
     https://echoflux.ai
     ```
     (Your app's homepage - can be any valid URL)

4. Click **"Save"**

## 🔑 Step 4: Get API Keys

1. In your app settings, go to **"Keys and tokens"** tab
2. You'll see:
   - **API Key** (Client ID)
   - **API Key Secret** (Client Secret)
   - **Bearer Token** (not needed for OAuth)

3. **Important**: Copy these values - you'll need them for environment variables

## 🌐 Step 5: Set Environment Variables in Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add the following variables:

   ```
   X_CLIENT_ID=your_api_key_here
   X_CLIENT_SECRET=your_api_key_secret_here
   ```

   Or use the legacy names (both work):
   ```
   TWITTER_CLIENT_ID=your_api_key_here
   TWITTER_CLIENT_SECRET=your_api_key_secret_here
   ```

5. Make sure to set them for **Production** environment
6. Click **"Save"**

## 🚀 Step 6: Deploy to Production

1. Redeploy your app to pick up the new environment variables:
   ```bash
   vercel --prod
   ```

2. Or trigger a redeploy from Vercel Dashboard:
   - Go to **Deployments**
   - Click **"Redeploy"** on the latest deployment

## ✅ Step 7: Connect X Account in App

1. Go to your app: `https://echoflux.ai`
2. Navigate to **Settings** → **Connections**
3. Find **X** in the list
4. Click **"Connect"**
5. You'll be redirected to X to authorize
6. Click **"Authorize app"**
7. You'll be redirected back to your app
8. X should now show as **"Connected"** ✅

## 📝 Step 8: Test Publishing

1. Go to **Compose** page
2. Create a post with:
   - Caption/text
   - Optional: Add an image or video
3. Select **X** as the platform
4. Click **"Publish Now"**
5. Check your X account - the tweet should appear!

## 🎯 What's Implemented

### ✅ OAuth 2.0 with PKCE
- Secure authentication flow
- Token refresh support
- User profile fetching

### ✅ Publishing
- Text-only tweets
- Tweets with images
- Tweets with videos
- Error handling

### ✅ Data Fetching (Ready)
- DMs fetching (requires elevated access)
- Mentions fetching
- User profile lookup

## 📚 API Reference

Based on [X API v2 Authentication Mapping](https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping):

### Required Scopes:
- `tweet.read` - Read tweets
- `tweet.write` - Post tweets
- `users.read` - Read user profiles
- `offline.access` - Refresh tokens

### Endpoints Used:
- **POST /2/tweets** - Publish tweets
- **POST /1.1/media/upload** - Upload media
- **GET /2/users/me** - Get authenticated user

## ⚠️ Important Notes

### Character Limits:
- **Standard tweets**: 280 characters
- **Twitter Blue**: Up to 10,000 characters
- Our implementation supports up to 10,000 characters

### Media Limits:
- **Images**: 
  - Max 5MB for GIFs
  - Max 15MB for other formats
  - Supported: JPG, PNG, GIF, WebP
  
- **Videos**:
  - Max 512MB
  - Max duration: 2 minutes 20 seconds
  - Supported: MP4, MOV

### Rate Limits:
- **Post Tweet**: 300 requests per 15 minutes (per user)
- **Upload Media**: 75 requests per 15 minutes (per user)

### Scheduling:
- **X API doesn't support native scheduling**
- Scheduled posts are stored in Firestore and published via cron job
- You'll need to implement a cron job to publish scheduled tweets

## 🐛 Troubleshooting

### "OAuth not configured" error
- Check environment variables are set correctly in Vercel
- Ensure variables are set for **Production** environment
- Redeploy after adding environment variables

### "Failed to publish to X" error
- Check X account is connected (Settings → Connections)
- Verify OAuth scopes include `tweet.write`
- Check tweet text length (max 10,000 characters)
- Verify media file size and format

### "Invalid callback url" or "Invalid redirect URI" error
- **Type the URL manually** - don't copy-paste (copy-paste can include hidden characters)
- Ensure callback URI in X Developer Portal matches exactly:
  ```
  https://echoflux.ai/api/oauth/x/callback
  ```
- **Check for common issues**:
  - ✅ No trailing slashes (`/api/oauth/x/callback/` ❌)
  - ✅ Must be HTTPS (not HTTP)
  - ✅ No spaces before or after the URL
  - ✅ No special characters or encoding
  - ✅ Use lowercase letters only
  - ✅ Domain must match your production domain exactly
- **Try these steps**:
  1. Clear the callback URI field completely
  2. Type it fresh: `https://echoflux.ai/api/oauth/x/callback`
  3. Make sure there are no spaces
  4. Click "Save"
  5. If it still fails, try without the protocol first, then add it back

### Media upload fails
- Check file size limits
- Verify file format is supported
- Ensure media URL is publicly accessible

## 📖 Additional Resources

- [X API v2 Documentation](https://docs.x.com/api)
- [X Authentication Overview](https://docs.x.com/fundamentals/authentication/overview)
- [X API v2 Authentication Mapping](https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping)
- [X Developer Portal](https://developer.twitter.com/)

## ✅ Checklist

- [ ] Created X Developer Account
- [ ] Created App/Project in Developer Portal
- [ ] Configured OAuth settings (Read & Write permissions)
- [ ] Set callback URI: `https://echoflux.ai/api/oauth/x/callback`
- [ ] Copied API Key and Secret
- [ ] Added environment variables to Vercel
- [ ] Redeployed app
- [ ] Connected X account in app
- [ ] Tested publishing a tweet
- [ ] Verified tweet appears on X

## 🎉 Next Steps

Once X is connected, you can:
1. **Publish tweets** from Compose page
2. **Schedule tweets** (stored in Firestore, published via cron)
3. **Fetch mentions** (if implemented)
4. **Fetch DMs** (requires elevated access)

For scheduled tweets, you'll need to implement a cron job that:
- Queries Firestore for scheduled tweets with `status: 'Scheduled'`
- Checks if `scheduledDate <= now`
- Calls `/api/platforms/x/publish` for each tweet
- Updates post status to `'Published'`

