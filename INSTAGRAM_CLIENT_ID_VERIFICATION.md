# Instagram Client ID Setup Verification Checklist

## ✅ Code Implementation Status

Your Instagram OAuth code is correctly implemented:
- ✅ `/api/oauth/instagram/authorize.ts` - Reads `INSTAGRAM_CLIENT_ID` and `INSTAGRAM_CLIENT_SECRET`
- ✅ `/api/oauth/instagram/callback.ts` - Uses credentials for token exchange
- ✅ Error handling for missing credentials
- ✅ Long-lived token exchange implemented
- ✅ Redirect URI: `https://echoflux.ai/api/oauth/instagram/callback`

## 🔍 Verification Steps

### Step 1: Check Vercel Environment Variables

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project (`engagesuite-ai`)
3. Navigate to **Settings** → **Environment Variables**
4. Verify these variables exist:

   **Required Variables:**
   - ✅ `INSTAGRAM_CLIENT_ID` - Your Instagram App Client ID
   - ✅ `INSTAGRAM_CLIENT_SECRET` - Your Instagram App Secret

5. **Important:** Make sure they're set for:
   - ✅ Production environment
   - ✅ Preview environment (optional)
   - ✅ Development environment (optional, for local testing)

### Step 2: Get Your Instagram Client ID from Meta

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Select your **Instagram app** (not the Facebook Business Login app)
3. Navigate to **Settings** → **Basic**
4. Find **Instagram App ID** - This is your `INSTAGRAM_CLIENT_ID`
5. Find **Instagram App Secret** - Click "Show" to reveal, this is your `INSTAGRAM_CLIENT_SECRET`

**Note:** This is different from your Facebook App ID (`875668391474933`) used for Facebook Business Login.

### Step 3: Verify Redirect URI in Meta

1. In Meta Developer Console → Your Instagram App
2. Go to **Products** → **Instagram** → **Basic Display** (or **Instagram Graph API**)
3. Check **Valid OAuth Redirect URIs**:
   - ✅ `https://echoflux.ai/api/oauth/instagram/callback`
   - ✅ `http://localhost:3000/api/oauth/instagram/callback` (for local dev)

### Step 4: Verify Required Permissions/Scopes

In your Instagram App settings, ensure these scopes are requested:

**For Basic Display:**
- ✅ `user_profile` - Basic profile information
- ✅ `user_media` - Access to user's media

**For Graph API (Business/Creator accounts):**
- ✅ `instagram_basic`
- ✅ `pages_read_engagement` (for insights)
- ✅ `instagram_content_publish` (for posting)

### Step 5: Test the Integration

1. **Redeploy** (if you just added environment variables):
   ```bash
   vercel --prod
   ```

2. **Test the OAuth flow:**
   - Go to your app: `https://echoflux.ai`
   - Sign in to your account
   - Navigate to **Settings** → **Connections**
   - Click **"Connect"** next to Instagram
   - You should be redirected to Instagram authorization
   - After authorizing, you should be redirected back to your app
   - Instagram should show as "Connected" ✅

### Step 6: Check for Errors

If you encounter errors, check:

**"Instagram OAuth not configured"**
- ✅ Verify `INSTAGRAM_CLIENT_ID` and `INSTAGRAM_CLIENT_SECRET` are set in Vercel
- ✅ Make sure you redeployed after adding variables
- ✅ Check Vercel logs: `vercel logs`

**"Invalid redirect URI"**
- ✅ Verify redirect URI matches exactly: `https://echoflux.ai/api/oauth/instagram/callback`
- ✅ Check for trailing slashes (should NOT have one)
- ✅ Ensure it's added in Meta App settings

**"Token exchange failed"**
- ✅ Verify your Client Secret is correct
- ✅ Check that your app is in "Live" mode or add test users in "Development" mode
- ✅ Verify the Instagram account you're testing with is authorized

## 📋 Quick Checklist

- [ ] `INSTAGRAM_CLIENT_ID` added to Vercel environment variables
- [ ] `INSTAGRAM_CLIENT_SECRET` added to Vercel environment variables
- [ ] Both variables set for Production environment
- [ ] Redirect URI `https://echoflux.ai/api/oauth/instagram/callback` added in Meta
- [ ] App redeployed after adding environment variables
- [ ] Tested Instagram connection flow
- [ ] Instagram account successfully connected

## 🔗 Important URLs

- **OAuth Authorization Endpoint:** `/api/oauth/instagram/authorize`
- **OAuth Callback Endpoint:** `/api/oauth/instagram/callback`
- **Production Redirect URI:** `https://echoflux.ai/api/oauth/instagram/callback`
- **Meta Developer Console:** https://developers.facebook.com/

## 📝 Notes

- **Instagram Client ID** ≠ **Facebook App ID**
  - Instagram Client ID: Used for Instagram OAuth (stored in Vercel env vars)
  - Facebook App ID (`875668391474933`): Used for Facebook SDK (in `index.html`)

- Both are needed for full Meta integration:
  - Facebook App ID: For Facebook SDK and Business Login
  - Instagram Client ID: For Instagram OAuth and API access






