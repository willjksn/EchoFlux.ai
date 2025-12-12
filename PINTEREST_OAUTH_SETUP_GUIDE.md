# Pinterest OAuth Setup Guide

## Overview
Pinterest OAuth 2.0 integration allows users to connect their Pinterest accounts for posting pins, managing boards, and accessing profile data.

## Prerequisites
- Pinterest Business Account (required for API access)
- Pinterest Developer Account
- Pinterest App created in Developer Portal
- OAuth 2.0 credentials (Client ID and Client Secret)

## Step-by-Step Setup

### 1. Create a Pinterest Business Account

**Important:** You must have a Pinterest Business account to access the API.

1. Go to **https://business.pinterest.com/**
2. If you don't have a business account, convert your personal account or create a new one
3. Verify your business account (may require verification depending on your account type)

### 2. Create a Pinterest App

1. Go to **https://developers.pinterest.com/apps/**
2. Click **Create app**
3. Fill in app details:
   - **App name**: Your app name (e.g., "EngageSuite.ai")
   - **App description**: Brief description of your app
   - **Website URL**: Your app's website URL
   - **Redirect URI**: `https://echoflux.ai/api/oauth/pinterest/callback`
     - **Important**: Must be exact match, no trailing slash, HTTPS only
4. Click **Create**

### 3. Get OAuth Credentials

1. After creating the app, you'll see your **App ID** (this is your Client ID)
2. Navigate to **Settings** → **App secret** or **Credentials** section
3. Generate or copy your **App secret** (this is your Client Secret)
   - **Important**: You can only view the secret once when first generated
   - Save it immediately!

### 4. Configure Redirect URI

1. In your Pinterest app settings, go to **Settings** or **OAuth** tab
2. Add redirect URI:
   ```
   https://echoflux.ai/api/oauth/pinterest/callback
   ```
   **Important**: 
   - No trailing slash
   - Must be exact match (case-sensitive)
   - Must use HTTPS
   - You can add multiple redirect URIs (for development and production)
   - Format: `https://yourdomain.com/api/oauth/pinterest/callback`

### 5. Request API Access (if required)

1. Go to **Settings** → **API access** in your Pinterest app
2. Some features may require API access approval:
   - **Pins API** - For creating pins (usually auto-approved)
   - **Boards API** - For managing boards (usually auto-approved)
   - **User Account API** - For reading profile (usually auto-approved)
3. Most scopes are available immediately for approved apps

### 6. Set Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

   **Production:**
   ```
   PINTEREST_CLIENT_ID=your_app_id_here
   PINTEREST_CLIENT_SECRET=your_app_secret_here
   ```

   **Development (optional):**
   ```
   PINTEREST_CLIENT_ID=your_dev_app_id_here
   PINTEREST_CLIENT_SECRET=your_dev_app_secret_here
   ```

4. Click **Save**
5. **Redeploy** your application for changes to take effect

### 7. Verify Setup

1. Go to your app's Settings page
2. Find Pinterest in the Connected Accounts section
3. Click **Connect** on Pinterest
4. You should be redirected to Pinterest authorization page
5. Authorize the app
6. You should be redirected back with success message

## Required Scopes

The following scopes are automatically requested:

- `boards:read` - Read board information
- `boards:write` - Create and update boards
- `pins:read` - Read pin information
- `pins:write` - Create and update pins
- `user_accounts:read` - Read user account information

## OAuth Flow

1. **Authorization**: User clicks "Connect" → Redirected to Pinterest
2. **User Authorization**: User approves permissions on Pinterest
3. **Callback**: Pinterest redirects to `/api/oauth/pinterest/callback` with authorization code
4. **Token Exchange**: Backend exchanges code for access token (using Basic Auth)
5. **Profile Fetch**: Backend fetches user profile information
6. **Storage**: Tokens stored in Firestore under `users/{userId}/social_accounts/pinterest`
7. **Success**: User redirected back to app with success message

## Troubleshooting

### Error: "Pinterest OAuth not configured"
- **Solution**: Check that `PINTEREST_CLIENT_ID` and `PINTEREST_CLIENT_SECRET` are set in Vercel environment variables
- Redeploy after adding variables

### Error: "Invalid redirect URI"
- **Solution**: 
  - Verify redirect URI in Pinterest app settings matches exactly: `https://echoflux.ai/api/oauth/pinterest/callback`
  - No trailing slash
  - Must be HTTPS
  - Check case sensitivity

### Error: "Token exchange failed"
- **Common causes**:
  - Redirect URI mismatch between authorization and token exchange
  - Invalid client ID or secret
  - Expired or invalid authorization code
- **Solution**: Check Vercel logs for detailed error message from Pinterest API

### Error: "Access denied" or user cancels
- **Solution**: User must approve all requested permissions
- Try disconnecting and reconnecting

### Business Account Required
- **Error**: API access requires Pinterest Business account
- **Solution**: Convert personal account to business account at business.pinterest.com

## Testing

### Test Connection
1. Go to Settings → Connected Accounts
2. Click "Connect" on Pinterest
3. Complete OAuth flow
4. Verify account appears as connected
5. Verify profile information is displayed

### Test Publishing
1. Go to Compose page
2. Upload an image
3. Select Pinterest platform
4. Click "Publish"
5. If no board selected, board selection modal should appear
6. Select a board
7. Pin should be created successfully

### Test Board Fetching
1. With Pinterest connected, the board selection modal should load your boards
2. If it fails, check:
   - Access token is valid
   - Token hasn't expired
   - App has `boards:read` scope

## API Endpoints

### Authorization
- **Endpoint**: `/api/oauth/pinterest/authorize`
- **Method**: POST
- **Returns**: Authorization URL for redirect

### Callback
- **Endpoint**: `/api/oauth/pinterest/callback`
- **Method**: GET
- **Handles**: OAuth callback, token exchange, profile fetch

### Boards
- **Endpoint**: `/api/platforms/pinterest/boards`
- **Method**: GET
- **Returns**: List of user's Pinterest boards

### Publish
- **Endpoint**: `/api/platforms/pinterest/publish`
- **Method**: POST
- **Creates**: A new pin on Pinterest

## Security Notes

1. **Client Secret**: Never expose in frontend code
2. **Access Tokens**: Stored securely in Firestore
3. **State Parameter**: Used for CSRF protection
4. **Token Expiration**: Tokens are stored with expiration time
5. **Refresh Tokens**: Used to refresh expired access tokens (if provided by Pinterest)

## Pinterest API Documentation

- **OAuth 2.0**: https://developers.pinterest.com/docs/getting-started/authentication/
- **Pins API**: https://developers.pinterest.com/docs/api/v5/#tag/pins
- **Boards API**: https://developers.pinterest.com/docs/api/v5/#tag/boards
- **User Account API**: https://developers.pinterest.com/docs/api/v5/#tag/user_account

## Quick Checklist

- [ ] Pinterest Business account created
- [ ] Pinterest app created in Developer Portal
- [ ] Client ID (App ID) obtained
- [ ] Client Secret (App Secret) obtained and saved
- [ ] Redirect URI added: `https://echoflux.ai/api/oauth/pinterest/callback`
- [ ] Environment variables set in Vercel:
  - [ ] `PINTEREST_CLIENT_ID`
  - [ ] `PINTEREST_CLIENT_SECRET`
- [ ] Application redeployed after adding environment variables
- [ ] Tested connection flow
- [ ] Tested board selection
- [ ] Tested pin publishing

## Support

If you encounter issues:
1. Check Vercel function logs for detailed error messages
2. Verify all environment variables are set correctly
3. Verify redirect URI matches exactly in Pinterest app settings
4. Check Pinterest Developer Portal for API status
5. Ensure your Pinterest account is a Business account
