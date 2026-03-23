# Migrated fans: membership vs “sign up again”

There are **two different things**:

| Layer | What it does | How “new Stormij fans” get here |
|--------|----------------|----------------------------------|
| **Firestore** (`creators/{creatorId}/fans/{fanId}`) | Tells EchoFlux that someone is a member, subscription status, etc. | **`migrate-stormij.ts`** with `--collection=members` (re-run when Stormij has new members) |
| **Firebase Authentication** | Lets someone **log in** with email/password, Google, etc. | Users must exist in **this** EchoFlux Firebase project |

Migrating **members** copies **data** into Firestore. It does **not** automatically create **Firebase Auth** accounts for people who only existed in the **Stormij** Firebase project.

So:

- **They do not need to “pay again” or join membership again** if you migrate `members` and preserve Stripe/subscription fields where applicable.
- **They may still need a login** in the EchoFlux project unless their **Auth user** was created or imported.

---

## What you want (no unnecessary signup)

### 1) Keep Firestore in sync (new fans on Stormij)

Run **`migrate-stormij`** targeting **members** whenever Stormij has new members (dry-run first):

```bash
npm run migrate:stormij:dry -- --creator-id=ZY2JlmlsNmNkAe0LdRXYycDvHSi2 --collection=members
```

Then run the real migration (see **`docs/STORMIJ_MIGRATION.md`** for two service accounts + env).

Then:

```bash
npm run backfill:fan-hub -- --creator-id=ZY2JlmlsNmNkAe0LdRXYycDvHSi2
```

### 2) So they don’t need a *new* account (Auth)

Pick **one** approach (often combined):

#### A) **Firebase Auth: import users from Stormij → EchoFlux** (best for “same email, same login”)

Google supports exporting users from one project and importing into another (password hashes, emails). This is the closest to “they don’t have to do anything” for **password-based** accounts.

- **Docs:** [Firebase Auth – import users](https://firebase.google.com/docs/auth/admin/import-users)  
- Run in **Stormij** project: export users (CSV/JSON per Firebase tooling).  
- Run in **EchoFlux** project: import users **before** or **after** you align Firestore `fans` doc IDs with `uid`.

**Important:** `migrate-stormij` writes `fans` docs with id `uid || userId || doc.id` from Stormij. After Auth import, **EchoFlux UIDs** might differ from Stormij UIDs unless you use import options that preserve UID mapping (follow Firebase import docs carefully). If UIDs change, you may need a one-time **re-key** of `fans` subcollection doc ids to match new Auth UIDs (separate ops task).

#### B) **Fans already signed up on EchoFlux** (same email)

If a fan already created an EchoFlux account with the **same email** as Stormij, `getUserByEmail` matches them. You only need Firestore `fans` to use the **same `fanId` = Auth uid** as the doc id.

#### C) **Email link / password reset** (minimal friction)

If you create Auth users with Admin SDK **without** a password, you typically send a **password reset** or **sign-in link** email once. That’s not “full signup”, but it’s one email tap.

---

## See who’s missing Auth (report script)

Run this against **EchoFlux** (`echoflux-service-account.json`):

```bash
npm run report:fans-missing-auth -- --creator-id=ZY2JlmlsNmNkAe0LdRXYycDvHSi2
```

It prints fan emails whose **`fans` doc id** (or `uid` field) doesn’t correspond to an existing Auth user, or emails with no Auth user — use this to drive **import** or **outreach**.

---

## Summary

- **“Don’t make them join again” (membership):** keep running **`members` migration** + backfill + correct Stripe metadata where needed.  
- **“Don’t make them create a new account”:** migrate **Firebase Auth** users (import) or align UIDs and Firestore doc ids, then use **password reset / link** only if needed.

If you tell us whether Stormij users are **email/password** or **Google-only**, we can narrow the exact Firebase import path.
