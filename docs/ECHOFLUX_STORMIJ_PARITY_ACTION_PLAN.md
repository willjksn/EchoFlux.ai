# Echoflux ↔ Stormij parity: messages and Stripe

This doc spells out what you need to do so Echoflux matches Stormij for **Fan Hub messages** and **member/fan subscription cancel** (Stripe).

---

## 1. Messages (Fan Hub)

### The mismatch

| Where | Stormij | Echoflux |
|-------|---------|----------|
| **Storage** | Stormij used a `conversations` collection (one doc per creator–fan chat). | Echoflux uses **fanDmThreads** (top-level): one doc per thread, `id = [creatorId, fanId].sort().join('_')`, plus subcollection **messages**. |
| **Migration** | The migration script writes Stormij conversations into **creators/{creatorId}/conversations** (and subcollection **messages**). | Fan Hub Messages UI reads from **fanDmThreads** and **fanDmThreads/{threadId}/messages**. |

So after migrating Stormij → Echoflux, conversations live under `creators/{id}/conversations`, but the Messages tab only reads from `fanDmThreads`. **Migrated Stormij chats do not show up in Fan Hub Messages until they exist in fanDmThreads.**

### What you need to do

**Option A – One-time sync (recommended)**  
Run the script that copies from `creators/{creatorId}/conversations` into `fanDmThreads` (and messages subcollection) so the existing Fan Hub Messages UI shows Stormij conversations.

- Script: **`scripts/sync-conversations-to-fanDmThreads.ts`** (see below).
- Run once per creator who had Stormij conversations migrated:
  ```bash
  npx ts-node scripts/sync-conversations-to-fanDmThreads.ts --creator-id=YOUR_CREATOR_ID [--dry-run]
  ```
- After this, Fan Hub → Messages will list those threads and messages.

**Option B – Rely only on new DMs**  
Do nothing: new conversations started in Echoflux will be created in `fanDmThreads` by the existing APIs. Old Stormij conversations will remain only under `creators/{id}/conversations` and will **not** appear in Fan Hub Messages.

**Summary:** To match Stormij for messages, run the sync script (Option A) after the Stormij migration so all conversations appear in Fan Hub Messages.

---

## 2. Stripe: member/fan canceling subscription

### What Echoflux already has

- **Webhook**  
  When a fan’s subscription is canceled in Stripe (by fan, creator, or Stripe), `customer.subscription.deleted` is handled: `creatorSubscribers`, `creatorEntitlements`, and `creators/{id}/fans` are updated (e.g. `subscriptionStatus: 'canceled'`). So **data stays in sync** when a subscription is canceled.

- **Creator / platform subscription**  
  `api/cancelSubscription` and Settings/PaymentModal use **users/{uid}.stripeSubscriptionId** (platform/creator plan), not fan→creator Connect subscriptions.

### The gap (now filled)

- **Fan canceling their membership to a creator**  
  The subscription is stored on **creatorSubscribers/{creatorId}/subscribers/{fanId}.stripeSubscriptionId**. Echoflux now has:

  - **`api/fanCancelCreatorSubscription.ts`** (implemented): POST with auth = fan, body `{ creatorId }`. Looks up the fan’s subscription for that creator and sets Stripe `cancel_at_period_end: true`. The existing webhook handles `customer.subscription.deleted` when the period ends and updates Firestore.

### What you need to do

1. **Add a “Cancel membership” control on the fan storefront** when the fan is subscribed (e.g. on the creator’s page or in a “Membership” / account area). On click, call `POST /api/fanCancelCreatorSubscription` with `{ creatorId }` and show the returned `currentPeriodEnd` so the fan knows when access ends.
2. **Optional:** For “Manage subscription” (change payment method, invoices), add Stripe Customer Portal later: `api/createStripeBillingPortalSession.ts` and a link that opens the returned URL.
3. **Ensure** Stripe webhook URL is correct for your deployment (e.g. `https://echoflux.ai/api/stripeWebhook`) and that `customer.subscription.deleted` is selected so Firestore stays in sync when the fan cancels.

---

## 3. Checklist

- [ ] **Messages**  
  - [ ] Run `scripts/sync-conversations-to-fanDmThreads.ts` for the Stormij creator(s) after migration (use `--dry-run` first).  
  - [ ] Open Fan Hub → Messages and confirm migrated conversations appear.

- [ ] **Stripe cancel**  
  - [x] `api/fanCancelCreatorSubscription.ts` added (fan cancels at period end).  
  - [x] “Cancel membership” button added in Fan Storefront member header (when subscribed).  
  - [ ] Test: fan clicks Cancel membership → confirm → success message with period end; when period ends, webhook runs → `creatorSubscribers` / `creatorEntitlements` / `creators/.../fans` show canceled; fan loses access.

- [ ] **Env / Stripe**  
  - [ ] Webhook endpoint points to production URL; `STRIPE_WEBHOOK_SECRET` (and `STRIPE_CONNECT_WEBHOOK_SECRET` if used) set.  
  - [ ] Connect events include `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`.

---

## 4. Script: sync conversations → fanDmThreads

The script **`scripts/sync-conversations-to-fanDmThreads.ts`** (provided in repo) will:

- List `creators/{creatorId}/conversations`.
- For each conversation: `memberUid` = fan, so `threadId = [creatorId, memberUid].sort().join('_')`.
- Create or merge into `fanDmThreads/{threadId}` with `creatorId`, `fanId`, `lastMessageAt`, `lastMessagePreview`, `fanHasSentMessage` (if any message has `senderId === memberUid`).
- Copy each message from `creators/{creatorId}/conversations/{convId}/messages` into `fanDmThreads/{threadId}/messages` with `senderId`, `content`, `createdAt` (and optional `reported`, `reportId` if present).

Run with `--dry-run` first to log what would be written without writing.
