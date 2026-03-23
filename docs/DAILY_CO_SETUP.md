# Daily.co Live Video Chat Setup Guide

This guide walks you through setting up Daily.co for the live video chat feature in Echoflux.

## Overview

Daily.co provides WebRTC-based video calling. We use it for:
- **Creator-to-fan live video chats** (1:1 private calls)
- **Time-limited sessions** (5, 10, 15, or 30 minutes based on treat type)
- **Secure, private rooms** with meeting tokens

## Free Tier

Daily.co offers **10,000 free participant-minutes per month**. This means:
- A 10-minute call with 2 participants = 20 participant-minutes
- ~500 ten-minute calls per month on free tier
- Additional usage is billed (see Daily.co pricing)

---

## Step 1: Create a Daily.co Account

1. Go to [https://dashboard.daily.co/signup](https://dashboard.daily.co/signup)
2. Sign up with email or Google
3. Verify your email address
4. You'll be taken to the Daily.co Dashboard

---

## Step 2: Get Your API Key

1. In the Daily.co Dashboard, click **"Developers"** in the left sidebar
2. Click **"API Keys"**
3. You'll see your **API Key** (starts with something like `d4a1...`)
4. Click the **copy** button to copy the full key
5. **Keep this key secret** - don't commit it to git

---

## Step 3: Add API Key to Echoflux

### For Local Development

1. Open `c:\Projects\engagesuite.ai\.env` (or create it from `env.example`)
2. Add your Daily.co API key:

```env
DAILY_API_KEY=your_daily_api_key_here
```

### For Production (Vercel)

1. Go to your Vercel project dashboard
2. Click **"Settings"** → **"Environment Variables"**
3. Add a new variable:
   - **Name**: `DAILY_API_KEY`
   - **Value**: Your Daily.co API key
   - **Environment**: Production (and Preview if desired)
4. Click **"Save"**
5. **Redeploy** your project for the changes to take effect

---

## Step 4: Configure Daily.co Settings (Optional but Recommended)

In the Daily.co Dashboard:

### Domain Settings
1. Go to **"Settings"** → **"Domain"**
2. Note your domain (e.g., `your-domain.daily.co`)
3. Rooms will be created at `https://your-domain.daily.co/room-name`

### Room Defaults (Optional)
1. Go to **"Settings"** → **"Room defaults"**
2. Recommended settings:
   - **Max participants**: 2 (for 1:1 calls)
   - **Enable chat**: On
   - **Enable screen share**: Off (optional)
   - **Enable recording**: Off (unless needed)
   - **Knock to enter**: Off (we use private rooms with tokens)

### Webhooks (Optional - Future Enhancement)
For real-time session tracking:
1. Go to **"Developers"** → **"Webhooks"**
2. Add endpoint: `https://your-domain.com/api/dailyWebhook`
3. Select events: `room.participant.joined`, `room.participant.left`, `room.session.ended`

---

## Step 5: Test the Integration

### Quick Test

1. Start your local dev server:
```bash
npm run dev
```

2. Go to the **Fan Hub** → **Video Chats** tab
3. You should see your video minute quota displayed
4. The "Daily.co configured" status should show as active

### Full Flow Test

1. **As a creator**: Go to Fan Hub → Video Chats → Enable a video chat treat
2. **As a fan**: Purchase the video chat treat
3. **Fan requests**: Click "Start Video Chat" when ready
4. **Creator accepts**: In the Video Chats management panel
5. **Both join**: The video room opens with Daily.co's prebuilt UI

---

## Step 6: Set Up Video Minute Quotas

Video minutes are limited per plan to control costs:

| Plan | Monthly Minutes |
|------|-----------------|
| Pro ($19/mo) | 100 minutes |
| Elite ($39/mo) | 250 minutes |

### Admin: Grant Additional Minutes

1. Go to **Admin Panel** → **Users** → Find user → **Manage**
2. In the "Grant Video Minutes" section, enter the amount
3. Click "Grant Minutes"

### Self-Service: Buy More Minutes

Users can purchase additional minutes in **Settings** → **Billing** → **Video Chat Minutes**:

| Pack | Price |
|------|-------|
| 50 minutes | $14.99 |
| 100 minutes | $24.99 |
| 250 minutes | $49.99 |
| 500 minutes | $89.99 |

---

## How It Works (Technical)

### Room Creation Flow

1. Fan purchases video chat treat → stored in `liveVideoChats` collection
2. Fan clicks "Start Chat" → API creates Daily.co room
3. API generates meeting tokens for both participants
4. Both join via Daily.co's prebuilt iframe UI
5. Session ends → room auto-expires or is deleted

### Usage Tracking

- Each session logs to `video_usage_logs` collection
- Creator quotas tracked in `creator_video_quotas` collection
- Platform stats aggregated in `video_platform_stats`
- Admin dashboard shows total usage and cost estimates

### Files Involved

```
api/
  _dailyco.ts           # Daily.co API helpers
  _videoUsageTracking.ts # Quota and usage tracking
  liveVideoChat.ts      # Main video chat API endpoint
  videoUsageStats.ts    # Stats API for admin dashboard
  purchaseVideoMinutes.ts # Stripe checkout for add-ons

components/
  VideoCallRoom.tsx     # The actual video call UI (Daily.co iframe)
  LiveVideoChatRequest.tsx # Fan's request modal
  LiveVideoChatManager.tsx # Creator's management panel
```

---

## Troubleshooting

### "DAILY_API_KEY not configured"

- Ensure `DAILY_API_KEY` is set in your `.env` file
- Restart your dev server after adding the key
- For Vercel, redeploy after adding the environment variable

### "Daily.co API error: 401"

- Your API key is invalid or expired
- Generate a new key in the Daily.co Dashboard

### "Room not found"

- The room may have expired (rooms expire 15 min after session duration)
- Check the session status in Firestore

### Video not working

- Ensure browser has camera/microphone permissions
- Check if the user is behind a strict firewall
- Daily.co requires WebRTC - some corporate networks block it

---

## Cost Estimation

Daily.co pricing (as of 2024):
- **Free tier**: 10,000 participant-minutes/month
- **Overage**: ~$0.004 per participant-minute

**Example monthly costs** (beyond free tier):
- 1,000 extra 10-min calls (2 participants each) = 20,000 extra minutes = ~$80
- 500 extra 30-min calls = 30,000 extra minutes = ~$120

The quota system (100/250 min per creator) helps control this by:
1. Limiting how much each creator can use
2. Selling add-on packs that cover the cost
3. Allowing admin override for special cases

---

## Security Notes

1. **Never expose your API key** in client-side code
2. **Meeting tokens** are generated server-side with expiration
3. **Private rooms** require tokens to join - no public access
4. **Room names** include session IDs to prevent guessing

---

## Next Steps

Once Daily.co is configured:

1. ✅ Test a video call locally
2. ✅ Deploy to production with the API key
3. ✅ Create video chat treats in the Treats Store
4. ✅ Monitor usage in the Admin Dashboard
5. ✅ Set up Stripe webhook for minute pack purchases (already done)

---

## Support

- **Daily.co Docs**: [https://docs.daily.co](https://docs.daily.co)
- **Daily.co Support**: support@daily.co
- **Echoflux Issues**: Check the codebase or contact the dev team
