# Stripe Connect Express – Fan monetization

Creator onboarding (Express), fan subscription and one-time product checkout, webhooks, and refund handling.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY_LIVE` / `STRIPE_SECRET_KEY_Test` | Yes | Platform secret key (existing). Same key used for Connect API calls. |
| `STRIPE_WEBHOOK_SECRET` | Yes | Signing secret for platform webhooks (existing). |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Optional | Signing secret for **Connect** webhook endpoint. If you add a separate Connect webhook in Stripe Dashboard (Connect → Webhooks), use this and the handler will try both secrets when verifying `stripe-signature`. |
| `STRIPE_USE_TEST_MODE` | Optional | `true` to use test keys and test mode (existing). |
| `NEXT_PUBLIC_APP_URL` | Optional | Origin for success/cancel and Connect return/refresh URLs (e.g. `https://echoflux.ai`). |

No separate Connect “client ID” is required for Express; onboarding uses `stripe.accounts.create({ type: 'express' })` and `stripe.accountLinks.create()`.

---

## Backend API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `api/stripeConnectOnboard` | POST | Create or reuse Express account, create account link; persist `stripeConnectAccountId` on `creators/{creatorId}`. Returns `{ url, accountId }`. |
| `api/stripeConnectStatus` | GET | Return `stripeConnectAccountId`, `chargesEnabled`, `payoutsEnabled`, `detailsSubmitted` for the authenticated creator. |
| `api/createFanCheckoutSession` | POST | Create Stripe Checkout Session for fan→creator payment. Body: `creatorId`, `type: 'subscription' \| 'product'`, `productId?` (required if type is product), `subscriptionPriceCents?`, `successUrl?`, `cancelUrl?`. Returns `{ url, sessionId }`. Payments go to creator’s Connect account. |
| `api/stripeWebhook` | POST | Handles both platform and Connect events. Verifies signature with `STRIPE_WEBHOOK_SECRET` first, then `STRIPE_CONNECT_WEBHOOK_SECRET` if present. Connect events are those with `event.account` set. |

---

## Webhook validation

- **Raw body**: The handler uses `config.api.bodyParser = false` and reads the raw request body for signature verification.
- **Signature**: `stripe.webhooks.constructEvent(rawBody, sig, secret)` is called with the platform secret first; on failure, the Connect secret is tried if set.
- **Connect events**: When `event.account` is present, the handler runs Connect-specific logic and skips platform logic. No double-processing.

---

## Connect webhook behavior

| Event | Action |
|-------|--------|
| `checkout.session.completed` (Connect) | If `metadata.type === 'subscription'`: create/update `creatorSubscribers/{creatorId}/subscribers/{fanId}`, set `creatorEntitlements/{creatorId}/grants/{fanId}.subscription = true`. If `metadata.type === 'product'`: create `orders` doc, add `productId` to grant’s `unlockedProductIds`, update `creatorStats/{creatorId}` (totalRevenueCents, totalOrders). |
| `customer.subscription.updated` (Connect) | Update `creatorSubscribers` and `creatorEntitlements` from `subscription.metadata.creatorId/fanId`. |
| `customer.subscription.deleted` (Connect) | Set subscriber status to `canceled`, grant `subscription = false`. |
| `charge.refunded` (Connect) | Find order by `stripePaymentIntentId`; set order `status = 'refunded'`; remove `productId` from grant’s `unlockedProductIds`; decrement `creatorStats` revenue and order count. |

---

## Firestore

- **creators**: `stripeConnectAccountId` (set by onboarding).
- **creatorSubscribers**, **creatorEntitlements**: Updated by Connect webhooks (subscription lifecycle and product unlocks).
- **orders**: One doc per product payment; `stripePaymentIntentId` used for refund lookup.
- **creatorStats**: `totalRevenueCents`, `totalOrders`; updated on product payment and refund.

See `docs/CREATORS_SCHEMA.md` for full schema and index suggestions.

---

## Test plan

### 1. Stripe Dashboard (test mode)

- [ ] Enable Connect in Stripe Dashboard (test mode): Connect → Get started → Express.
- [ ] Create a Connect webhook endpoint (optional): Connect → Webhooks → Add endpoint. URL: `https://your-domain.com/api/stripeWebhook`. Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`. Copy signing secret → `STRIPE_CONNECT_WEBHOOK_SECRET`.
- [ ] If using one endpoint for both platform and Connect, ensure the same URL is added under both “Webhooks” (platform) and “Connect → Webhooks” so both signing secrets are used as intended.

### 2. Creator onboarding

- [ ] Log in as a creator; open Fan Hub → Payouts.
- [ ] Click “Connect Stripe”. Should redirect to Stripe Express onboarding.
- [ ] Complete onboarding (use [Stripe test data](https://stripe.com/docs/connect/testing) if needed).
- [ ] Return to app; Payouts tab should show “Charges enabled” and “Payouts enabled” when Stripe has fully activated the account.
- [ ] Confirm `creators/{creatorId}` has `stripeConnectAccountId` in Firestore.

### 3. Fan subscription checkout

- [ ] Log in as a different user (fan). Open a creator’s storefront `/{handle}` (creator must have Connect completed and charges enabled).
- [ ] On landing (not subscribed), click “Subscribe”. Should redirect to Stripe Checkout (session created with creator’s Connect account).
- [ ] Pay with test card (e.g. `4242 4242 4242 4242`). Complete checkout.
- [ ] Redirect to success URL; storefront should show Feed + Treats + Messages (entitlement from webhook).
- [ ] In Firestore: `creatorSubscribers/{creatorId}/subscribers/{fanId}` and `creatorEntitlements/{creatorId}/grants/{fanId}` with `subscription: true`.

### 4. Fan one-time product (treat) checkout

- [ ] As a subscribed (or any) fan, open storefront and go to Treats. Click “Purchase” on a product.
- [ ] Redirect to Stripe Checkout; complete payment.
- [ ] After redirect, Treats should show the product as purchased (or refresh); `creatorEntitlements` grant should include `productId` in `unlockedProductIds`.
- [ ] In Firestore: new doc in `orders` with `status: 'paid'` and correct `stripePaymentIntentId`; `creatorStats/{creatorId}` updated.

### 5. Refund and entitlement revocation

- [ ] In Stripe Dashboard (test), find the payment for the product (Payments or Connect account payments). Refund it.
- [ ] Webhook `charge.refunded` should fire. Confirm in Firestore: same order doc now `status: 'refunded'`; grant’s `unlockedProductIds` no longer contains that product; `creatorStats` revenue and order count decreased.

### 6. Subscription cancel

- [ ] In Stripe Dashboard, cancel the fan’s subscription to the creator (or use test clock).
- [ ] `customer.subscription.deleted` webhook should run. Confirm `creatorSubscribers` and `creatorEntitlements` show subscription as canceled / `subscription: false`.

### 7. Edge cases

- [ ] Fan checkout when creator has not connected Stripe → API returns 400 “Creator has not connected Stripe”.
- [ ] Fan checkout when creator’s Connect account has `charges_enabled: false` → API returns 400 “Creator cannot accept payments yet”.
- [ ] Blocked fan: ensure `createFanCheckoutSession` still enforces block (returns 403).

---

## Optional: platform vs Connect webhook URLs

You can use a single URL for both platform and Connect events and two secrets (as implemented), or two URLs (e.g. `/api/stripeWebhook` and `/api/stripeConnectWebhook`) with different secrets; the latter would require a second serverless function that only runs Connect logic.
