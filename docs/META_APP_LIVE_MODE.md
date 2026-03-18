# Meta App: Allow All Users to Connect (Switch to Live Mode)

## "This app isn't available" / "This app needs at least one supported permission"

If a **non-admin** user sees one of these when connecting Facebook or Instagram:

- **"It looks like this app isn't available"**
- **"This app needs at least one supported permission"**

the app is almost certainly still in **Development** mode. Switch it to **Live** (steps below); no code changes are required.

---

## Why only admins can connect

When your Meta (Facebook) app is in **Development** mode:

- Only **App roles** can use the app: Administrators, Developers, and Testers.
- Any other user who tries to connect gets an error (e.g. "App Not Setup", "Can't Load URL", or a generic OAuth error).

You’ve already passed **App Review** for the permissions you need. The remaining step is to put the app in **Live** mode so every user can connect.

---

## Step-by-step: Switch to Live mode

### 1. Open your app

1. Go to [Meta for Developers](https://developers.facebook.com/).
2. Log in and open your app (the one used for EchoFlux Facebook/Instagram connection).

### 2. Check App Mode

1. In the top bar you’ll see either **"Development"** or **"Live"**.
2. If it says **Development**, continue below. If it already says **Live**, the app is already open to all users; see “If it still fails” at the end.

### 3. Switch to Live

1. Click the **Development** toggle (top of the dashboard).
2. Confirm switching to **Live** when prompted.
3. The toggle should now show **Live**.

After this, any user (not just admins/developers/testers) can go through the Facebook/Instagram connection flow, as long as they have the right type of account (e.g. Instagram Business/Creator linked to a Facebook Page, if required).

### 4. Confirm settings (recommended before or right after going Live)

- **Facebook Login → Settings**
  - **Valid OAuth Redirect URIs** must include exactly:
    - `https://echoflux.ai/api/oauth/meta/callback`
  - No trailing slash; use `https`.
- **App Review → Permissions and Features**
  - Your approved permissions (e.g. `pages_read_user_content`, `pages_manage_posts`, `pages_show_list`, `instagram_manage_comments`, `instagram_content_publish`, `business_management`, `read_insights`, `pages_read_engagement`, `instagram_manage_insights`, `instagram_basic`, `public_profile`, `email`) should show as **Approved** or **Renewed**.
- **Settings → Basic**
  - **App Domains**: include `echoflux.ai` (and your production domain if different).
  - **Privacy Policy URL** and **Terms of Service URL** (if required) should be valid.

### 5. Test with a non-admin user

1. Use an account that is **not** an Admin/Developer/Tester of the app.
2. In your app, start the “Connect Facebook” or “Connect Instagram” flow.
3. Complete the Meta login and consent screen.
4. You should land back on your app with the account connected. If you get an error, see below.

---

## If it still fails after going Live

- **Same error for non-admins**
  - Wait a few minutes and try again (Meta can take a short time to apply Live mode).
  - Clear cache/cookies or try in an incognito window.
  - Confirm the toggle still shows **Live** in the Meta dashboard.

- **Redirect or “Can’t load URL”**
  - Double-check **Valid OAuth Redirect URIs** under Facebook Login → Settings.
  - Ensure your production URL is exactly `https://echoflux.ai/api/oauth/meta/callback` (no typo, no trailing slash).

- **“App not set up” / “This app is in development”**
  - The app is still in Development, or the switch didn’t save. Go back to the dashboard and set the mode to **Live** again.

- **No Instagram / Page list**
  - User must have an Instagram Business or Creator account linked to a Facebook Page. Personal Instagram or unlinked accounts won’t show in the flow.

---

## Summary

| Step | Action |
|------|--------|
| 1 | Meta for Developers → your app |
| 2 | Top bar: if it says **Development**, click it |
| 3 | Switch to **Live** and confirm |
| 4 | Verify redirect URI `https://echoflux.ai/api/oauth/meta/callback` in Facebook Login → Settings |
| 5 | Test with a non-admin account |

Once the app is **Live** and redirect URIs are correct, all users (not just admins) can connect Facebook/Instagram through your app.
