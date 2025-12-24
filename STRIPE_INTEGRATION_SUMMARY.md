# Stripe Integration Summary

## ✅ What's Been Set Up

### 1. **Stripe Packages Installed**
- `stripe` - Server-side Stripe SDK
- `@stripe/stripe-js` - Client-side Stripe SDK (for future use)

### 2. **API Endpoints Created**

#### `/api/createCheckoutSession.ts`
- Creates Stripe Checkout sessions for subscriptions
- Handles plan selection (Caption, OnlyFans Studio, Pro, Elite, Agency)
- Supports monthly and annual billing cycles
- Includes promotion code support
- Returns checkout URL for redirect

#### `/api/stripeWebhook.ts`
- Handles Stripe webhook events:
  - `checkout.session.completed` - Activates subscription
  - `customer.subscription.updated` - Updates subscription status
  - `customer.subscription.deleted` - Cancels subscription
  - `invoice.payment_succeeded` - Resets usage counters
  - `invoice.payment_failed` - Handles failed payments
- Updates Firestore user documents with subscription data

### 3. **PaymentModal Updated**
- Removed mock card form (Stripe Checkout handles payment)
- Added Stripe Checkout redirect flow
- Kept promotion code validation (optional, can also use Stripe's built-in promo codes)
- Shows secure checkout message

### 4. **Pricing Component**
- Added success/cancel redirect handling
- Shows toast notifications for payment status
- Auto-refreshes user data after successful payment

## 🔧 Required Setup Steps

### Step 1: Add Environment Variables to Vercel

Go to Vercel Dashboard > Your Project > Settings > Environment Variables and add:

```
STRIPE_SECRET_KEY=sk_live_... (or sk_test_...)
STRIPE_PUBLISHABLE_KEY=pk_live_... (or pk_test_...)
STRIPE_WEBHOOK_SECRET=whsec_... (get from Stripe Dashboard)
NEXT_PUBLIC_APP_URL=https://engagesuite.ai
```

### Step 2: Create Products & Prices in Stripe Dashboard

1. Go to Stripe Dashboard > Products
2. Create products for each plan:
   - **Caption Pro**: $9/month, $7/month (annual)
   - **OnlyFans Studio**: $24/month, $19/month (annual)
   - **Pro**: $29/month, $23/month (annual)
   - **Elite**: $59/month, $47/month (annual)
   - **Agency**: $299/month, $239/month (annual)

3. Copy the Price IDs and add to environment variables:
```
STRIPE_PRICE_CAPTION_MONTHLY=price_...
STRIPE_PRICE_CAPTION_ANNUALLY=price_...
STRIPE_PRICE_ONLYFANS_MONTHLY=price_...
STRIPE_PRICE_ONLYFANS_ANNUALLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUALLY=price_...
STRIPE_PRICE_ELITE_MONTHLY=price_...
STRIPE_PRICE_ELITE_ANNUALLY=price_...
STRIPE_PRICE_AGENCY_MONTHLY=price_...
STRIPE_PRICE_AGENCY_ANNUALLY=price_...
```

### Step 3: Set Up Webhook Endpoint

1. Go to Stripe Dashboard > Developers > Webhooks
2. Click "Add endpoint"
3. Endpoint URL: `https://engagesuite.ai/api/stripeWebhook`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the webhook signing secret → `STRIPE_WEBHOOK_SECRET`

### Step 4: Test the Integration

#### Test Mode
1. Use test API keys (`sk_test_...` and `pk_test_...`)
2. Use Stripe test cards:
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
   - 3D Secure: `4000 0027 6000 3184`

#### Test Webhook Locally
```bash
stripe listen --forward-to localhost:3000/api/stripeWebhook
```

## 📋 User Flow

1. User clicks "Choose Plan" on Pricing page
2. PaymentModal opens
3. User can enter promotion code (optional)
4. User clicks "Continue to Checkout"
5. Redirected to Stripe Checkout
6. User completes payment on Stripe
7. Redirected back to `/pricing?success=true&session_id=...`
8. Webhook receives `checkout.session.completed` event
9. Webhook updates user plan in Firestore
10. User sees success message and page refreshes

## 🔐 Security Features

- ✅ Webhook signature verification
- ✅ User authentication required for checkout
- ✅ Metadata includes userId for verification
- ✅ All sensitive data handled server-side
- ✅ HTTPS required for webhooks

## 📝 User Data Fields Added

The webhook updates these fields in Firestore:
- `plan` - Current subscription plan
- `stripeCustomerId` - Stripe customer ID
- `stripeSubscriptionId` - Stripe subscription ID
- `subscriptionStatus` - active, canceled, past_due, etc.
- `subscriptionStartDate` - When subscription started
- `billingCycle` - monthly or annual
- `cancelAtPeriodEnd` - Whether subscription will cancel at period end
- `subscriptionEndDate` - When subscription ends (if canceled)

## 🚀 Next Steps (Optional Enhancements)

1. **Customer Portal**: Add Stripe Customer Portal for subscription management
2. **Proration**: Handle plan upgrades/downgrades with proration
3. **Trial Periods**: Add free trial support
4. **Email Notifications**: Send emails on payment events
5. **Usage-Based Billing**: Add metered billing if needed
6. **Subscription Management Page**: Create UI for users to manage subscriptions

## ⚠️ Important Notes

- **Webhook Body Parsing**: The webhook handler may need adjustment based on how Vercel parses the body. If webhook verification fails, check the raw body handling.
- **Price ID Mapping**: Currently uses environment variables. Consider creating a database table for price IDs if you need dynamic pricing.
- **Promotion Codes**: Currently supports both custom promotion validation and Stripe's built-in promo codes (via `allow_promotion_codes: true`).

## 🐛 Troubleshooting

### Webhook Not Receiving Events
- Check webhook URL is correct in Stripe Dashboard
- Verify `STRIPE_WEBHOOK_SECRET` matches endpoint secret
- Check Vercel function logs
- Test with Stripe CLI locally first

### Checkout Session Not Creating
- Verify all Price IDs are set in environment variables
- Check Stripe API keys are correct
- Verify user authentication is working
- Check browser console for errors

### User Plan Not Updating
- Check webhook events in Stripe Dashboard
- Verify Firebase Admin is initialized correctly
- Check Firestore rules allow writes
- Verify userId in webhook metadata matches Firestore user ID

## 📚 Documentation

- [Stripe Checkout Docs](https://stripe.com/docs/payments/checkout)
- [Stripe Webhooks Docs](https://stripe.com/docs/webhooks)
- [Stripe Testing](https://stripe.com/docs/testing)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)

