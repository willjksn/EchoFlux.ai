# Instagram API Setup Guide

## Required Environment Variables

Instagram API integration requires two environment variables:

1. **INSTAGRAM_CLIENT_ID** - Your Instagram App Client ID
2. **INSTAGRAM_CLIENT_SECRET** - Your Instagram App Client Secret

## Setting Up Instagram API

### Step 1: Get Your Credentials from Meta Developers

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create or select your app
3. Add "Instagram Basic Display" or "Instagram Graph API" product
4. Get your **App ID** (Client ID) and **App Secret** (Client Secret)

### Step 2: Add Environment Variables to Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

```
INSTAGRAM_CLIENT_ID=your_client_id_here
INSTAGRAM_CLIENT_SECRET=your_client_secret_here
```

### Step 3: Configure Redirect URI

In your Meta App settings, add these redirect URIs:
- `https://yourdomain.com/api/oauth/instagram/callback`
- `http://localhost:3000/api/oauth/instagram/callback` (for local development)

### Step 4: Required Permissions/Scopes

Make sure your app requests these permissions:
- `user_profile` - Basic profile information
- `user_media` - Access to user's media

For Business/Creator accounts (Graph API):
- `instagram_basic`
- `pages_read_engagement` (for insights)
- `instagram_content_publish` (for posting)

### Step 5: Redeploy

After adding environment variables, redeploy your application:
```bash
vercel --prod
```

## Testing the Integration

1. Go to Settings → Connections in your app
2. Click "Connect" for Instagram
3. Authorize the app
4. Your Instagram account should now be connected

## Troubleshooting

### "Instagram OAuth not configured"
- Check that both `INSTAGRAM_CLIENT_ID` and `INSTAGRAM_CLIENT_SECRET` are set in Vercel
- Make sure you've redeployed after adding the variables

### "Invalid redirect URI"
- Ensure your redirect URI matches exactly what's configured in Meta App settings
- Check for trailing slashes or protocol mismatches

### "Token exchange failed"
- Verify your Client Secret is correct
- Check that your app is in "Live" mode or add test users in "Development" mode

## Using Instagram Graph API for Trending Sounds

Once configured, the trending sounds feature will:
1. Use your connected Instagram account's data
2. Fetch Reels and extract hashtags/engagement data
3. Infer trending sounds from popular content
4. Fall back to AI recommendations if Instagram data isn't available













