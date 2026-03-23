# Firestore rules & indexes (Fan Hub)

## Deploy rules

After changing `firestore.rules`:

```bash
firebase deploy --only firestore:rules
```

## What the rules cover

- **`usernames/{handle}`** — public read (availability checks), no client writes (claims go through `api/claimMemberUsername`).
- **`users/{uid}`** — `username` / `usernameUpdatedAt` are **restricted** (server-only). Owners read/write self (with safe updates). **Creators** may **read** another user’s doc only if that user is linked: `users/{creatorId}/onlyfans_fan_preferences/{fanId}` exists **or** `creators/{creatorId}/fans/{fanId}` exists (Studio fan list enrichment).
- **`creators/{creatorId}`** — owner read; most profile writes via Admin API. **Exception:** owner may **create/update** only the **`feedSettings`** field (used by `FanHubFeed` save visibility).
- **`creators/{creatorId}/fanPosts`**, **`.../posts`** — creator CRUD; any **authenticated** user may **read** documents whose `status` is missing or `published` / `Published` (member feed + previews). Stricter entitlement for paid content remains app/API-layer where needed.
- **`creators/{creatorId}/fans/{fanId}`** — creator full access; fan may **read** their own `{fanId}` doc.
- **`creators/{creatorId}/subscribers/{id}`** — creator (and Admin) **read** only; client writes **denied** (server/webhooks).
- **`creators/{creatorId}/orders/{id}`** — creator (and Admin) **read** only; client writes **denied** (server/Stripe).
- **`fanUsers`**, **`treatGrants`**, **`liveVideoChats`** under each creator — creator only.

## Indexes (`firestore.indexes.json`)

Deploy when indexes change:

```bash
firebase deploy --only firestore:indexes
```

- **`creators/{creatorId}/fanPosts`** with `orderBy('createdAt')`** — normally covered by Firestore **single-field** indexes. If you add a `where(...)` + `orderBy` on another field, the Firebase console will link a **composite** index — add it to `firestore.indexes.json` and deploy.

## DM / checkout data

- **DM threads** — accessed via **`/api/fanDm*`** (Admin SDK), not client Firestore.
- **Stripe / orders** — server routes; avoid widening client rules for payment collections.
