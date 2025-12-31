# Go-Live Checklist + 10-Minute Post-Deploy Smoke Test

This checklist is designed for **Vercel deployments** of this repo and assumes:
- Firebase Auth + Firestore
- Resend email delivery
- Vercel Cron jobs enabled

---

## Pre-deploy (5 minutes)

### **1) Verify Vercel Environment Variables**

**Required**
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64`
- `RESEND_API_KEY`
- `EMAIL_FROM` (example: `EchoFlux <contact@echoflux.ai>`)

**Strongly recommended**
- `CRON_SECRET` (used for manual smoke-test triggers; cron endpoints also accept Vercel cron markers)
- `VITE_SENTRY_DSN` (production error visibility)
- `APP_BASE_URL` (defaults to `https://echoflux.ai` if unset; used for feedback-email links)

**If using Tavily weekly trends**
- `TAVILY_API_KEY`

---

### **2) Confirm Vercel Cron is enabled**

Cron schedule is configured in `vercel.json` under `"crons"`.

---

### **3) Confirm Resend domain**

In Resend:
- Domain verified (DNS)
- `EMAIL_FROM` uses a verified sender/domain

---

## Deploy (1–2 minutes)

- Push/merge to the branch Vercel uses for Production (usually `main`)
- Trigger Vercel production deployment
- Wait for “Deployment Ready”

---

## 10-minute post-deploy smoke test

### **A) App boots + auth works (1 minute)**
- Open the site (logged out) → landing loads
- Log in as a normal user → dashboard loads

---

### **B) Admin dashboard loads (1–2 minutes)**
- Log in as an Admin
- Go to Admin Dashboard
  - Confirm tabs render: Overview / Users / Tools
  - Tools → Email opens `EmailCenter` and renders sub-tabs (Send/Templates/Schedule/History/Bio Emails)

---

### **C) Email sending (2–3 minutes)**

**Single email**
- Admin → Tools → Email → Send
- Send an email to yourself (no invite code)
- Expected:
  - UI reports success
  - Email arrives

**History shows it**
- Admin → Tools → Email → History
- Filter “other” or “all”
- Expected: entry appears with provider `resend` and `sent`

---

### **D) Waitlist flow + auto-refresh (2 minutes)**
- In an incognito window, join the waitlist using a test email
- In Admin → Tools → Waitlist (Pending tab)
- Expected:
  - New entry appears automatically within ~12 seconds (polling)
  - Confirmation email send attempt appears in Email History as category `waitlist`

---

### **E) Approve + invite + email (2 minutes)**
- Approve a pending waitlist entry
- Expected:
  - Invite email send attempt logs to Email History (category `waitlist`)
  - Entry moves to Approved

---

### **F) Scheduled emails + cron manual trigger (1–2 minutes)**

**Create a scheduled email**
- Admin → Tools → Email → Schedule
- Create a scheduled email with send time **in the past** (e.g. 1 minute ago)

**Trigger cron manually (smoke test)**
- Run (replace `YOUR_DOMAIN` and `CRON_SECRET`):

```bash
curl -sS -H "Authorization: Bearer CRON_SECRET" https://YOUR_DOMAIN/api/cronSendScheduledEmails
```

- Expected:
  - Response `success: true`
  - Scheduled email status becomes `sent`
  - Email arrives
  - History shows entries category `scheduled`

---

### **G) Feedback nudge cron (verification-only)**

This cron is time-gated to **10:00–10:15am ET**, so outside that window it will return `sent: 0`.

```bash
curl -sS -H "Authorization: Bearer CRON_SECRET" https://YOUR_DOMAIN/api/cronFeedbackRequests
```

Expected:
- Outside window: `message: "Outside 10:00–10:15am ET send window"`
- During window: sends eligible nudges

---

## Rollback plan (30 seconds)

If something breaks, you can revert quickly to known-good commits:
- `411489a` (checkpoint before feedback/email expansions)
- then redeploy

---

## Notes on cron hardening

Cron endpoints are hardened to accept only:
- Manual smoke tests via `Authorization: Bearer CRON_SECRET`
- Real Vercel Cron calls via `x-vercel-cron: 1` **and** `User-Agent: vercel-cron/1.0`


