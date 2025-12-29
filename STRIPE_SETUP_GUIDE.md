# Stripe Integration Setup Guide

## Step 1: Environment Variables

Add these environment variables to your Vercel project:

### Required Stripe Keys
```
STRIPE_SECRET_KEY=sk_live_... (or sk_test_... for testing)
STRIPE_PUBLISHABLE_KEY=pk_live_... (or pk_test_... for testing)
STRIPE_WEBHOOK_SECRET=whsec_... (get this from Stripe Dashboard > Webhooks)
```

### Stripe Price IDs
You'll need to create products and prices in Stripe Dashboard, then add their IDs:

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

### App URL (for redirects)
```
NEXT_PUBLIC_APP_URL=https://engagesuite.ai
```

## Step 2: Create Products & Prices in Stripe Dashboard

1. Go to Stripe Dashboard > Products
2. Create products for each plan:
   - **Caption Pro** - $9/month, $7/month (annual)
   - **OnlyFans Studio** - $24/month, $19/month (annual)
   - **Pro** - $29/month, $23/month (annual)
   - **Elite** - $59/month, $47/month (annual)
   - **Agency** - $299/month, $239/month (annual)

3. For each product, create:
   - Monthly recurring price
   - Annual recurring price (with discount)

4. Copy the Price IDs and add them to your environment variables

## Step 3: Set Up Webhook Endpoint

1. Go to Stripe Dashboard > Developers > Webhooks
2. Click "Add endpoint"
3. Endpoint URL: `https://your-domain.vercel.app/api/stripeWebhook`
4. Select events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

5. Copy the webhook signing secret and add to `STRIPE_WEBHOOK_SECRET`

## Step 4: Update PaymentModal Component

The `PaymentModal` component has been updated to use Stripe Checkout. It will:
- Create a checkout session when user clicks "Subscribe"
- Redirect to Stripe Checkout
- Handle success/cancel redirects
- Webhook will update user plan automatically

## Step 5: Test the Integration

### Test Mode
1. Use test API keys (`sk_test_...` and `pk_test_...`)
2. Use Stripe test cards: https://stripe.com/docs/testing
3. Test webhook locally using Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripeWebhook
   ```

### Test Cards
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0027 6000 3184`

## Step 6: User Plan Management

The webhook automatically:
- Updates user plan on successful checkout
- Resets usage counters on payment
- Handles subscription updates
- Downgrades to Free on cancellation

## Troubleshooting

### Webhook Not Receiving Events
- Check webhook URL is correct in Stripe Dashboard
- Verify `STRIPE_WEBHOOK_SECRET` matches the endpoint secret
- Check Vercel function logs for errors

### Checkout Session Not Creating
- Verify all Price IDs are set in environment variables
- Check Stripe API keys are correct
- Verify user authentication is working

### User Plan Not Updating
- Check webhook is receiving events (Stripe Dashboard > Webhooks > Events)
- Verify Firebase Admin is initialized correctly
- Check Firestore rules allow writes

## Security Notes

- Never commit Stripe keys to git
- Use environment variables for all secrets
- Verify webhook signatures (already implemented)
- Use HTTPS for all webhook endpoints
- Regularly rotate API keys

## Next Steps

1. Add customer portal for subscription management
2. Add proration handling for plan upgrades/downgrades
3. Add email notifications for payment events
4. Add usage-based billing if needed
5. Add trial periods if desired



