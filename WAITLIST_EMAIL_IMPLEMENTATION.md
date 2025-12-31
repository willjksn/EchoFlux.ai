# Waitlist Email Templates Implementation

All waitlist email messages now use plain text templates (no Google/rich formatting). Here's how they work and how to send them.

## Email Templates

All templates are defined in `api/_waitlistEmailTemplates.ts`:

1. **Confirmation Message** - Sent automatically when someone joins the waitlist
2. **"You've Been Selected" Message** - Sent when approving a waitlist entry
3. **First-Login Onboarding Message** - Available for admins to send manually
4. **Feedback Request Message** - Available for admins to send manually or in bulk

## How Messages Are Sent

### 1. Waitlist Confirmation (Automatic)
**When:** Automatically sent when a user joins the waitlist via `api/joinWaitlist.ts`
**Template:** `WAITLIST_EMAIL_TEMPLATES.confirmation(name)`
**Subject:** "You're on the EchoFlux.ai waitlist"

### 2. Selection/Approval Message (Automatic)
**When:** Automatically sent when an admin approves a waitlist entry via `api/adminApproveWaitlist.ts`
**Template:** `WAITLIST_EMAIL_TEMPLATES.selected(inviteCode, grantPlan, expiresAt, name)`
**Subject:** "You've Been Selected for Early Testing — EchoFlux.ai"
**Includes:** Invite code, plan details, expiration date, and setup instructions

### 3. First-Login Onboarding Message (Manual)
**When:** Admins can send this manually from the Waitlist Manager
**Template:** `WAITLIST_EMAIL_TEMPLATES.firstLoginOnboarding(name)`
**Subject:** "Welcome to EchoFlux.ai — Early Testing Access"
**How to send:**
- Go to Admin Dashboard → Waitlist
- View "approved" status entries
- Click "Onboarding Email" button next to any approved user
- Or use API: `POST /api/sendOnboardingEmail` with `{ email, name }`

**Note:** This is marked as "In-App" in your templates, but we've made it available as an email option. You can also show this message in the app UI when users first log in.

### 4. Feedback Request Message (Manual)
**When:** Admins can send this manually or in bulk
**Template:** `WAITLIST_EMAIL_TEMPLATES.feedbackRequest(name)`
**Subject:** "Your EchoFlux Feedback is Valuable"
**How to send:**
- **Single user:** Go to Waitlist Manager → Approved tab → Click "Feedback Request" button
- **Bulk:** Select multiple approved users → Click "Send Feedback Request" button at the top
- **API:** `POST /api/sendFeedbackRequest` with `{ email }` or `{ emails: [...] }`

## Admin Dashboard Features

In the Waitlist Manager (`components/WaitlistManager.tsx`):

### For Approved Users:
- **Onboarding Email** button - Sends first-login onboarding message
- **Feedback Request** button - Sends feedback request message
- **Delete** button - Removes entry

### Bulk Actions (when viewing approved users):
- **Send Feedback Request** - Sends feedback request to all selected users
- **Delete selected** - Removes selected entries

## API Endpoints

### `POST /api/sendOnboardingEmail`
Send first-login onboarding email to a user.

**Request:**
```json
{
  "email": "user@example.com",
  "name": "Optional Name"
}
```

**Response:**
```json
{
  "success": true,
  "emailSent": true,
  "emailProvider": "postmark" | "smtp",
  "emailError": null
}
```

### `POST /api/sendFeedbackRequest`
Send feedback request to one or multiple users.

**Request (single):**
```json
{
  "email": "user@example.com",
  "name": "Optional Name"
}
```

**Request (bulk):**
```json
{
  "emails": ["user1@example.com", "user2@example.com"]
}
```

**Response:**
```json
{
  "success": true,
  "total": 2,
  "sent": 2,
  "failed": 0,
  "results": [
    { "email": "user1@example.com", "sent": true },
    { "email": "user2@example.com", "sent": true }
  ]
}
```

## Email Configuration

Emails are sent using the existing mailer system (`api/_mailer.ts`):
- **Preferred:** Postmark (if `POSTMARK_SERVER_TOKEN` is set)
- **Fallback:** SMTP via nodemailer (if `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` are set)

All emails are sent as **plain text** (no HTML formatting).

## What's Missing / Recommendations

### 1. In-App First-Login Message
The first-login onboarding message is currently only available as an email. To show it in-app:
- Add a modal/banner that displays when `hasCompletedOnboarding === true` and user hasn't seen it yet
- Or show it in the Dashboard component for new users

### 2. Automatic Onboarding Email
Currently, onboarding emails must be sent manually. To automate:
- Add logic in `CreatorOnboardingModal` or `BusinessOnboardingModal` when `onComplete()` is called
- Call `/api/sendOnboardingEmail` after user completes onboarding

### 3. Scheduled Feedback Requests
To automatically send feedback requests after users have been active for X days:
- Create a cron job (e.g., `api/cronFeedbackRequests.ts`)
- Check for approved users who haven't received feedback request yet
- Send after a set period (e.g., 7 days after approval)

### 4. Email Tracking
Currently tracks:
- `lastEmailedAt` - Last time any email was sent
- `emailStatus` - "sent" or "failed"
- `onboardingEmailSent` / `onboardingEmailSentAt` - For onboarding emails
- `feedbackRequestSent` / `feedbackRequestSentAt` - For feedback requests

You can add UI indicators in Waitlist Manager to show which emails have been sent.

## Testing

1. **Test Confirmation Email:**
   - Join waitlist via landing page
   - Check email inbox for confirmation

2. **Test Approval Email:**
   - Go to Admin Dashboard → Waitlist
   - Approve a pending entry
   - Check email inbox for selection message

3. **Test Onboarding Email:**
   - Go to Waitlist Manager → Approved tab
   - Click "Onboarding Email" on any approved user
   - Check email inbox

4. **Test Feedback Request:**
   - Select one or more approved users
   - Click "Send Feedback Request"
   - Check email inboxes

## Template Customization

All templates are in `api/_waitlistEmailTemplates.ts`. You can modify:
- Greeting format
- Content structure
- Bullet points
- Sign-off

All templates support optional `name` parameter for personalization.

