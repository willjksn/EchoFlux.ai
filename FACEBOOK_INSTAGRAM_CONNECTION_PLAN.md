# Facebook & Instagram Connection - Complete Implementation Plan

## Overview
This guide walks through connecting Facebook and Instagram accounts using Meta's Graph API with Facebook Login. The flow: **User → Facebook Login → Pages → Instagram Professional Account**.

---

## Prerequisites Checklist

- [ ] Meta App created at https://developers.facebook.com/
- [ ] App is in **Development Mode** (for testing)
- [ ] You are added as **Admin/Developer/Tester** in App Roles
- [ ] Facebook Login product added to your app
- [ ] Instagram Graph API product added (if using Graph API)
- [ ] Environment variables ready in Vercel

---

## Step 1: Meta App Configuration

### 1.1 Add Facebook Login Product
1. Go to **Meta App Dashboard** → **Add Products**
2. Find **"Facebook Login"** → Click **"Set Up"**
3. Go to **Facebook Login** → **Settings**

### 1.2 Configure OAuth Redirect URIs
**Production:**
```
https://echoflux.ai/api/oauth/meta/callback
```

**Local Development (optional):**
```
http://localhost:3000/api/oauth/meta/callback
```

**Where to add:**
- Meta App Dashboard → **Facebook Login** → **Settings**
- Scroll to **"Valid OAuth Redirect URIs"**
- Add both URLs (one per line)
- Click **"Save Changes"**

### 1.3 Configure Client OAuth Settings
In **Facebook Login → Settings**, ensure:
- ✅ **Client OAuth Login**: Enabled
- ✅ **Web OAuth Login**: Enabled
- ✅ **Enforce HTTPS**: Enabled (for production)

### 1.4 Add Required Permissions
Go to **App Review** → **Permissions and Features**

**Request these permissions:**

**Basic:**
- `public_profile` (usually auto-approved)
- `email` (usually auto-approved)

**Pages:**
- `pages_show_list` - List user's Facebook Pages
- `pages_read_engagement` - Read Page analytics

**Instagram:**
- `instagram_basic` - Access Instagram account info
- `instagram_content_publish` - Post to Instagram (if needed)
- `instagram_manage_comments` - Manage comments (optional)
- `instagram_manage_insights` - Read analytics (optional)
- `instagram_manage_messages` - Read DMs (optional)

**For each permission, provide:**
- **Use Case**: "To enable users to connect their Instagram Business accounts and manage their content through EchoFlux.ai"
- **Instructions**: Step-by-step how users will use this feature

---

## Step 2: Environment Variables Setup

Add these to **Vercel → Project Settings → Environment Variables** (Production):

```bash
# Meta App Credentials
META_APP_ID=your_facebook_app_id
META_APP_SECRET=your_facebook_app_secret

# Webhook Verification (for webhooks later)
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=your_random_secure_token_here
INSTAGRAM_WEBHOOK_SECRET=your_app_secret_same_as_above
```

**Important:** 
- `META_APP_ID` = Your Facebook App ID (found in App Dashboard → Settings → Basic)
- `META_APP_SECRET` = Your Facebook App Secret (click "Show" to reveal)
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` = Any random secure string (e.g., generate with `openssl rand -hex 32`)

---

## Step 3: Create OAuth Start Endpoint

**File:** `api/oauth/meta/authorize.ts`

```typescript
import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    res.status(500).json({ error: "Meta app credentials not configured" });
    return;
  }

  // Generate CSRF state token
  const state = crypto.randomBytes(32).toString("hex");
  
  // Build OAuth URL
  const redirectUri = encodeURIComponent(
    "https://echoflux.ai/api/oauth/meta/callback"
  );
  
  const scopes = [
    "public_profile",
    "email",
    "pages_show_list",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_content_publish",
    "instagram_manage_comments",
    "instagram_manage_insights",
  ].join(",");

  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?` +
    `client_id=${appId}` +
    `&redirect_uri=${redirectUri}` +
    `&state=${state}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}`;

  // Redirect user to Facebook
  res.redirect(302, authUrl);
}
```

---

## Step 4: Create OAuth Callback Endpoint

**File:** `api/oauth/meta/callback.ts`

```typescript
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb, getVerifyAuth } from "../_errorHandler.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { code, state, error, error_reason } = req.query;

  // Handle errors from Meta
  if (error) {
    console.error("Meta OAuth error:", error, error_reason);
    res.redirect(302, `/?error=oauth_failed&reason=${error_reason}`);
    return;
  }

  if (!code) {
    res.status(400).json({ error: "Missing authorization code" });
    return;
  }

  try {
    // Step 1: Exchange code for User access token
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirectUri = "https://echoflux.ai/api/oauth/meta/callback";

    const tokenResponse = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?` +
        `client_id=${appId}` +
        `&client_secret=${appSecret}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&code=${code}`,
      { method: "GET" }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      res.redirect(302, `/?error=token_exchange_failed`);
      return;
    }

    const tokenData = await tokenResponse.json();
    const userAccessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in || 3600;

    // Step 2: Verify token works - get user info
    const meResponse = await fetch(
      `https://graph.facebook.com/v19.0/me?access_token=${userAccessToken}&fields=id,name,email`
    );

    if (!meResponse.ok) {
      console.error("Failed to verify user token");
      res.redirect(302, `/?error=token_verification_failed`);
      return;
    }

    const userInfo = await meResponse.json();
    const facebookUserId = userInfo.id;

    // Step 3: Exchange for long-lived token (recommended for production)
    const longLivedResponse = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${appId}` +
        `&client_secret=${appSecret}` +
        `&fb_exchange_token=${userAccessToken}`,
      { method: "GET" }
    );

    let longLivedToken = userAccessToken;
    let tokenExpiry = new Date(Date.now() + expiresIn * 1000);

    if (longLivedResponse.ok) {
      const longLivedData = await longLivedResponse.json();
      longLivedToken = longLivedData.access_token;
      tokenExpiry = new Date(
        Date.now() + (longLivedData.expires_in || 5184000) * 1000
      );
    }

    // Step 4: Get user's Pages (required for Instagram)
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?` +
        `fields=id,name,access_token,instagram_business_account` +
        `&access_token=${longLivedToken}`
    );

    if (!pagesResponse.ok) {
      console.error("Failed to fetch Pages");
      res.redirect(302, `/?error=pages_fetch_failed`);
      return;
    }

    const pagesData = await pagesResponse.json();
    const pages = pagesData.data || [];

    // Step 5: Find Pages with Instagram accounts
    const connectedAccounts: Array<{
      pageId: string;
      pageName: string;
      pageToken: string;
      igAccountId: string | null;
      igUsername: string | null;
    }> = [];

    for (const page of pages) {
      if (page.instagram_business_account) {
        const igAccountId = page.instagram_business_account.id;

        // Get Instagram account details
        const igResponse = await fetch(
          `https://graph.facebook.com/v19.0/${igAccountId}?` +
            `fields=id,username,profile_picture_url` +
            `&access_token=${page.access_token}`
        );

        if (igResponse.ok) {
          const igData = await igResponse.json();
          connectedAccounts.push({
            pageId: page.id,
            pageName: page.name,
            pageToken: page.access_token,
            igAccountId: igAccountId,
            igUsername: igData.username || null,
          });
        }
      }
    }

    // Step 6: Authenticate user and save to Firestore
    const verifyAuth = await getVerifyAuth();
    const user = await verifyAuth(req);

    if (!user) {
      res.redirect(302, `/?error=not_authenticated`);
      return;
    }

    const db = await getAdminDb();

    // Save Facebook connection
    await db
      .collection("users")
      .doc(user.uid)
      .set(
        {
          socialAccounts: {
            Facebook: {
              accountId: facebookUserId,
              accessToken: longLivedToken,
              tokenExpiry: tokenExpiry.toISOString(),
              connectedAt: new Date().toISOString(),
            },
            Instagram: connectedAccounts.length > 0
              ? {
                  accountId: connectedAccounts[0].igAccountId,
                  username: connectedAccounts[0].igUsername,
                  pageId: connectedAccounts[0].pageId,
                  pageToken: connectedAccounts[0].pageToken,
                  accessToken: longLivedToken,
                  connectedAt: new Date().toISOString(),
                }
              : null,
          },
        },
        { merge: true }
      );

    // Success - redirect to settings or dashboard
    res.redirect(302, `/?connected=facebook_instagram&accounts=${connectedAccounts.length}`);
  } catch (error: any) {
    console.error("OAuth callback error:", error);
    res.redirect(302, `/?error=connection_failed&message=${encodeURIComponent(error.message)}`);
  }
}
```

---

## Step 5: Test the Connection Flow

### 5.1 Test as Admin/Developer
1. Make sure you're added as **Admin/Developer** in Meta App → Roles
2. Visit: `https://echoflux.ai/api/oauth/meta/authorize`
3. You should be redirected to Facebook Login
4. Approve permissions
5. You'll be redirected back to your callback
6. Check Firestore: `users/{your-uid}/socialAccounts` should have Facebook/Instagram data

### 5.2 Verify Instagram Connection
After connecting, test an Instagram API call:

```typescript
// Example: Get Instagram account info
const igAccountId = user.socialAccounts.Instagram.accountId;
const accessToken = user.socialAccounts.Instagram.accessToken;

const response = await fetch(
  `https://graph.facebook.com/v19.0/${igAccountId}?` +
    `fields=id,username,profile_picture_url,followers_count` +
    `&access_token=${accessToken}`
);
```

---

## Step 6: Webhook Setup (Optional - for real-time updates)

### 6.1 Configure Webhook in Meta
1. Go to **Meta App Dashboard** → **Webhooks**
2. Click **"Add Subscription"**
3. Select **"Instagram"** object
4. **Callback URL**: `https://echoflux.ai/api/webhooks/instagram`
5. **Verify Token**: (same as `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` env var)
6. **Subscription Fields**: Select what you want:
   - `comments` - New comments
   - `messaging` - Direct messages
   - `mentions` - @mentions (if available)

### 6.2 Verify Webhook Endpoint
The existing `api/webhooks/instagram.ts` should handle:
- **GET**: Verification (returns `hub.challenge` if token matches)
- **POST**: Event processing

**Make sure:**
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` is set in Vercel
- The token in Meta matches exactly
- Click **"Verify and Save"** in Meta

---

## Step 7: UI Integration

### 7.1 Add "Connect Facebook/Instagram" Button
In your Settings or Social Accounts component:

```typescript
const handleConnectMeta = () => {
  window.location.href = '/api/oauth/meta/authorize';
};
```

### 7.2 Display Connected Accounts
Show connected Facebook Page and Instagram account in user settings.

---

## Step 8: App Review (To Go Live)

### 8.1 Request Advanced Access
1. Go to **App Review** → **Permissions and Features**
2. For each permission (especially `instagram_*`), click **"Request Advanced Access"**
3. Fill out the form:
   - **Use Case**: Describe how users will use this
   - **Instructions**: Step-by-step demo
   - **Screencast**: Video showing the flow

### 8.2 Prepare Demo Video
Show:
1. User clicks "Connect Facebook/Instagram"
2. Facebook Login consent screen
3. Your app shows connected Page
4. Your app shows connected Instagram account
5. Your app using the connection (posting, reading comments, etc.)

### 8.3 Switch to Live Mode
After approval:
- Go to **App Dashboard** → **App Review** → **App Status**
- Switch from **Development** → **Live**

---

## Troubleshooting

### "Invalid OAuth Redirect URI"
- ✅ Check redirect URI matches **exactly** (including `https://` vs `http://`)
- ✅ No trailing slashes
- ✅ Added in **Facebook Login → Settings**, not Instagram settings

### "Token exchange failed"
- ✅ Verify `META_APP_ID` and `META_APP_SECRET` are correct
- ✅ Check app is in Development mode and you're a tester
- ✅ Verify redirect URI matches exactly

### "No Pages found"
- ✅ User must be a Page admin
- ✅ User must grant `pages_show_list` permission
- ✅ Check Pages are actually linked to user's Facebook account

### "No Instagram account linked"
- ✅ Instagram account must be a **Business** or **Creator** account
- ✅ Instagram account must be linked to a Facebook Page
- ✅ Link them at: https://www.facebook.com/pages/settings

### "Webhook verification failed"
- ✅ `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` must match exactly in Meta
- ✅ Endpoint must handle GET requests
- ✅ Must return `hub.challenge` as plain text (not JSON)

---

## Quick Reference URLs

**OAuth:**
- Start: `https://echoflux.ai/api/oauth/meta/authorize`
- Callback: `https://echoflux.ai/api/oauth/meta/callback`

**Webhooks:**
- Instagram: `https://echoflux.ai/api/webhooks/instagram`

**Meta Dashboard:**
- App Settings: https://developers.facebook.com/apps/{APP_ID}/settings/basic/
- Facebook Login: https://developers.facebook.com/apps/{APP_ID}/fb-login/settings/
- Webhooks: https://developers.facebook.com/apps/{APP_ID}/webhooks/
- App Review: https://developers.facebook.com/apps/{APP_ID}/app-review/

---

## Next Steps After Connection

1. **Test Publishing** (if you have `instagram_content_publish`):
   - Create media container
   - Publish to Instagram

2. **Test Reading**:
   - Get account info
   - Get posts
   - Get comments

3. **Test Webhooks**:
   - Post a comment on your Instagram
   - Verify webhook receives it

4. **Handle Token Refresh**:
   - Long-lived tokens expire in ~60 days
   - Implement refresh logic before expiry
