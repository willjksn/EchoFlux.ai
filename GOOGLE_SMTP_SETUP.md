# Using Google SMTP Instead of Resend

## Understanding the Email Provider Chain

Your mailer system has a **fallback chain** that tries providers in this order:

1. **Resend** (if `RESEND_API_KEY` is set) ← Optional
2. **Postmark** (if `POSTMARK_SERVER_TOKEN` is set) ← Optional  
3. **Google SMTP** (if `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` are set) ← **This is what you're using**

## You Don't Need Resend!

Since you're already using Google (Gmail or Google Workspace) to send emails, you can **skip Resend entirely** and just use Google SMTP.

## How to Use Google SMTP

### Option 1: Use Google SMTP Only (Recommended for You)

**Just don't set `RESEND_API_KEY`** - the system will automatically use Google SMTP.

Set these environment variables in Vercel:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@gmail.com (or your Google Workspace email)
SMTP_PASS=your-app-password (see below)
SMTP_FROM=EchoFlux <your-email@gmail.com>
```

### Option 2: Keep Resend as Backup

If you want Resend as a backup (in case Google SMTP fails), set both:
- `RESEND_API_KEY` (for backup)
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (for primary)

The system will try Resend first, then fall back to Google SMTP if Resend fails.

## Setting Up Google SMTP

### For Gmail (Personal)

1. **Enable 2-Factor Authentication** on your Google account
2. **Generate App Password:**
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Name it "EchoFlux"
   - Copy the 16-character password
3. **Use these settings:**
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=xxxx xxxx xxxx xxxx (the app password)
   SMTP_FROM=EchoFlux <your-email@gmail.com>
   ```

### For Google Workspace (Business)

1. **Enable "Less secure app access"** OR use App Passwords
2. **Generate App Password** (same as Gmail above)
3. **Use these settings:**
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=your-email@yourdomain.com
   SMTP_PASS=xxxx xxxx xxxx xxxx (the app password)
   SMTP_FROM=EchoFlux <your-email@yourdomain.com>
   ```

## Resend vs Google SMTP

### Resend (Transactional Email Service)
- ✅ Better deliverability for bulk emails
- ✅ Higher sending limits (100k+ emails/day)
- ✅ Better analytics and tracking
- ✅ Designed for transactional emails
- ❌ Costs money (after free tier)
- ❌ Requires domain verification

### Google SMTP (Your Current Setup)
- ✅ Free (with Gmail/Workspace)
- ✅ Already set up and working
- ✅ No additional service needed
- ✅ Simple configuration
- ❌ Lower sending limits (500/day for Gmail, 2000/day for Workspace)
- ❌ May hit rate limits with bulk emails
- ❌ Less ideal for transactional emails at scale

## Recommendation

**For your use case (waitlist emails, onboarding, feedback requests):**

1. **Use Google SMTP** - You're already set up, it's free, and works fine for your volume
2. **Skip Resend** - You don't need it unless you're sending 1000+ emails/day
3. **Keep Postmark as backup** - If you already have it configured

## Updated Vercel Environment Variables

**For Google SMTP only (no Resend):**

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=EchoFlux <your-email@gmail.com>
```

**Don't set:**
- `RESEND_API_KEY` (leave it unset)

## Testing

After setting up Google SMTP:

1. Go to Admin Dashboard → Waitlist
2. Approve a test user
3. Check if email is received
4. Check Vercel function logs to confirm it's using "smtp" provider

## Important Notes

### Gmail Limits
- **Personal Gmail:** 500 emails/day
- **Google Workspace:** 2,000 emails/day
- If you hit limits, emails will fail

### App Passwords
- **Required** for Gmail/Workspace SMTP
- Regular password won't work with 2FA enabled
- Generate at: https://myaccount.google.com/apppasswords

### Rate Limiting
- Google may throttle if sending too many emails quickly
- The system batches mass emails (10 at a time) to avoid this
- For high volume, consider Resend or Postmark

## Summary

**You can ignore Resend completely** - just use Google SMTP with your existing setup. The mailer will automatically use Google SMTP if `RESEND_API_KEY` is not set.

