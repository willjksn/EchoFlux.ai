# Twitter/X OAuth Setup Guide

## Callback URI / Redirect URL

### For Local Development/Testing:
```
http://localhost:3000/api/oauth/x/callback
```

### For Production:
```
https://your-domain.com/api/oauth/x/callback
```

Or if using Vercel:
```
https://your-app.vercel.app/api/oauth/x/callback
```

## Setup Instructions

### 1. Twitter/X Developer Portal Setup

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal)
2. Create a new project or select an existing one
3. Create a new App within your project
4. Navigate to **Settings** > **User authentication settings**
5. Set the following:
   - **Callback URI / Redirect URL**: Add both local and production URLs above
   - **App permissions**: Select "Read and write" or "Read and write and Direct message"
   - **Type of App**: Select "Web App, Automated App or Bot"
   - **App info**: Fill in your app details
6. Save your settings
7. Copy your **Client ID** and **Client Secret**

### 2. Environment Variables

Add these to your `.env` file (or Vercel environment variables):

```env
TWITTER_CLIENT_ID=your_client_id_here
TWITTER_CLIENT_SECRET=your_client_secret_here
```

Alternatively, you can use:
```env
X_CLIENT_ID=your_client_id_here
X_CLIENT_SECRET=your_client_secret_here
```

### 3. OAuth Implementation

The implementation follows the same pattern as Instagram:

- **Authorize endpoint**: `/api/oauth/x/authorize` (POST)
- **Callback endpoint**: `/api/oauth/x/callback` (GET)

### 4. Features

✅ **PKCE Support**: Properly implements PKCE (Proof Key for Code Exchange) for security
✅ **Token Storage**: Stores access token, refresh token, and expiration in Firestore
✅ **User Profile**: Fetches and stores Twitter/X username and profile info
✅ **Error Handling**: Comprehensive error handling with redirects back to app

### 5. Scopes Requested

The OAuth flow requests these scopes:
- `tweet.read` - Read tweets
- `tweet.write` - Create tweets
- `users.read` - Read user profile information
- `offline.access` - Required for refresh tokens

### 6. Usage

The OAuth flow is initiated from the Settings page when a user clicks "Connect" on the X/Twitter account. The existing `connectSocialAccount()` function in `src/services/socialMediaService.ts` handles the frontend flow automatically.

### 7. Testing

1. Make sure environment variables are set
2. Start your development server (`npm run dev`)
3. Go to Settings > Connections
4. Click "Connect" on X/Twitter
5. Authorize the app in the Twitter/X popup
6. You should be redirected back with a success message

### Troubleshooting

**Error: "Invalid redirect URI"**
- Ensure the callback URL in Twitter Developer Portal exactly matches the one in your code
- Check for trailing slashes or protocol mismatches (http vs https)

**Error: "OAuth not configured"**
- Verify environment variables are set correctly
- Restart your server after adding environment variables

**Error: "Token exchange failed"**
- Check that PKCE code verifier is properly stored in state
- Verify client secret is correct

## Files Created

- `api/oauth/x/authorize.ts` - Initiates OAuth flow
- `api/oauth/x/callback.ts` - Handles OAuth callback and token exchange

## Next Steps

After OAuth is working, you can:
1. Implement Twitter/X API calls to fetch stats
2. Add tweet posting functionality
3. Implement message/DM handling (if using those scopes)

