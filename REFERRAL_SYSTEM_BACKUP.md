# Referral System Auto-Grant Rewards - Backup

This document contains the enhanced referral system code that was added in commit a6bc9e9.
**DO NOT DELETE** - This is needed if reverting to commit 424eed3.

## Files Modified/Added:

### 1. `api/_grantReferralReward.ts` (NEW FILE)
Complete file content - handles auto-granting 2 months free when referral converts to Elite plan.

### 2. `api/stripeWebhook.ts` (MODIFIED)
Added referral reward granting logic in two places:
- `checkout.session.completed` event (lines 138-146)
- `invoice.payment_succeeded` event (lines 245-269)

### 3. `api/createCheckoutSession.ts` (MODIFIED)
Added referralCode to checkout session metadata (lines 260, 268)

### 4. `App.tsx` (MODIFIED)
Added referral code capture from URL parameter `?ref=CODE` (lines 374-382)

### 5. `components/PaymentModal.tsx` (MODIFIED)
Added referralCode to checkout session request (line 344)

---

## Implementation Details:

### How It Works:
1. User visits site with `?ref=REFERRAL_CODE` in URL
2. Referral code is stored in localStorage
3. When user signs up for Elite plan, referral code is passed to Stripe checkout
4. Stripe webhook triggers when payment succeeds
5. `grantReferralRewardOnConversion` function:
   - Finds referrer by referral code
   - Grants 2 months free (extends subscription or grants invite access)
   - Creates notification for referrer
   - Updates referral stats

### Key Features:
- Auto-grants 2 months free for Elite plan conversions
- Works for both active subscribers (extends subscription) and non-subscribers (grants invite access)
- Creates referral record if it doesn't exist
- Prevents duplicate rewards
- Sends notification to referrer

---

## To Restore After Revert:

1. Restore `api/_grantReferralReward.ts` file
2. Add referral code logic to `api/stripeWebhook.ts` (see sections above)
3. Add referral code to `api/createCheckoutSession.ts` metadata
4. Add referral code capture to `App.tsx`
5. Add referral code to `components/PaymentModal.tsx`
