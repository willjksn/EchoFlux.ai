# Meta Developer Portal Setup - Instagram Graph API (Current Guide)

**Updated**: December 2024  
**Note**: Instagram Basic Display API is deprecated. Use Instagram Graph API.

---

## You're on the Right Page!

The options you're seeing:
1. Add required messaging permissions
2. Generate access tokens
3. Configure webhooks
4. Set up Instagram Business Login
5. Complete app review

**These are exactly what we need!** Let's complete them step by step.

---

## Step-by-Step Setup

### Step 1: Set Up Instagram Business Login

1. Click **"Set up Instagram Business Login"** or find it in the left sidebar
2. This enables OAuth for Instagram Business/Creator accounts
3. Configure these settings:

   **Valid OAuth Redirect URIs:**
   ```
   http://localhost:3000/api/oauth/facebook/callback
   ```
   
   Also add your production domain:
   ```
   https://your-app.vercel.app/api/oauth/facebook/callback
   ```

4. **Save Changes**

### Step 2: Configure Facebook Login (Required)

Instagram Graph API requires Facebook Login first:

1. Go to **"Add Products"** → **"Facebook Login"** → **"Set Up"**
2. Go to **"Facebook Login"** → **"Settings"**
3. Add **Valid OAuth Redirect URIs**:
   ```
   http://localhost:3000/api/oauth/facebook/callback
   https://your-app.vercel.app/api/oauth/facebook/callback
   ```
4. Under **"Client OAuth Settings"**, make sure:
   - ✅ "Client OAuth Login" is enabled
   - ✅ "Web OAuth Login" is enabled
   - ✅ "Enforce HTTPS" is checked (for production)

### Step 3: Add Required Permissions

1. Go to **"App Review"** → **"Permissions and Features"**
2. Request these permissions:

   **Basic Permissions:**
   - `public_profile` (usually auto-approved)
   - `email` (usually auto-approved)

   **Page Permissions:**
   - `pages_show_list` - To see user's Facebook Pages
   - `pages_read_engagement` - For analytics data

   **Instagram Permissions:**
   - `instagram_basic` - Access Instagram account info
   - `instagram_content_publish` - Post to Instagram (if you want posting)
   - `instagram_manage_comments` - Manage comments (optional)

3. For each permission, fill out:
   - **Use Case**: "To enable users to connect their Instagram Business accounts and manage their content through EngageSuite.ai"
   - **Instructions**: Step-by-step how users will use this

### Step 4: Generate Test Access Tokens (Optional for Testing)

1. Click **"Generate Access Tokens"**
2. Select permissions you need
3. Generate token for testing
4. **Note**: This is just for testing. Real users will go through OAuth.

### Step 5: Configure Webhooks (Optional)

If you want real-time updates:
1. Click **"Configure Webhooks"**
2. Add webhook URL: `https://your-domain.com/api/webhooks/instagram`
3. Subscribe to events you need (comments, mentions, etc.)

**For now, you can skip this** if you don't need real-time updates.

### Step 6: Complete App Review

**For Development/Testing:**
- You can use the app in Development Mode with test users
- No app review needed for testing

**For Production:**
1. Complete all previous steps
2. Submit app for review
3. Meta will review your use cases and permissions
4. Once approved, app works for all users

---

## Important Notes

### Account Requirements:
- ⚠️ **Users need Instagram Business or Creator accounts** (not personal)
- ⚠️ **Instagram account must be connected to a Facebook Page**
- ⚠️ Users convert personal accounts here: Instagram App → Settings → Account → Switch to Professional Account

### OAuth Flow:
1. User clicks "Connect Instagram" in EngageSuite.ai
2. Redirected to Facebook Login
3. User logs in with Facebook
4. User authorizes Facebook permissions (pages, etc.)
5. User authorizes Instagram permissions
6. Redirected back to EngageSuite.ai with access token

### Credentials:
- Use the same **App ID** and **App Secret** for both Facebook and Instagram
- They're in **Settings → Basic**
- Set as: `FACEBOOK_CLIENT_ID` and `FACEBOOK_CLIENT_SECRET`

---

## Quick Checklist

- [ ] Set up Instagram Business Login
- [ ] Set up Facebook Login
- [ ] Add redirect URIs for both
- [ ] Request required permissions
- [ ] Copy App ID and App Secret
- [ ] Add credentials to environment variables
- [ ] (Optional) Configure webhooks
- [ ] Submit for app review (for production)

---

## Next Steps After Portal Setup

1. ✅ You'll have your App ID and App Secret
2. ✅ Add them to `.env.local` and Vercel
3. ✅ Update EngageSuite.ai code to use Graph API
4. ✅ Test with a Business/Creator account

Ready to continue with the setup!
