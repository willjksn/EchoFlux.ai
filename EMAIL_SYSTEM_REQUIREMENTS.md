# Email System Requirements - Understanding Document

## Current Issues to Fix

### 1. Email Failed to Send
**Problem:** Emails are failing to send
**Root Cause:** Need to check:
- Is Google SMTP properly configured?
- Are there error logs showing why?
- Is the mailer trying Postmark first (which isn't configured)?

**Solution:**
- Fix mailer priority (should try Google SMTP first if Postmark not configured)
- Add better error logging
- Add Resend support back (as fallback)

### 2. Email History/Logs
**Need:** Track all sent emails with:
- Who sent it
- When it was sent
- To whom
- Subject
- Status (sent/failed)
- Error messages if failed

**Location:** Admin Dashboard → New "Email History" tab or section

### 3. Email Template Upload
**Need:** Allow admins to:
- Upload email templates (text files)
- Save templates for reuse
- Use templates when sending emails

**Location:** Admin Dashboard → Email section

### 4. Scheduled Emails
**Need:** 
- Upload template
- Set send date/time
- Select recipients (all users, filtered, etc.)
- Schedule email to send automatically

**Implementation:**
- Store scheduled emails in Firestore
- Cron job to check and send scheduled emails
- UI to manage scheduled emails

### 5. Creator Email List View
**Current:** Only admins can see email subscribers (Bio Emails tab)
**Need:** Creators should see their own email subscribers

**Where to add:**
- Option A: Bio Page Builder → New "Subscribers" section
- Option B: Settings → New "Email Subscribers" tab
- Option C: Both (Settings for list, Bio Page Builder for quick view)

**Recommendation:** Add to Bio Page Builder since that's where they manage their bio page

### 6. Waitlist Off But Email Functions Work
**Current:** Some email functions might be tied to waitlist being enabled
**Need:** 
- All email functions should work regardless of `VITE_INVITE_ONLY_MODE`
- Waitlist is just for collecting signups
- Email sending should be independent

**Functions that must work:**
- Mass email
- Waitlist approval emails (if waitlist entries exist)
- Scheduled emails
- Template emails
- Bio page subscriber emails

### 7. Invite Codes Always Work
**Current:** Invite codes work via `redeemInviteCode` API
**Need:** 
- Invite codes should work even when waitlist is off
- Should bypass Stripe (already does this)
- Should work on landing page

**Current Flow:**
- User signs up → Can enter invite code in LoginModal
- If invite-only mode: Shows InviteRequiredPage
- Invite code grants plan without Stripe

**Need to add:**
- Landing page invite code input (when waitlist is off)
- Make invite code entry more prominent

### 8. Landing Page Invite Code UI
**Current:** Landing page shows waitlist form when `VITE_INVITE_ONLY_MODE=on`
**Need:** 
- When waitlist is OFF: Show invite code input instead
- Text: "Have an invite code? Try EchoFlux.ai out"
- Allow users to enter invite code before signup
- Store invite code in localStorage
- Use it during signup flow

## Implementation Plan

### Phase 1: Fix Email Sending
1. Fix mailer priority (Google SMTP first)
2. Add better error handling
3. Add Resend as fallback
4. Test email sending

### Phase 2: Email History
1. Create `email_history` collection in Firestore
2. Log all email sends
3. Create Email History UI in Admin Dashboard
4. Show sent/failed status, errors, etc.

### Phase 3: Email Templates & Scheduling
1. Create email templates storage
2. Template upload UI
3. Scheduled emails system
4. Cron job for scheduled sends
5. UI to manage scheduled emails

### Phase 4: Creator Email List
1. Add subscribers view to Bio Page Builder
2. Allow creators to see their own subscribers
3. Export functionality for creators

### Phase 5: Invite Code on Landing Page
1. Update WaitlistInlineForm to show invite code input when waitlist is off
2. Store invite code in localStorage
3. Use during signup flow
4. Update text to "Have an invite code? Try EchoFlux.ai out"

### Phase 6: Ensure Independence
1. Remove waitlist dependencies from email functions
2. Ensure invite codes work regardless of waitlist status
3. Test all flows

## Questions to Confirm

1. **Email History:** Should it show ALL emails (waitlist, mass, scheduled) or separate tabs?
2. **Template Format:** Plain text only, or support HTML too?
3. **Scheduled Emails:** How far in advance can emails be scheduled? Any limits?
4. **Creator Email List:** Should creators be able to send emails to their subscribers, or just view/export?
5. **Invite Code on Landing:** Should it validate the code immediately, or just store it for signup?

## Current State Analysis

### Email Sending
- ✅ Google SMTP configured in Vercel
- ❌ Mailer tries Postmark first (not configured)
- ❌ No Resend fallback
- ❌ Limited error logging

### Email Features
- ✅ Mass email API exists
- ✅ Waitlist email templates exist
- ❌ No email history
- ❌ No template upload
- ❌ No scheduling

### Creator Features
- ✅ Bio page email capture works
- ✅ Subscribers stored in `bio_page_subscribers`
- ❌ Creators can't see their subscribers
- ❌ Only admins can see in Bio Emails tab

### Invite Codes
- ✅ Invite code redemption works
- ✅ Bypasses Stripe
- ✅ Works in LoginModal
- ❌ Not on landing page when waitlist is off
- ✅ Works regardless of invite-only mode (good!)

### Waitlist
- ✅ Waitlist form on landing page (when invite-only mode on)
- ✅ Waitlist management in Admin Dashboard
- ✅ Email sending on approval
- ❌ Email functions might depend on waitlist being enabled

