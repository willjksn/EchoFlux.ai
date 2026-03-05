# Creators and fan storefront (Firestore)

Used by **Fan Hub → My Page** (storefront settings) and the **fan storefront** at `echoflux.ai/{handle}`. Public storefronts resolve creator via `creatorHandles/{handle}` → `creatorId`, then load `creators/{creatorId}`.

---

## creatorHandles (handle → creatorId lookup)

**Path:** `creatorHandles/{handle}`  
- Document ID = normalized handle (lowercase, no @).  
- Enables O(1) resolution of `/{handle}` to a creator.

| Field | Type | Description |
|-------|------|--------------|
| `creatorId` | string | Reference to `creators/{creatorId}` (same as `users` doc id). |

**Writes:** `api/updateCreatorStorefront` (transaction: delete old handle doc if same creator, set new `creatorHandles/{handle}` = `{ creatorId }` when handle changes). My Page builder is the only place creators manage this mapping.

**Reads:** Used by `api/getCreatorByHandle` and `api/checkHandleAvailability` (server-side).

---

## creators

**Path:** `creators/{creatorId}`  
- `creatorId` = Firebase Auth / `users` doc id (same user).

### Schema

| Field | Type | Description |
|-------|------|--------------|
| `handle` | string | Unique handle for URL `/{handle}`. 3–20 chars, lowercase, alphanumeric + underscore. |
| `displayName` | string? | Display name on storefront. |
| `bio` | string? | Short bio (e.g. 500 chars). |
| `avatar` | string? | Profile image URL (Firebase Storage or avatarUrl). |
| `banner` | string? | Banner image URL (bannerUrl). |
| `theme` | object? | `primary`, `background`, `text` (hex), `buttonStyle` ('solid' \| 'outline' \| 'pill'). |
| `sections` | object? | `feed`, `treats`, `messages`, `sessions`, `about` (booleans). |
| `sectionsOrder` | string[]? | Order of section keys for tab bar (e.g. `['feed','treats','messages','sessions','about']`). |
| `spicyMode` | boolean? | 18+ / IG-like spicy content flag; policy summary shown on storefront. |
| `rules` | object? | `boundariesText`: About/Boundaries block (markdown or plain). |
| `monetization` | object? | `monthlyPrice`, `currency`, `lockedDefaultPrice`, `tipsEnabled`, `chatEnabled`. |
| `onboardingStatus` | string? | Creator onboarding state. |
| `stripeConnectAccountId` | string? | Stripe Connect Express account ID. Set by Fan Hub Payouts. |
| `updatedAt` | string? | ISO timestamp. |

### Indexes

- **Single-field index** on `handle` (for `where("handle", "==", value)`).  
  Create in Firebase Console: Firestore → Indexes → single field `handle` (Ascending).

---

## creatorSubscribers (fan entitlement)

**Path:** `creatorSubscribers/{creatorId}/subscribers/{fanId}`  
- Used to know if a fan has an active subscription to a creator (storefront shows Feed + Treats + Messages when subscribed).

| Field | Type | Description |
|-------|------|--------------|
| `status` | string | e.g. `active`, `trialing`, `canceled`. Entitlement checks use `active` or `trialing`. |

**Reads:** Used by `api/getFanEntitlement` (server-side, requires auth).  
**Writes:** Server-side when a fan subscribes (e.g. Stripe webhook or checkout success).

---

## products (Treats store)

**Path:** `products/{productId}`  
- Creator-scoped treat products (tips, unlock_media, bundles, chat sessions, voice notes, live chat, etc.).

| Field | Type | Description |
|-------|------|--------------|
| `creatorId` | string | Owner (same as `users` doc id). |
| `type` | string | One of: tip, unlock_media, bundle, chat_session, voice_note_30s, voice_note_60s, private_video_reply, birthday_message, overthinking_response, random_checkin, live_chat_15m, live_chat_30m, live_chat_45m, live_chat_1h, custom. |
| `title` | string | Display title. |
| `description` | string? | Optional description. |
| `priceCents` | number | Price in cents. |
| `mediaUrl` | string? | For unlock_media: media URL. |
| `archived` | boolean | When true, hidden from creator’s active list (still in DB). |
| `visible` | boolean | When false, hidden from storefront. |
| `sortOrder` | number? | Optional sort. |
| `createdAt` | string | ISO. |
| `updatedAt` | string | ISO. |

**Indexes (suggested):**

- **Composite:** `creatorId` (ASC), `archived` (ASC), `sortOrder` (ASC), `createdAt` (DESC)  
  Used by: list products (creator or storefront) with `where("creatorId","==",id).where("archived","==",false).orderBy("sortOrder").orderBy("createdAt","desc")`.

---

## creatorEntitlements (fan unlocks + subscription flag)

**Path:** `creatorEntitlements/{creatorId}/grants/{fanId}`  
- One doc per fan per creator: subscription flag + list of unlocked product ids (stub purchases).

| Field | Type | Description |
|-------|------|--------------|
| `subscription` | boolean | Whether fan has an active subscription (can mirror creatorSubscribers). |
| `unlockedProductIds` | string[] | Product ids the fan has “purchased” (stub or real). |
| `updatedAt` | string | ISO. |

**Reads:** `getFanEntitlement` (auth).  
**Writes:** Stripe Connect webhook (subscription + product checkout), `purchaseProduct` (legacy stub if still used).

---

## orders (fan payments to creators)

**Path:** `orders/{orderId}`  
- One doc per fan payment (one-time product). Subscriptions are tracked in `creatorSubscribers`; optional order records for subscriptions can be added later.

| Field | Type | Description |
|-------|------|--------------|
| `creatorId` | string | Creator (Connect account owner). |
| `fanId` | string | Fan (payer). |
| `productId` | string? | Product id (for type `product`). |
| `type` | string | `product` or `subscription`. |
| `stripeSessionId` | string? | Checkout Session id. |
| `stripePaymentIntentId` | string? | PaymentIntent id (for refund lookup). |
| `amountCents` | number | Amount in cents. |
| `status` | string | `paid` or `refunded`. |
| `createdAt` | string | ISO. |
| `updatedAt` | string? | ISO. |

**Writes:** Stripe Connect webhook (`checkout.session.completed` for product, `charge.refunded` updates status).  
**Reads:** Webhook refund handler (query by `stripePaymentIntentId`).

---

## creatorStats (aggregates)

**Path:** `creatorStats/{creatorId}`  
- One doc per creator; updated by Connect webhooks on payment and refund.

| Field | Type | Description |
|-------|------|--------------|
| `totalRevenueCents` | number | Sum of paid order amounts minus refunds. |
| `totalOrders` | number | Count of paid product orders (refunds decrement). |
| `updatedAt` | string | ISO. |

**Writes:** Stripe Connect webhook (product checkout and charge.refunded).

---

## See also

- `types.ts`: `CreatorStorefrontSettings`
- `api/getCreatorByHandle.ts`: resolves handle → creatorId (creatorHandles + creators fallback)
- `api/getFanEntitlement.ts`: checks creatorSubscribers for current user
- `api/createFanCheckoutSession.ts`: Stripe Checkout for fan subscription + product (Connect)
- `api/stripeConnectOnboard.ts`, `api/stripeConnectStatus.ts`: Connect onboarding and status
- `api/purchaseProduct.ts`: optional stub (no Stripe); prefer createFanCheckoutSession for real payments
- `api/products.ts`: list/create/update/delete products
- `api/getBioPage.ts`: resolves `?username={handle}` from `creators` then `users.bioPage`
- `api/checkHandleAvailability.ts`: unique check for `handle` (3–20 chars, alphanumeric + underscore; checks `creatorHandles` first)
- `api/updateCreatorStorefront.ts`: save storefront from My Page builder; transaction updates `creatorHandles` when handle changes
- **My Page builder:** `components/FanHubMyPage.tsx` (entry), `components/MyPageBuilder.tsx` (two-column builder), `components/StorefrontPreview.tsx` (live preview). No Firestore write from client for handle—use `POST /api/updateCreatorStorefront`.
- **(Optional later)** `domainMap/{host}` → `{ creatorId }` for custom domains; not implemented.

### Firestore index suggestions (copy to Firebase Console → Firestore → Indexes)

1. **Collection:** `products`  
   Fields: `creatorId` (Ascending), `archived` (Ascending), `sortOrder` (Ascending), `createdAt` (Descending)  
   Query scope: Collection

2. (Optional) If you list without `archived` filter: **Collection:** `products`  
   Fields: `creatorId` (Ascending), `sortOrder` (Ascending), `createdAt` (Descending)  
   Query scope: Collection

3. **Collection:** `orders` (for refund lookup)  
   Fields: `stripePaymentIntentId` (Ascending)  
   Query scope: Collection
