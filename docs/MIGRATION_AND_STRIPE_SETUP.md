# EchoFlux.ai Migration & Stripe Connect Setup Guide

## Part 1: Domain Migration (stormijxo.com → echoflux.ai)

### Step 1: DNS Configuration

**At your domain registrar (where echoflux.ai is registered):**

1. Log into your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.)
2. Navigate to DNS settings for `echoflux.ai`
3. Add the following records:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | 76.76.21.21 | 3600 |
| CNAME | www | cname.vercel-dns.com | 3600 |

**Alternative (if using Cloudflare or similar):**
- CNAME for root: `@` → `cname.vercel-dns.com` (requires CNAME flattening)

### Step 2: Vercel Domain Configuration

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project (engagesuite-ai)
3. Navigate to **Settings** → **Domains**
4. Click **Add Domain**
5. Enter `echoflux.ai` and click Add
6. Enter `www.echoflux.ai` and click Add
7. Vercel will automatically:
   - Verify DNS configuration
   - Provision SSL certificates (Let's Encrypt)
   - Set up automatic HTTPS redirects

### Step 3: Update Environment Variables

**In Vercel Dashboard → Settings → Environment Variables:**

Update any variables that reference the old domain:

```env
# Update these if they exist:
NEXT_PUBLIC_APP_URL=https://echoflux.ai
NEXT_PUBLIC_SITE_URL=https://echoflux.ai
```

### Step 4: Firebase Configuration

**Firebase Console → Authentication → Settings → Authorized domains:**

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project (engageai-8f76f)
3. Navigate to **Authentication** → **Settings** → **Authorized domains**
4. Click **Add domain**
5. Add:
   - `echoflux.ai`
   - `www.echoflux.ai`

**Firebase Hosting (if used):**
- Add custom domain in Firebase Hosting settings

### Step 5: OAuth Provider Updates

**For each OAuth provider (Google, etc.):**

1. Go to provider's developer console
2. Update authorized redirect URIs:
   - Add: `https://echoflux.ai/__/auth/handler`
   - Add: `https://echoflux.ai/api/auth/callback/*`
3. Update authorized JavaScript origins:
   - Add: `https://echoflux.ai`

### Step 6: Update Stripe Webhook URL

After Stripe Connect is set up (see Part 2):
- Update webhook endpoint from old domain to `https://echoflux.ai/api/stripeWebhook`

### Step 7: Test & Verify

1. Wait for DNS propagation (5 min - 48 hours, usually ~30 min)
2. Test: `https://echoflux.ai` loads correctly
3. Test: Login/signup works
4. Test: All API routes function
5. Test: Stripe webhooks (if configured)

### Step 8: Redirect Old Domain (Optional)

If keeping stormijxo.com, set up 301 redirects:
- Configure in Vercel or at domain registrar level
- Redirect all traffic from stormijxo.com → echoflux.ai

---

## Part 2: Stripe Connect Setup for Creators

### Overview

Stripe Connect allows creators to receive payments directly. The flow is:
1. Creator connects their Stripe account
2. Fans purchase content/tips
3. Payment goes to your platform's Stripe account
4. Stripe automatically transfers creator's share (minus platform fee)

### Step 1: Enable Stripe Connect

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Connect** → **Get started**
3. Choose **Express** accounts (recommended):
   - Stripe handles onboarding, KYC, identity verification
   - Easiest for creators
   - You don't need to collect sensitive banking info
4. Complete Stripe's platform profile:
   - Business name: EchoFlux
   - Platform type: Marketplace
   - Description: Content creator platform

### Step 2: Configure Connect Settings

**In Stripe Dashboard → Connect → Settings:**

1. **Branding:**
   - Upload your logo
   - Set brand color
   - Set business name shown to creators

2. **Payout Settings:**
   - Payout schedule: Daily (recommended) or Weekly
   - Minimum payout: $1 or platform choice

3. **Account Types:**
   - Enable: Express accounts
   - Countries: Select countries you want to support

4. **Capabilities:**
   - Enable: Card payments
   - Enable: Transfers
   - Enable: Instant payouts (optional, for premium creators)

### Step 3: Set Environment Variables

**In Vercel Dashboard → Settings → Environment Variables:**

```env
# Stripe API Keys (get from Stripe Dashboard → Developers → API keys)
STRIPE_SECRET_KEY_LIVE=<your-live-secret-key>
STRIPE_SECRET_KEY_TEST=<your-test-secret-key>

# Which mode to use
STRIPE_USE_TEST_MODE=false

# Platform fee percentage (your cut)
STRIPE_PLATFORM_FEE_PERCENT=15

# Webhook signing secret (get from Step 4)
STRIPE_WEBHOOK_SECRET=<your-webhook-signing-secret>

# Stripe publishable key (for frontend)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<your-publishable-key>
```

### Step 4: Create Webhook Endpoint

**In Stripe Dashboard → Developers → Webhooks:**

1. Click **Add endpoint**
2. Endpoint URL: `https://echoflux.ai/api/stripeWebhook`
3. Select events to listen to:
   - `account.updated` - When creator's account status changes
   - `account.application.authorized` - Creator completed onboarding
   - `account.application.deauthorized` - Creator disconnected
   - `payment_intent.succeeded` - Payment completed
   - `payment_intent.payment_failed` - Payment failed
   - `transfer.created` - Money sent to creator
   - `transfer.failed` - Transfer to creator failed
   - `payout.paid` - Creator received payout
   - `payout.failed` - Payout to creator failed
4. Click **Add endpoint**
5. Copy the **Signing secret** → Add to `STRIPE_WEBHOOK_SECRET` env var

### Step 5: Test in Test Mode

1. Set `STRIPE_USE_TEST_MODE=true` temporarily
2. Use Stripe test cards:
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
3. Test creator onboarding flow
4. Test fan purchase flow
5. Verify webhooks are received

### Step 6: Creator Onboarding Flow

**How it works (already implemented):**

1. Creator clicks "Connect with Stripe" in Payouts section
2. App calls `POST /api/stripeConnectOnboard`
3. API creates Stripe Express account and returns onboarding URL
4. Creator is redirected to Stripe's hosted onboarding
5. Creator provides:
   - Personal info (name, DOB, address)
   - Bank account or debit card
   - Identity verification (ID upload)
6. After completion, Stripe redirects back to your app
7. Webhook `account.updated` fires with status
8. App updates creator's record in Firestore

**Firestore Schema:**

```javascript
// creators/{creatorId}
{
  stripeConnectAccountId: "acct_xxxxx",  // Stripe account ID
  stripeConnectStatus: "complete",        // pending, incomplete, complete
  stripeConnectOnboardedAt: Timestamp,
  stripePayoutsEnabled: true,
  stripeChargesEnabled: true
}
```

### Step 7: Payment Flow

**When a fan purchases content:**

1. Fan clicks "Buy" or "Tip"
2. Frontend calls `POST /api/createFanCheckoutSession`
3. API creates Stripe Checkout Session with:
   ```javascript
   {
     payment_intent_data: {
       application_fee_amount: Math.round(amount * 0.15), // 15% platform fee
       transfer_data: {
         destination: creatorStripeAccountId,
       },
     },
   }
   ```
4. Fan completes payment on Stripe Checkout
5. Money flow:
   - Fan pays $10
   - Stripe takes ~3% ($0.30)
   - Platform takes 15% ($1.50)
   - Creator receives $8.20
6. Webhook `payment_intent.succeeded` fires
7. App grants fan access to content

### Step 8: Payout Schedule

**Automatic payouts (Stripe handles this):**

- Stripe automatically pays out to creator's bank
- Default: 2-day rolling basis (T+2)
- Can configure: daily, weekly, monthly
- Creators can request instant payouts (if enabled) for a small fee

### Step 9: Monitoring & Support

**In Stripe Dashboard:**

1. **Connect → Accounts**: View all connected creators
2. **Payments**: Monitor all transactions
3. **Payouts**: Track creator payouts
4. **Balance**: Platform balance overview

**Common Issues:**

| Issue | Solution |
|-------|----------|
| Creator stuck on onboarding | Check `account.requirements` in webhook |
| Payouts disabled | Creator needs to complete verification |
| Transfer failed | Check creator's bank details |
| Webhook not received | Verify endpoint URL and signing secret |

---

## Checklist

### Domain Migration
- [ ] DNS records added at registrar
- [ ] Domain added in Vercel
- [ ] SSL certificate provisioned
- [ ] Environment variables updated
- [ ] Firebase authorized domains updated
- [ ] OAuth providers updated
- [ ] Stripe webhook URL updated
- [ ] Old domain redirects set up

### Stripe Connect
- [ ] Stripe Connect enabled
- [ ] Express accounts configured
- [ ] Branding customized
- [ ] Environment variables set (all 5)
- [ ] Webhook endpoint created
- [ ] Webhook events selected
- [ ] Test mode verified
- [ ] Creator onboarding tested
- [ ] Fan purchase tested
- [ ] Payouts verified
- [ ] Switch to live mode

---

## Support Resources

- [Vercel Custom Domains](https://vercel.com/docs/concepts/projects/domains)
- [Firebase Auth Domains](https://firebase.google.com/docs/auth/web/redirect-best-practices)
- [Stripe Connect Docs](https://stripe.com/docs/connect)
- [Stripe Express Accounts](https://stripe.com/docs/connect/express-accounts)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
