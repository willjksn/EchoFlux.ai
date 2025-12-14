# LinkedIn OAuth Setup Guide

## Overview
LinkedIn OAuth 2.0 integration allows users to connect their LinkedIn accounts for posting content and accessing profile data.

## Prerequisites
- LinkedIn Developer Account
- LinkedIn App created in Developer Portal
- OAuth 2.0 credentials (Client ID and Client Secret)

## Step-by-Step Setup

### 1. Create LinkedIn App

1. Go to **https://www.linkedin.com/developers/apps**
2. Click **Create app**
3. Fill in app details:
   - **App name**: Your app name (e.g., "EchoFlux")
   - **LinkedIn Page**: Select or create a LinkedIn Page for your app
   - **Privacy policy URL**: Your privacy policy URL
   - **App logo**: Upload your app logo
4. Click **Create app**

### 2. Configure OAuth Settings

1. In your LinkedIn app, go to **Auth** tab
2. Under **Application credentials**, note your:
   - **Client ID**
   - **Client Secret**
3. Under **Authorized redirect URLs for your app**, add:
   ```
   https://echoflux.ai/api/oauth/linkedin/callback
   ```
   **Important**: 
   - No trailing slash
   - Must be exact match
   - Must use HTTPS
   - You can add multiple URLs (for development and production)

### 3. Request Product Access

1. Go to **Products** tab in your LinkedIn app
2. Request access to:
   - **Sign In with LinkedIn using OpenID Connect** (for basic profile)
   - **Share on LinkedIn** (for posting content)
   - **Marketing Developer Platform** (optional, for advanced features)

3. Wait for approval (usually instant for basic products, may take time for Marketing API)

### 4. Set Environment Variables

In Vercel, add these environment variables:
- `LINKEDIN_CLIENT_ID` - Your LinkedIn app Client ID
- `LINKEDIN_CLIENT_SECRET` - Your LinkedIn app Client Secret

### 5. Configure OAuth Scopes

The app requests these scopes:
- `openid` - Basic profile information
- `profile` - Full profile information
- `email` - Email address
- `w_member_social` - Post content on behalf of member

These are automatically included in the authorization request.

### 6. Test the Connection

1. Go to Settings → Connections in your app
2. Find LinkedIn account
3. Click **Connect**
4. You'll be redirected to LinkedIn to authorize
5. After authorization, you'll be redirected back
6. You should see "✓ Connected" for LinkedIn

## Troubleshooting

### Error: "LinkedIn OAuth not configured"
- **Check**: `LINKEDIN_CLIENT_ID` is set in Vercel environment variables
- **Check**: `LINKEDIN_CLIENT_SECRET` is set in Vercel environment variables

### Error: "Invalid redirect URI"
- **Check**: Callback URL is registered exactly as: `https://echoflux.ai/api/oauth/linkedin/callback`
- **Check**: No trailing slash
- **Check**: Using HTTPS (not HTTP)

### Error: "Token exchange failed"
- **Check**: Client ID and Secret are correct
- **Check**: Redirect URI matches exactly (case-sensitive)
- **Check**: App has required product access approved

### Error: "Insufficient permissions"
- **Check**: Required products are approved in LinkedIn Developer Portal
- **Check**: User granted all requested permissions during authorization

## Technical Details

### OAuth Flow

1. **Authorization**: User clicks "Connect" → Redirected to LinkedIn
2. **User Consent**: User authorizes the app on LinkedIn
3. **Callback**: LinkedIn redirects to `/api/oauth/linkedin/callback` with authorization code
4. **Token Exchange**: Backend exchanges code for access token
5. **Profile Fetch**: Backend fetches user profile information
6. **Storage**: Tokens and profile stored in Firestore

### API Endpoints

- **Authorization**: `/api/oauth/linkedin/authorize` (POST)
- **Callback**: `/api/oauth/linkedin/callback` (GET)

### Token Storage

Tokens are stored in Firestore under:
```
users/{userId}/socialAccounts/LinkedIn
```

Fields stored:
- `accessToken` - OAuth access token
- `refreshToken` - Refresh token (if provided)
- `expiresAt` - Token expiration timestamp
- `accountId` - LinkedIn user ID
- `accountUsername` - LinkedIn username/email
- `accountName` - User's display name
- `connected` - Connection status
- `connectedAt` - Connection timestamp

## LinkedIn API Scopes

### Required Scopes
- `openid` - OpenID Connect authentication
- `profile` - Basic profile information
- `email` - Email address
- `w_member_social` - Post content on behalf of member

### Optional Scopes (for future features)
- `r_organization_social` - Post on behalf of organization
- `w_organization_social` - Write organization posts
- `r_messages` - Read messages (requires Marketing API)

## Rate Limits

LinkedIn API has rate limits:
- **Profile API**: 500 requests/day per app
- **Share API**: 500 requests/day per app
- **Marketing API**: Varies by product tier

## References

- [LinkedIn OAuth 2.0 Documentation](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication)
- [LinkedIn Developer Portal](https://www.linkedin.com/developers)
- [LinkedIn API Documentation](https://learn.microsoft.com/en-us/linkedin/)

## Next Steps

After connecting LinkedIn:
1. Test posting content to LinkedIn
2. Verify profile information is fetched correctly
3. Set up content scheduling for LinkedIn
4. Configure LinkedIn-specific posting preferences
