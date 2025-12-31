# Vercel Deployment Setup Guide

## Step 1: Set Up Resend in Vercel

### Get Resend API Key
1. Go to https://resend.com
2. Sign up or log in
3. Navigate to **API Keys** section
4. Click **Create API Key**
5. Name it (e.g., "EchoFlux Production")
6. Copy the API key (starts with `re_`)

### Add Environment Variables in Vercel
1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

**Production Environment:**
- **Key:** `RESEND_API_KEY`
- **Value:** `re_xxxxxxxxxxxxx` (your Resend API key)
- **Environment:** Production, Preview, Development

- **Key:** `RESEND_FROM`
- **Value:** `contact@echoflux.ai` (or your verified domain email)
- **Environment:** Production, Preview, Development

**Optional - Cron Secret (for security):**
- **Key:** `CRON_SECRET`
- **Value:** Generate a random string (e.g., use `openssl rand -hex 32`)
- **Environment:** Production only

### Verify Domain in Resend (Important!)
1. In Resend dashboard, go to **Domains**
2. Add your domain (e.g., `echoflux.ai`)
3. Add the DNS records provided by Resend to your domain registrar
4. Wait for verification (usually takes a few minutes)
5. Once verified, you can use emails like `contact@echoflux.ai`

## Step 2: Verify Cron Configuration

The cron job is already configured in `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cronFeedbackRequests",
      "schedule": "0 10 * * *"
    }
  ]
}
```

This runs **daily at 10:00 AM UTC** to send feedback requests to users who were approved 7+ days ago.

### Cron Schedule Format
- `0 10 * * *` = Daily at 10:00 AM UTC
- `0 0 * * *` = Daily at midnight UTC
- `0 */6 * * *` = Every 6 hours
- `0 9 * * 1` = Every Monday at 9:00 AM UTC

## Step 3: Deploy to Vercel Production

### Option A: Deploy via Vercel CLI (Recommended)

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to production
vercel --prod
```

### Option B: Deploy via Git Push

If your project is connected to GitHub/GitLab:
```bash
# Commit changes
git add .
git commit -m "Add Resend email provider and cron job for feedback requests"

# Push to main branch (triggers production deployment)
git push origin main
```

### Option C: Deploy via Vercel Dashboard

1. Go to your Vercel project dashboard
2. Click **Deployments** tab
3. Find the latest deployment
4. Click **⋯** (three dots) → **Redeploy**
5. Select **Use existing Build Cache** (optional)
6. Click **Redeploy**

## Step 4: Verify Deployment

### Check Environment Variables
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Verify `RESEND_API_KEY` and `RESEND_FROM` are set
3. Make sure they're enabled for **Production** environment

### Test Email Sending
1. Go to your app's Admin Dashboard
2. Navigate to **Waitlist** tab
3. Approve a test user
4. Verify they receive the "You've Been Selected" email

### Test Cron Job (Manual)
You can manually trigger the cron job to test:

```bash
# Get your CRON_SECRET from Vercel environment variables
curl "https://your-domain.vercel.app/api/cronFeedbackRequests?secret=YOUR_CRON_SECRET"
```

Or test without secret (if not set):
```bash
curl "https://your-domain.vercel.app/api/cronFeedbackRequests"
```

Expected response:
```json
{
  "success": true,
  "total": 0,
  "sent": 0,
  "failed": 0,
  "message": "No eligible users for feedback requests"
}
```

### Check Cron Logs
1. Go to Vercel Dashboard → Your Project → **Crons** tab
2. You should see `cronFeedbackRequests` listed
3. Click on it to see execution history and logs

## Step 5: Monitor Email Delivery

### Resend Dashboard
1. Go to https://resend.com/emails
2. View email delivery logs
3. Check for any bounces or failures

### Vercel Function Logs
1. Go to Vercel Dashboard → Your Project → **Functions** tab
2. Click on `api/cronFeedbackRequests`
3. View execution logs and any errors

## Troubleshooting

### Emails Not Sending
1. **Check Resend API Key:**
   - Verify it's set correctly in Vercel
   - Make sure it starts with `re_`
   - Check it's not expired or revoked

2. **Check Domain Verification:**
   - Ensure your domain is verified in Resend
   - Check DNS records are correct
   - Wait for DNS propagation (can take up to 48 hours)

3. **Check Function Logs:**
   - Go to Vercel Dashboard → Functions
   - Look for error messages
   - Check if rate limits are hit

### Cron Not Running
1. **Verify Cron Configuration:**
   - Check `vercel.json` has the cron entry
   - Ensure the path matches: `/api/cronFeedbackRequests`

2. **Check Vercel Cron Status:**
   - Go to Vercel Dashboard → Crons
   - Verify the cron is listed and enabled
   - Check execution history

3. **Check Function Response:**
   - Cron jobs must return a response within 60 seconds
   - Ensure the function doesn't timeout
   - Check for any errors in logs

### Environment Variables Not Working
1. **Redeploy After Adding Variables:**
   - Environment variables require a new deployment
   - Go to Deployments → Redeploy

2. **Check Environment Scope:**
   - Ensure variables are set for **Production** environment
   - Preview/Development environments use different variables

3. **Verify Variable Names:**
   - Case-sensitive: `RESEND_API_KEY` not `resend_api_key`
   - No extra spaces or quotes

## Quick Reference

### Environment Variables Needed
```
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM=contact@echoflux.ai
CRON_SECRET=your-random-secret (optional)
```

### Cron Schedule
- **Path:** `/api/cronFeedbackRequests`
- **Schedule:** `0 10 * * *` (Daily at 10:00 AM UTC)
- **Purpose:** Send feedback requests to users approved 7+ days ago

### Deployment Commands
```bash
# Deploy to production
vercel --prod

# Deploy with specific environment
vercel --prod --env RESEND_API_KEY=re_xxx

# View deployment logs
vercel logs
```

## Next Steps After Deployment

1. ✅ Verify Resend API key is working
2. ✅ Test email sending from Admin Dashboard
3. ✅ Verify cron job appears in Vercel Crons tab
4. ✅ Monitor first cron execution (next day at 10 AM UTC)
5. ✅ Check Resend dashboard for email delivery stats

