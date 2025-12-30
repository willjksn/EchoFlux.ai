# Understanding Confirmation - Please Review

## What I Understand

### 1. Email Failed to Send
**Issue:** Emails are failing
**Likely Cause:** Mailer tries Postmark first (not configured), then falls back to SMTP. Need to:
- Fix priority: Try Google SMTP first (since it's configured)
- Add Resend as backup
- Better error logging

### 2. Email History
**Need:** Track all sent emails in Admin Dashboard
- Show: Who sent, when, to whom, subject, status, errors
- Location: New "Email History" tab in Admin Dashboard
- Should track: Waitlist emails, mass emails, scheduled emails, all emails

### 3. Email Template Upload
**Need:** Admin can upload email templates
- Upload text file
- Save as reusable template
- Use when composing emails
- Location: Admin Dashboard → Email section

### 4. Scheduled Emails
**Need:** Schedule emails to send at specific date/time
- Upload template OR compose new
- Set date/time
- Select recipients (all users, filtered)
- System sends automatically via cron
- Location: Admin Dashboard → Scheduled Emails section

### 5. Creator Email List View
**Current:** Only admins see subscribers (Bio Emails tab)
**Need:** Creators see THEIR OWN subscribers
**Where:** 
- Bio Page Builder (recommended - since that's where they manage bio page)
- OR Settings page
- OR both

**Question:** Should creators be able to send emails to their subscribers, or just view/export?

### 6. Waitlist Off But Email Functions Work
**Current:** Email functions might depend on waitlist being enabled
**Need:** 
- All email functions work regardless of `VITE_INVITE_ONLY_MODE`
- Waitlist is just for collecting signups
- Email sending is independent

**Functions that must work when waitlist is OFF:**
- ✅ Mass email (already works)
- ✅ Bio page subscriber emails (already works)
- ✅ Scheduled emails (will work)
- ✅ Template emails (will work)
- ⚠️ Waitlist approval emails (only if waitlist entries exist - this is fine)

### 7. Invite Codes Always Work
**Current:** Invite codes work via `redeemInviteCode` API
**Status:** ✅ Already works regardless of waitlist status
**Need:** 
- Make invite code entry more prominent on landing page
- Show invite code input when waitlist is OFF
- Text: "Have an invite code? Try EchoFlux.ai out"

### 8. Landing Page Invite Code UI
**Current:** 
- When `VITE_INVITE_ONLY_MODE=on`: Shows waitlist form
- When `VITE_INVITE_ONLY_MODE=off`: Shows nothing

**Need:**
- When waitlist is OFF: Show invite code input
- Text: "Have an invite code? Try EchoFlux.ai out"
- User enters code → stores in localStorage → uses during signup
- OR: Validate code immediately and redirect to signup with code pre-filled

**Question:** Should invite code be validated immediately, or just stored for signup?

## Implementation Plan

### Step 1: Fix Email Sending
- Update mailer to try Google SMTP first
- Add Resend as fallback
- Better error handling

### Step 2: Email History System
- Create `email_history` Firestore collection
- Log all email sends (waitlist, mass, scheduled)
- Create Email History UI in Admin Dashboard

### Step 3: Email Templates
- Create `email_templates` Firestore collection
- Template upload UI
- Template selection when composing emails

### Step 4: Scheduled Emails
- Create `scheduled_emails` Firestore collection
- Schedule UI in Admin Dashboard
- Cron job to send scheduled emails
- Manage scheduled emails (edit, cancel, view)

### Step 5: Creator Email List
- Add "Subscribers" section to Bio Page Builder
- Show creator's own subscribers
- Export to CSV
- (Optional) Send email to subscribers

### Step 6: Landing Page Invite Code
- Update `WaitlistInlineForm` component
- When waitlist OFF: Show invite code input
- Store code in localStorage
- Use during signup flow

### Step 7: Ensure Independence
- Remove any waitlist dependencies from email functions
- Test all flows work when waitlist is off

## Questions for You

1. **Email History:** Show all emails in one list, or separate tabs (Waitlist, Mass, Scheduled)?
2. **Template Format:** Plain text only, or support HTML?
3. **Scheduled Emails:** Any limits on how far in advance? Max number of scheduled emails?
4. **Creator Email List:** Should creators be able to send emails to their subscribers, or just view/export?
5. **Invite Code Validation:** Should landing page validate code immediately, or just store it for signup?
6. **Email History Location:** New tab in Admin Dashboard, or section within existing tab?

## Please Confirm

✅ All email functions work when waitlist is off
✅ Invite codes always work (bypass Stripe)
✅ Landing page shows invite code input when waitlist is off
✅ Creators see their email subscribers in Bio Page Builder
✅ Email history tracks all sent emails
✅ Email templates can be uploaded
✅ Emails can be scheduled

**Ready to implement once you confirm!**

