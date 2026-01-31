# X OAuth 1.0a Setup Guide

## Overview
OAuth 1.0a is required for X (Twitter) media uploads (images and videos). This is separate from OAuth 2.0 which is used for posting tweets.

## Prerequisites
- X Developer Account
- X App created in Developer Portal
- OAuth 2.0 already configured (uses same credentials)

## Step-by-Step Setup

### 1. Enable OAuth 1.0a in X Developer Portal

1. Go to https://developer.x.com
2. Navigate to your **Project** → **App** → **Settings**
3. Scroll to **User authentication settings**
4. Click **Set up** or **Edit**
5. **Enable OAuth 1.0a** (this is separate from OAuth 2.0)
6. Set **App permissions** to **Read and write** (required for media uploads)

### 2. Register Callback URL

In the same **User authentication settings** section:

1. Find **Callback URI / Redirect URL** field (or **Callback URLs** section)
2. Click **Add** or **+** button to add a new callback URL
3. Enter the following URL **exactly** (copy-paste to avoid typos):
   ```
   https://echoflux.ai/api/oauth/x/callback-oauth1
   ```
4. Click **Save** or **Update** to save your changes
5. **Critical Requirements**: 
   - ✅ No trailing slash (must end with `callback-oauth1`, not `callback-oauth1/`)
   - ✅ Must be exact match (case-sensitive)
   - ✅ Must use HTTPS (not HTTP)
   - ✅ You can add up to 10 callback URLs total
   - ✅ Wait 1-2 minutes after saving for changes to propagate

**Visual Guide:**
- Look for a section labeled "Callback URI / Redirect URL" or "Callback URLs"
- You should see a list or input field where you can add URLs
- The URL field might be labeled as "Callback URI", "Redirect URL", or "Callback URL"
- After adding, you should see the URL appear in a list below

### 3. Add BOTH Callback URLs

X uses one allowlist for callback URLs. You need **both** of these in the list:
1. `https://echoflux.ai/api/oauth/x/callback` (OAuth 2.0 - for connecting X)
2. `https://echoflux.ai/api/oauth/x/callback-oauth1` (OAuth 1.0a - for image uploads)

If you only have the OAuth 2.0 one, add the OAuth 1.0a URL too.

### 4. Verify Environment Variables

**Option A (preferred for OAuth 1.0a):** Use API Key and API Secret from X Developer Portal → Keys and tokens:
- `TWITTER_API_KEY` or `X_API_KEY` = API Key (Consumer Key)
- `TWITTER_API_SECRET` or `X_API_SECRET` = API Secret (Consumer Secret)

**Option B:** Fallback to Client ID/Secret (may work if same as API Key for your app):
- `TWITTER_CLIENT_ID` or `X_CLIENT_ID`
- `TWITTER_CLIENT_SECRET` or `X_CLIENT_SECRET`

**If you get "Callback URL not approved"**: Try adding `TWITTER_API_KEY` and `TWITTER_API_SECRET` from the Keys and tokens tab - these are the OAuth 1.0a consumer credentials and may differ from Client ID/Secret.

### 5. Test the Connection

1. Go to Settings → Connections in your app
2. Find your X account (should show as "Connected" for OAuth 2.0)
3. Click **"Connect OAuth 1.0a"** button
4. Authorize the app
5. You should see "✓ Connected - Images and videos can be uploaded"

## Troubleshooting

### Error: "Failed to get request token"
- **Check**: OAuth 1.0a is enabled in X Developer Portal
- **Check**: Callback URL is registered exactly as: `https://echoflux.ai/api/oauth/x/callback-oauth1`
- **Check**: App permissions are set to "Read and write"

### Error: "Invalid callback URL"
- The callback URL must match exactly (case-sensitive, no trailing slash)
- Verify it's added in X Developer Portal → User authentication settings

### Error: "OAuth 1.0a not enabled"
- Go to X Developer Portal → Your App → Settings → User authentication settings
- Enable "OAuth 1.0a" (separate from OAuth 2.0)

### Error: "403 Forbidden"
- OAuth 1.0a must be explicitly enabled (it's not enabled by default)
- App permissions must be "Read and write" for media uploads

## Technical Details

### OAuth 1.0a vs OAuth 2.0

- **OAuth 2.0**: Used for posting tweets (text and media IDs)
- **OAuth 1.0a**: Required for uploading media to X API v1.1 endpoint
- OAuth 1.0a uses API Key/Secret (`TWITTER_API_KEY`, `TWITTER_API_SECRET`); falls back to Client ID/Secret
- User-specific tokens are stored separately in Firestore

### Callback URLs (add BOTH to your app's allowlist)
- **OAuth 2.0**: `https://echoflux.ai/api/oauth/x/callback`
- **OAuth 1.0a**: `https://echoflux.ai/api/oauth/x/callback-oauth1`
- X Developer Portal → App → Settings → App details → Callback URI / Redirect URL
- Add both URLs; they share one allowlist

## References
- [X OAuth 1.0a Documentation](https://docs.x.com/fundamentals/authentication/oauth-1-0a/authorizing-a-request)
- [X Developer Portal](https://developer.x.com)
- [X API Key Guide 2025](https://elfsight.com/blog/how-to-get-x-twitter-api-key-in-2025/)

## Important Notes (2025)

- **OAuth 2.0 is recommended** for new development, but OAuth 1.0a is still required for media uploads
- **Free tier is very limited**: 500 posts/month, 1 request per 24 hours - suitable only for development
- **Basic tier ($200/month)** is the practical minimum for production applications
- **Same credentials**: Client ID/Secret from OAuth 2.0 can be used as Consumer Key/Secret for OAuth 1.0a
