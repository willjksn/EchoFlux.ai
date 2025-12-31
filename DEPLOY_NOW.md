# Quick Deployment Guide

## ✅ What's Ready

1. **Cron Job Added** - `vercel.json` now includes `/api/cronFeedbackRequests` running daily at 10 AM UTC
2. **Resend Support** - Mailer updated to use Resend as primary provider
3. **All Email Features** - Mass email, onboarding emails, feedback requests all ready

## 🚀 Deploy to Vercel Production

### Step 1: Set Up Email Provider

### Option A: Use Google SMTP (Recommended - You're Already Using This)

1. **Set Up Google App Password:**
   - Go to https://myaccount.google.com/apppasswords
   - Generate app password for "Mail"
   - Copy the 16-character password

2. **Add to Vercel:**
   - Go to https://vercel.com/dashboard
   - Select your project
   - Go to **Settings** → **Environment Variables**
   - Add:
     - **Key:** `SMTP_HOST` → **Value:** `smtp.gmail.com`
     - **Key:** `SMTP_PORT` → **Value:** `465`
     - **Key:** `SMTP_SECURE` → **Value:** `true`
     - **Key:** `SMTP_USER` → **Value:** `your-email@gmail.com`
     - **Key:** `SMTP_PASS` → **Value:** `your-app-password`
     - **Key:** `SMTP_FROM` → **Value:** `EchoFlux <your-email@gmail.com>`
   - **Environments:** Production, Preview, Development

### Option B: Use Resend (Optional - For Higher Volume)

1. **Get Resend API Key:**
   - Go to https://resend.com
   - Sign up/login → **API Keys** → Create new
   - Copy it (starts with `re_`)

2. **Add to Vercel:**
   - **Key:** `RESEND_API_KEY` → **Value:** `re_xxxxxxxxxxxxx`
   - **Key:** `RESEND_FROM` → **Value:** `contact@echoflux.ai`
   - **Environments:** Production, Preview, Development

3. **Verify Domain:**
   - Resend dashboard → **Domains** → Add domain
   - Add DNS records → Wait for verification

### Step 2: Deploy

**Option A: Via Git Push (if connected to GitHub)**
```bash
git add .
git commit -m "Add Resend email provider and feedback requests cron job"
git push origin main
```

**Option B: Via Vercel CLI**
```bash
# Install Vercel CLI if needed
npm i -g vercel

# Login
vercel login

# Deploy to production
vercel --prod
```

**Option C: Via Vercel Dashboard**
1. Go to Vercel Dashboard → Your Project
2. Click **Deployments** tab
3. Click **⋯** → **Redeploy**
4. Click **Redeploy**

### Step 3: Verify

1. **Check Cron Job:**
   - Vercel Dashboard → **Crons** tab
   - Should see `cronFeedbackRequests` listed
   - Schedule: Daily at 10:00 AM UTC

2. **Test Email:**
   - Go to Admin Dashboard → Waitlist
   - Approve a test user
   - Check if email is received

3. **Test Cron Manually:**
   ```bash
   curl "https://your-domain.vercel.app/api/cronFeedbackRequests"
   ```

## 📋 Environment Variables Checklist

**For Google SMTP (Recommended):**
- ✅ `SMTP_HOST` - `smtp.gmail.com`
- ✅ `SMTP_PORT` - `465`
- ✅ `SMTP_SECURE` - `true`
- ✅ `SMTP_USER` - Your Gmail/Workspace email
- ✅ `SMTP_PASS` - Your Google App Password
- ✅ `SMTP_FROM` - `EchoFlux <your-email@gmail.com>`

**For Resend (Optional):**
- ⚠️ `RESEND_API_KEY` - Only if using Resend
- ⚠️ `RESEND_FROM` - Only if using Resend

**Other:**
- ⚠️ `CRON_SECRET` - Optional, for securing cron endpoint

## 🎯 What Happens After Deployment

1. **Cron Job Runs Daily:**
   - Every day at 10:00 AM UTC
   - Sends feedback requests to users approved 7+ days ago
   - Only sends to users who haven't received one yet

2. **Emails Use Resend:**
   - All waitlist emails
   - Mass emails
   - Onboarding emails
   - Feedback requests

3. **Fallback Chain:**
   - Resend (primary) → Postmark → SMTP

## 🔍 Monitor After Deployment

1. **Vercel Dashboard:**
   - Check **Crons** tab for execution logs
   - Check **Functions** tab for errors
   - Check **Deployments** for build status

2. **Resend Dashboard:**
   - Check **Emails** tab for delivery stats
   - Monitor bounces and failures

3. **App Admin Dashboard:**
   - Check Waitlist Manager for email status
   - Test mass email feature

## ⚠️ Important Notes

- **Redeploy Required:** After adding environment variables, you MUST redeploy
- **Domain Verification:** Resend requires domain verification before sending
- **Cron Timing:** First cron run will be at next scheduled time (10 AM UTC)
- **Rate Limits:** Resend has rate limits (check your plan)

## 🆘 Troubleshooting

**Emails not sending?**
- Check Resend API key is correct
- Verify domain is verified in Resend
- Check Vercel function logs for errors

**Cron not running?**
- Verify cron appears in Vercel Crons tab
- Check function doesn't timeout (60s limit)
- Review cron execution logs

**Need help?**
- Check `VERCEL_DEPLOYMENT_SETUP.md` for detailed guide
- Review Resend documentation: https://resend.com/docs
- Check Vercel cron docs: https://vercel.com/docs/cron-jobs

