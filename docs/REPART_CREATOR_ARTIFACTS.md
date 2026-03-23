# Reparent creator artifacts (`YOUR_CREATOR_ID` → real uid)

If Stormij migrated fans under **`creators/YOUR_CREATOR_ID`** but her live storefront and My Page live under **`creators/{herFirebaseUid}`**, everything that keys off **`creatorId`** must use **one** uid — the **`to`** (canonical) id — or fans will not see membership, DMs, and entitlements on the public URL.

This script **merges** data from the legacy doc into the canonical doc. It does **not** delete the source unless you pass **`--delete-source-after`** (optional, after verification).

---

## What gets synced **after** you run this (ongoing behavior)

Once **`creatorHandles`** and **`creators/{uid}`** point to the same uid and fans live under **`creators/{uid}/fans`**, the app **already keeps things in sync**:

- **Stripe webhooks** (`api/stripeWebhook.ts`) write to **`creators/{creatorId}/fans`** and **`creatorSubscribers`** using **`creatorId` from checkout metadata** — new checkouts must use **`creatorId`** = **`to`** (your real uid). Fix any old products/checkout links that still send the old id.
- **Fan Hub → Fans** reads **`creators/{creatorId}/fans`** and **`users/{creatorId}/onlyfans_fan_preferences`** (synced from fans via webhooks / `backfill`).
- **Messages** use **`fanDmThreads`** with **`getThreadId(creatorId, fanId)`** — after migration, threads are under the **new** uid.
- **Entitlements** use **`creatorEntitlements/{creatorId}/grants/{fanId}`**.

You do **not** need a separate “sync job” for day-to-day; **reparenting is one-time**. After that, normal app flows apply.

**Stripe note:** Existing Stripe subscriptions created with **`metadata.creatorId`** = old id may still reference the old id until you migrate metadata in Stripe or fans re-subscribe. Check **Stripe Dashboard → Subscriptions → metadata** for affected rows.

---

## Safety

1. **Export Firestore** (Firebase Console → Firestore → Import/Export) or use a **staging** project first.
2. Run **dry-run** (default) and read the log.
3. Run **`--apply`** once satisfied.
4. Verify in app (Fans tab, Messages, a test fan login) before **`--delete-source-after`**.

---

## Prerequisites

- **Service account JSON** with Firestore read/write (same as other migration scripts).
- Path: **`echoflux-service-account.json`** at repo root **or** **`ECHOFLUX_SERVICE_ACCOUNT=/path/to.json`**.

---

## Commands

```bash
# 1) Preview (no writes)
npx ts-node --esm scripts/reparentCreatorArtifacts.ts ^
  --from=YOUR_CREATOR_ID ^
  --to=ZY2JlmlsNmNkAe0LdRXYycDvHSi2
```

(PowerShell line continuation `^`; on bash use `\`.)

```bash
# 2) Apply
npx ts-node --esm scripts/reparentCreatorArtifacts.ts ^
  --from=YOUR_CREATOR_ID ^
  --to=ZY2JlmlsNmNkAe0LdRXYycDvHSi2 ^
  --apply
```

```bash
# 3) Optional: after verification, delete the legacy creators/{from} doc and its subcollections
npx ts-node --esm scripts/reparentCreatorArtifacts.ts ^
  --from=YOUR_CREATOR_ID ^
  --to=ZY2JlmlsNmNkAe0LdRXYycDvHSi2 ^
  --apply ^
  --delete-source-after
```

**Skip DM migration** (if index missing or you want a second pass):

```bash
npx ts-node --esm scripts/reparentCreatorArtifacts.ts --from=... --to=... --apply --skip-dm-threads
```

---

## What the script does

| Area | Action |
|------|--------|
| **`creators/{from}/fans` (and fanPosts, posts, fanUsers, treatGrants, conversations)** | Merge into **`creators/{to}/...`** (same doc id; field merge prefers stronger subscription / higher spend where applicable) |
| **`creatorSubscribers/{from}/subscribers`** | Merge into **`creatorSubscribers/{to}/subscribers`** |
| **`creatorEntitlements/{from}/grants`** | Merge into **`creatorEntitlements/{to}/grants`** |
| **`creatorBlocks/{from}/blocked`** | Merge into **`creatorBlocks/{to}/blocked`** |
| **`users/{from}/onlyfans_fan_preferences`** | Merge into **`users/{to}/onlyfans_fan_preferences`** |
| **`orders`** | **`creatorId`** field **`from` → `to`** |
| **`products`** | **`creatorId`** field **`from` → `to`** |
| **`creatorHandles/{handle}`** | If **`creatorId`** === **`from`**, set to **`to`** |
| **`creatorDomains/*`** | If **`creatorId`** === **`from`**, set to **`to`** |
| **`fanDmThreads`** where **`creatorId` == from** | New thread doc id **`getThreadId(to, fanId)`**, copy thread + **`messages`** subcollection |
| **`users/{from}/dm_muted_threads`** | Copy to **`users/{to}/dm_muted_threads`** with new thread ids |
| **`users/{to}/dm_muted_threads`** | Remap doc ids that still reference old thread ids |

It does **not** overwrite **`creators/{to}`** top-level fields from **`creators/{from}`** (only subcollections).

---

## Firestore index

If **`fanDmThreads`** query fails, create an index on **`fanDmThreads`** with field **`creatorId`** (equality). Firestore may prompt with a link when the query runs.

---

## After apply

```bash
npm run backfill:fan-hub -- --creator-id=YOUR_REAL_UID
```

(Uses **`to`** uid.) This refreshes **`onlyfans_fan_preferences`** from **`fans`** rows if anything still looks off.

---

## npm script

```bash
npm run reparent:creator -- --from=YOUR_CREATOR_ID --to=ZY2JlmlsNmNkAe0LdRXYycDvHSi2
```

(Add `--apply` when ready.)
