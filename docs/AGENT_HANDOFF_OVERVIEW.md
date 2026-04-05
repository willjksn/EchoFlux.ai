# Agent handoff: EchoFlux / engagesuite.ai — done vs. left

Pass this file to another agent so they can orient quickly. **Canonical behavior** for Stripe, checkout, webhooks, and DMs is in `docs/echoflux-stripe-and-messages.md` and `docs/FAN_DM_SAFETY.md`.

---

## Product context (short)

- **EchoFlux** (repo historically `engagesuite.ai`): creator fan hub, fan landing / storefront, **Treats** (digital products), Stripe Connect, fan DMs, subscriptions, migration tooling from Stormijxo.
- Sensitive flows use **server routes** (`api/*`) and Firebase Admin; do not bypass webhook verification or leak secrets.

---

## Recently shipped (high level)

Recent `main` commits (newest first) cover:

| Area | What changed |
|------|----------------|
| **Products / Treats API** (`a4146c5`) | **GET** lists by `creatorId` only, filters `archived` in memory so **public landing** does not depend on a Firestore composite index (which was causing empty treat lists). **PATCH** ownership now uses `authUid = normalizeCreatorId(decoded.uid) \|\| decoded.uid` (same as DELETE), fixing **403** when toggling “Landing store” / “Member tab” in Fan Hub if `creatorId` on the doc is legacy-shaped. |
| **Stripe webhook** (`04ba65f`) | `checkout.session.completed` path: `subscriptions.retrieve` wrapped so a subscription on **another** Stripe account (e.g. Stormijxo vs default API key) does not 500 the whole handler. |
| **Fan landing** (`504f16a`) | Default **light** theme instead of forcing dark from `prefers-color-scheme`. |
| **Fan hub bundle** (`59d64b5`, `353f407`, `a66c79e`, …) | Storefront / live landing preview, compound fan IDs, `creatorId` normalization for products POST/DELETE, guest treats modal, marketing copy tweaks, etc. |
| **Stormij migration** | Scripts and docs: `docs/STORMIJ_MIGRATION.md`, `docs/MIGRATED_FANS_AUTH.md`, `docs/STORMIJXO_DOMAIN_STEP_BY_STEP.md`. Migration is **one-way read** from Stormij Firebase → EchoFlux Firestore. |
| **Env / webhooks** | `.env.example` documents multiple webhook secrets, e.g. `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_STORMIJXO_WEBHOOK_SECRET`, optional `STRIPE_ADDITIONAL_WEBHOOK_SECRETS`. **Same URL** can serve multiple Stripe endpoints if each account’s signing secret is configured in the host (e.g. Vercel) so verification accepts the right `whsec_`. |

---

## What to verify after deploy (treats / landing)

The **code** for empty landing cards and broken manage toggles is addressed in `api/products.ts` (`a4146c5`). Still confirm in production:

1. **Anonymous** request: `GET /api/products?creatorId=<canonicalUid>&context=landing` returns rows when products are `visible`, not `archived`, and `showOnLandingPage !== false`.
2. **Creator** in Fan Hub → Treats: PATCH toggles return **200**, not **403**.
3. If lists are still empty: check **Network** for `/api/products` status/body and server logs (`products GET: variant query failed`). Confirm **creator settings** (`publicTreatsOnLanding`, treats section on) and client props (`FanStorefrontView`, `onPublicLanding`) match expectations.

---

## Likely follow-ups / open work (not exhaustive)

- **Migrated fans and Auth:** Migrating `members` writes Firestore `fans` docs but does **not** auto-create Firebase Auth users in EchoFlux. See `docs/MIGRATED_FANS_AUTH.md` for import / incremental runs.
- **Stormij migration correctness:** Price mapping conventions (`stormijPriceToCents` in `scripts/migrate-stormij.ts`) may need adjustment per real data; re-run `--collection=treats` after fixes.
- **Stripe / multi-account:** Ensure every Stripe account that posts to your webhook URL has its **`whsec`** available to the verifier (env vars above). Mismatched account vs API key remains a class of issues outside product PATCH.
- **Reports admin UI:** `docs/FAN_DM_SAFETY.md` notes `reports` with `status: 'pending'` — listing UI may still be partial or TODO depending on product scope.
- **Meta / OAuth:** Separate handoff docs (`docs/META_OAUTH_INCIDENT_HANDOFF.md`, `docs/META_APP_LIVE_MODE.md`) if social connect is in scope.

---

## Key files for the next agent

| Topic | Location |
|-------|----------|
| Products API (GET/POST/PATCH/DELETE) | `api/products.ts` |
| Creator ID normalization (queries / auth) | `src/lib/creatorIdNormalize.ts` (imported by API) |
| Fan Hub treats UI | `components/TreatsStore.tsx` |
| Landing / storefront product fetch | `components/FanStorefrontView.tsx` (or equivalent; search `context=landing`) |
| Stripe + messages reference | `docs/echoflux-stripe-and-messages.md` |
| DM safety / reports | `docs/FAN_DM_SAFETY.md` |
| Stormij → EchoFlux | `docs/STORMIJ_MIGRATION.md` |

---

## How to continue safely

1. Read the relevant section of `docs/echoflux-stripe-and-messages.md` before changing checkout, Connect, or webhooks.
2. Preserve **backward compatibility** for existing creators/fans unless a migration is explicit.
3. Prefer **small, focused diffs**; match existing patterns in the touched files.

---

*Generated for agent handoff. Update this file when major milestones land so the next session stays accurate.*
