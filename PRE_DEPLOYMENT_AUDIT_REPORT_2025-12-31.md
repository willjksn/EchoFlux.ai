# Pre-Deployment Audit Report (Email + Admin Tools + Cron)
**Generated:** 2025-12-31  
**Scope:** Full app readiness review since last audit (new Email system, Admin Tools consolidation, Invite grants, Cron jobs, in-app feedback modal, Voice Assistant fixes)

---

## ✅ High-level status

**Build status:** ✅ `npm run build` succeeds (verified locally)  
**Overall deployment readiness:** **🟡 Mostly ready** — a few operational items should be confirmed before deploying to production.

---

## ✅ What improved since the Jan audit

### 1) **Rate limiting (previous 🔴 blocker)**
**Status:** ✅ Implemented on the major expensive endpoints and waitlist join.

**Verified:** `checkRateLimit()` is now used in:
- `api/generateCaptions.ts`
- `api/generateImage.ts`
- `api/generateVideo.ts`
- `api/generateText.ts`
- `api/generateContentStrategy.ts`
- `api/analyzeContentGaps.ts`
- `api/joinWaitlist.ts` (IP-based)

**Impact:** Substantially reduces cost/abuse risk before opening to testers.

---

## ✅ Email + Waitlist + Admin Tools (new)

### 2) **Email provider reliability**
**Status:** ✅ Good

**Implementation:** `api/_mailer.ts`
- Provider priority: **Resend → Postmark → SMTP**
- Normalizes `EMAIL_FROM` to avoid Resend “invalid from” when env var includes quotes
- Provides a safe “previewOnly” failure mode (won’t crash app flows)

**Deploy check:**
- Ensure Vercel env vars exist:
  - `RESEND_API_KEY`
  - `EMAIL_FROM` (example: `EchoFlux <contact@echoflux.ai>`)

---

### 3) **Email history, templates, scheduling**
**Status:** ✅ Good (Admin API-backed)

**Notes:**
- Admin UI components load via `/api/*` (not client Firestore reads), consistent with secure `firestore.rules`.
- `api/getEmailHistory.ts` and cron senders include **index-safe fallback** behavior (fetch + filter) to avoid 500s from missing composite indexes.

**Operational caution (scale):**
- `sendMassEmail` and scheduled sends currently query all matching users without pagination. OK for early stage; add pagination/limits before large-scale public launch.

---

### 4) **Waitlist join & confirmation**
**Status:** ✅ Good

**Verified:** `api/joinWaitlist.ts`
- Validates email format
- Rate limits by IP
- Writes waitlist entry
- Attempts confirmation email but does not block waitlist entry if email fails
- Logs to `email_history` via Admin SDK

---

## ✅ In-app feedback modal + 7/14 day nudges (new)

### 5) **In-app feedback form**
**Status:** ✅ Implemented

**Implementation:**
- `components/FeedbackSurveyModal.tsx`
- Wired into `components/Dashboard.tsx`
- Submission endpoint: `api/submitInAppFeedback.ts`
- Snooze endpoint: `api/snoozeFeedbackPrompt.ts`

**Behavior:**
- Prompts are based on `inviteGrantRedeemedAt` for invite-granted testers
- “Remind me in 24h” implemented
- Email links `/?feedback=day7|day14` open the modal after login

---

### 6) **Cron email nudges at 10am ET**
**Status:** ✅ Implemented

**Implementation:**
- `api/cronFeedbackRequests.ts`: hourly cron + in-function gate to only send **10:00–10:15am America/New_York**
- `vercel.json`: `"/api/cronFeedbackRequests"` scheduled hourly

**ET requirement:** ✅ Met for this feature

---

## 🟡 Remaining deployment risks / confirmations

### A) **Sentry / monitoring**
**Status:** 🟡 Verify in Vercel

Sentry is integrated, but deployment requires `VITE_SENTRY_DSN` to actually capture production errors.

**Recommendation:** Add `VITE_SENTRY_DSN` before opening up testing so we have error visibility.

---

### B) **Cron endpoint hardening**
**Status:** 🟡 Acceptable for early testing; tighten before public launch

Cron endpoints use `CRON_SECRET` when set, otherwise accept Vercel’s cron marker header.

**Why it’s “OK-ish” right now:** All cron jobs are designed to be mostly idempotent (markers/locks prevent repeated sends), so spoofed calls are unlikely to cause repeated email spam.

**Recommendation before public launch:**
- Ensure `CRON_SECRET` is set in Vercel
- Consider an additional safeguard:
  - check `User-Agent` includes `vercel-cron/1.0` (per Vercel docs)
  - keep idempotency markers (already present)

---

### C) **Timezone consistency (app-wide)**
**Status:** 🟡 Partial

You requested **all time-related features** should be in **Eastern Time**.

**Current state:**
- ✅ Feedback nudges are ET-gated (America/New_York)
- 🟡 Scheduled email creation UI currently uses **browser local timezone** (`datetime-local`) and stores ISO
- 🟡 UI displays (email history, etc.) render timestamps in the viewer’s local timezone via `toLocaleString()`

**Recommendation:**
- For “tester deployment”: acceptable if you (admin) are in ET and primary ops are ET.
- For “public launch”: standardize date/time input + display to America/New_York explicitly across admin tools.

---

### D) **Input validation (general security hygiene)**
**Status:** 🟡 Partially implemented

Waitlist/email endpoints validate emails. Many other endpoints still rely on “best effort” typing rather than explicit sanitization/validation of user text/URLs.

**Recommendation before public launch:** integrate validation utilities broadly on endpoints receiving arbitrary user input.

---

### E) **Bundle size warning**
**Status:** 🟡 Still present (performance)

Vite build still warns about large chunks. Not a blocker for a small tester cohort, but should be addressed before broad public rollout.

---

## ✅ Deployment checklist (updated)

### Required in Vercel (confirm)
- [ ] `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64`
- [ ] `RESEND_API_KEY`
- [ ] `EMAIL_FROM`
- [ ] `VITE_FIREBASE_*` client config

### Strongly recommended
- [ ] `VITE_SENTRY_DSN`
- [ ] `CRON_SECRET` (cron hardening)
- [ ] `APP_BASE_URL` (if deploying to non-`echoflux.ai` domain)

### Verify after deploy
- [ ] Join waitlist → confirmation email logs in Email History
- [ ] Approve waitlist → invite email logs in Email History
- [ ] Email Center: send single + mass + templates + scheduled + history load correctly
- [ ] Cron:
  - scheduled email sender works (if you create a scheduled email due now)
  - feedback nudge only sends during 10:00–10:15am ET window

---

## 🚦 Recommendation

**Go for a tester deployment** once:
- Sentry DSN is set (recommended), and
- Resend env vars are confirmed.

**For full public deployment**, plan follow-up work on:
- ET standardization for scheduling + displays
- stronger cron hardening strategy
- broader input validation coverage


