# Instagram Graph API Setup Guide (Post-Basic Display Deprecation)

## ⚠️ Important: Instagram Basic Display Deprecated (Dec 2024)

Instagram Basic Display API was deprecated in December 2024. We now use **Instagram Graph API** via **Facebook Login**.

## ✅ What You Need

1. **Facebook App** (you already have this - App ID: `875668391474933`)
2. **Instagram Business or Creator Account** (not personal account)
3. **Facebook Page** connected to your Instagram account
4. **Facebook Login** product enabled in your Meta app

## 📋 Step-by-Step Setup

### Step 1: Enable Facebook Login Product

1. Go to [Meta Developer Console](https://developers.facebook.com/)
2. Select your app
3. Go to **Products** → Click **"+ Add Product"**
4. Find **"Facebook Login"** → Click **"Set Up"**
5. Complete the setup wizard

### Step 2: Configure Redirect URI in Facebook Login

1. Go to **Products** → **Facebook Login** → **Settings**
2. Scroll to **"Valid OAuth Redirect URIs"**
3. Add: `https://echoflux.ai/api/oauth/instagram/callback`
4. Click **"Save Changes"**

**Important:** This is in **Facebook Login** settings, NOT Instagram Basic Display (which no longer exists).

### Step 3: Add Instagram Graph API Product

1. Go to **Products** → Click **"+ Add Product"**
2. Find **"Instagram"** → **"Instagram Graph API"**
3. Click **"Set Up"**
4. Complete the setup wizard

### Step 4: Configure Your Instagram Account

**Users must have:**
- ✅ Instagram Business or Creator account (not personal)
- ✅ Facebook Page connected to Instagram account
- ✅ Admin access to the Facebook Page

**To convert Instagram account:**
1. Open Instagram app
2. Go to Settings → Account type and tools
3. Switch to Professional Account
4. Choose Business or Creator
5. Connect to a Facebook Page

### Step 5: Update Environment Variables

Use your **Facebook App ID** (same one for Facebook SDK):

**In Vercel:**
- `INSTAGRAM_CLIENT_ID` = Your Facebook App ID (`875668391474933`)
- `INSTAGRAM_CLIENT_SECRET` = Your Facebook App Secret

**Note:** Since we're using Facebook Login, these are the same as your Facebook App credentials.

### Step 6: Required Permissions/Scopes

The app requests these permissions:
- `instagram_basic` - Basic Instagram account access
- `pages_show_list` - List user's Facebook Pages
- `instagram_content_publish` - Publish content to Instagram
- `pages_read_engagement` - Read engagement metrics

## 🔍 Where to Find Redirect URI Setting

**Location:** 
- Meta Developer Console → Your App
- **Products** → **Facebook Login** → **Settings**
- Scroll to **"Valid OAuth Redirect URIs"**

**NOT in:**
- ❌ Instagram Basic Display (deprecated)
- ❌ Instagram Graph API settings
- ❌ Instagram Business Login settings

## 🎯 OAuth Flow (Updated)

1. User clicks "Connect Instagram"
2. Redirects to Facebook Login (`https://www.facebook.com/v19.0/dialog/oauth`)
3. User authorizes Facebook Login
4. Callback receives Facebook access token
5. App fetches user's Facebook Pages
6. App finds Instagram Business Account connected to a Page
7. Stores Instagram access token (Page token)

## 📝 Important Notes

- **App ID:** Use Facebook App ID (`875668391474933`), not a separate Instagram App ID
- **Redirect URI:** Configure in Facebook Login settings
- **Account Type:** Users need Business/Creator accounts (not personal)
- **Facebook Page:** Instagram account must be connected to a Facebook Page

## ✅ Checklist

- [ ] Facebook Login product added
- [ ] Redirect URI added in Facebook Login settings: `https://echoflux.ai/api/oauth/instagram/callback`
- [ ] Instagram Graph API product added
- [ ] `INSTAGRAM_CLIENT_ID` = Facebook App ID (`875668391474933`)
- [ ] `INSTAGRAM_CLIENT_SECRET` = Facebook App Secret
- [ ] App redeployed
- [ ] Test user has Business/Creator Instagram account
- [ ] Test user's Instagram connected to Facebook Page

## 🧪 Testing

1. Go to Settings → Connections
2. Click "Connect" for Instagram
3. Should redirect to Facebook Login
4. Authorize Facebook Login
5. Should redirect back and connect Instagram

## 🔗 Important URLs

- **Facebook Login Settings:** Products → Facebook Login → Settings
- **Redirect URI:** `https://echoflux.ai/api/oauth/instagram/callback`
- **OAuth Endpoint:** `https://www.facebook.com/v19.0/dialog/oauth`





