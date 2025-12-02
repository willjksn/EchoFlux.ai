# Webhook Setup Guide

This guide explains how to set up webhooks for real-time DM and comment notifications.

## Overview

Webhooks provide instant notifications when DMs or comments arrive, eliminating the need for frequent polling. This improves user experience and reduces API costs.

## Supported Platforms

### ✅ Instagram
- **Webhook Type**: Instagram Graph API Webhooks
- **Events**: DMs, Comments
- **Endpoint**: `/api/webhooks/instagram`

### ✅ YouTube
- **Webhook Type**: PubSubHubbub
- **Events**: Comments
- **Endpoint**: `/api/webhooks/youtube`

### ✅ Facebook
- **Webhook Type**: Facebook Graph API Webhooks
- **Events**: Messages, Comments
- **Endpoint**: `/api/webhooks/facebook`

### ⏳ Twitter/X
- **Status**: Polling only (webhooks not available for most apps)
- **Frequency**: Every 5-15 minutes

### ⏳ TikTok
- **Status**: Polling only (no webhook support)
- **Frequency**: Every 10-15 minutes

### ⏳ LinkedIn
- **Status**: Polling only (limited webhook support)
- **Frequency**: Every 15-30 minutes

---

## Setup Instructions

### 1. Instagram Webhook Setup

#### Prerequisites
- Instagram Business or Creator account
- Facebook App with Instagram Basic Display API access
- App Review approval (for production)

#### Steps

1. **Create Facebook App**
   - Go to [Facebook Developers](https://developers.facebook.com/)
   - Create a new app or use existing
   - Add "Instagram Basic Display" product

2. **Configure Webhook**
   - Go to App Dashboard → Webhooks
   - Click "Add Webhook"
   - **Callback URL**: `https://yourdomain.com/api/webhooks/instagram`
   - **Verify Token**: Set in environment variable `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
   - **Subscription Fields**: Select `messages`, `comments`

3. **Set Environment Variables**
   ```bash
   INSTAGRAM_WEBHOOK_VERIFY_TOKEN=your_random_verify_token
   INSTAGRAM_WEBHOOK_SECRET=your_webhook_secret_from_facebook
   ```

4. **Subscribe to Webhook**
   - After verification, subscribe to the webhook
   - Grant necessary permissions

#### Webhook Events

Instagram sends events for:
- **Messages**: New DMs received
- **Comments**: New comments on posts

---

### 2. YouTube Webhook Setup

#### Prerequisites
- YouTube channel
- Google Cloud Project
- YouTube Data API v3 enabled

#### Steps

1. **Enable YouTube Data API**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Enable YouTube Data API v3

2. **Create PubSubHubbub Subscription**
   - Use YouTube's PubSubHubbub endpoint
   - **Callback URL**: `https://yourdomain.com/api/webhooks/youtube`
   - Subscribe to comment feeds for your channel

3. **Set Environment Variables**
   ```bash
   YOUTUBE_WEBHOOK_SECRET=your_webhook_secret
   ```

#### Webhook Events

YouTube sends events for:
- **Comments**: New comments on videos

---

### 3. Facebook Webhook Setup

#### Prerequisites
- Facebook Page
- Facebook App with Messenger API access

#### Steps

1. **Create Facebook App**
   - Go to [Facebook Developers](https://developers.facebook.com/)
   - Create a new app
   - Add "Messenger" product

2. **Configure Webhook**
   - Go to App Dashboard → Webhooks
   - Click "Add Webhook"
   - **Callback URL**: `https://yourdomain.com/api/webhooks/facebook`
   - **Verify Token**: Set in environment variable `FACEBOOK_WEBHOOK_VERIFY_TOKEN`
   - **Subscription Fields**: Select `messages`, `feed`, `comments`

3. **Set Environment Variables**
   ```bash
   FACEBOOK_WEBHOOK_VERIFY_TOKEN=your_random_verify_token
   FACEBOOK_WEBHOOK_SECRET=your_webhook_secret_from_facebook
   ```

4. **Subscribe Page to Webhook**
   - Subscribe your Facebook Page to the webhook
   - Grant necessary permissions

#### Webhook Events

Facebook sends events for:
- **Messages**: New DMs/messages
- **Comments**: New comments on posts
- **Feed**: Mentions and other feed events

---

## Environment Variables Summary

Add these to your Vercel Environment Variables:

```bash
# Cron Job Secret (for scheduled tasks)
CRON_SECRET=your_random_cron_secret

# Instagram Webhook
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=your_verify_token
INSTAGRAM_WEBHOOK_SECRET=your_webhook_secret

# YouTube Webhook
YOUTUBE_WEBHOOK_SECRET=your_webhook_secret

# Facebook Webhook
FACEBOOK_WEBHOOK_VERIFY_TOKEN=your_verify_token
FACEBOOK_WEBHOOK_SECRET=your_webhook_secret
```

---

## Testing Webhooks

### Local Testing

Use a tool like [ngrok](https://ngrok.com/) to expose your local server:

```bash
ngrok http 3000
```

Then use the ngrok URL as your webhook callback URL.

### Verification

1. **Instagram/Facebook**: Send a GET request to your webhook endpoint with verification parameters
2. **YouTube**: Subscribe to PubSubHubbub feed
3. **Test**: Send a test DM/comment and verify it appears in Firestore

---

## Webhook Security

### Signature Verification

All webhooks verify signatures to ensure requests are legitimate:

- **Instagram/Facebook**: Uses `X-Hub-Signature-256` header
- **YouTube**: Uses `X-Hub-Signature` header (SHA1)

### Best Practices

1. **Always verify signatures** - Never trust unverified webhooks
2. **Use HTTPS** - Webhooks must use HTTPS in production
3. **Store secrets securely** - Use environment variables, never commit secrets
4. **Rate limiting** - Implement rate limiting to prevent abuse
5. **Idempotency** - Handle duplicate events gracefully

---

## Troubleshooting

### Webhook Not Receiving Events

1. **Check Verification**: Ensure webhook verification succeeded
2. **Check Subscriptions**: Verify you're subscribed to the right events
3. **Check Logs**: Review Vercel function logs for errors
4. **Check Permissions**: Ensure app has necessary permissions

### Events Not Processing

1. **Check Firestore**: Verify messages are being saved
2. **Check User Mapping**: Ensure `accountId` matches between webhook and user's social account
3. **Check Logs**: Review function logs for processing errors

### Common Errors

- **401 Unauthorized**: Invalid signature or missing secret
- **403 Forbidden**: Verification token mismatch
- **500 Internal Server Error**: Check function logs for details

---

## Fallback to Polling

If webhooks fail or aren't available:

- The system automatically falls back to polling
- Polling runs every 5-10 minutes via Vercel Cron
- See `api/syncSocialData.ts` for polling implementation

---

## Next Steps

1. Set up webhooks for platforms you use
2. Test with a few DMs/comments
3. Monitor Vercel logs for any issues
4. Adjust notification preferences in user settings

