# Rewards / Grants System (Admin)

This document explains how rewards work, what each grant button does, and how **promo cohort grants** work (reward only users who upgraded during a time window).

## Where rewards are applied

Rewards are applied by **Admin-only API endpoints** and update user documents in Firestore.

The primary effect types:

- **Storage Boost (GB)**: increases `users/{userId}.storageLimit` by `GB * 1024` (stored in MB).
- **Extra AI Generations**: reduces `users/{userId}.monthlyCaptionGenerationsUsed` (effectively giving more remaining).
- **Free Month(s)**: extends `subscriptionEndDate` or upgrades Free → Pro and sets `subscriptionEndDate`.

All manual grants are appended to `users/{userId}.manualReferralRewards` for audit/history.

## Admin Dashboard locations

### 1) Individual grants (per user)

Location:
- **Admin Dashboard → Users → Grant Reward** (per-user modal)

Buttons/controls:
- **Reward Type**
  - Extra AI Generations
  - Free Month(s)
  - Storage Boost (GB)
- **Amount**
  - How much to grant
- **Reason**
  - Optional note saved for audit
- **Grant Reward**
  - Calls `POST /api/adminGrantReferralReward`
  - Applies the reward to that single user

### 2) Bulk grants (by plan)

Location:
- **Admin Dashboard → Announcements → Bulk Grants**

Controls:
- **Target Plans**
  - Applies to all users currently on the selected plan(s)
- **Reward**
  - Storage Boost (GB) / Extra AI Generations / Free Month(s)
- **Amount**
  - Value of the reward
- **Reason**
  - Optional note for audit
- **Apply Bulk Grant**
  - Calls `POST /api/adminBulkGrantReward`
  - Applies to all users on those plans (skips Admin users)

## Promo Cohort Grants (reward only users who upgraded during a window)

Location:
- **Admin Dashboard → Announcements → Promo Cohort Grants (upgraded during window)**

This is the feature you asked for:

- You run an announcement like:
  - “Upgrade to Pro by Sunday and get +5GB storage”
- Then you grant only to users who **actually upgraded during that announcement’s time window**.

### How upgrades are tracked

When a paid plan is applied (Stripe webhook or checkout verification), the system writes an upgrade event to:

- **`plan_change_events`**

Each event includes:
- `userId`
- `fromPlan`
- `toPlan`
- `changedAt` (ISO)
- `source` (e.g., `stripe_webhook`, `verify_checkout_session`)

### How cohort grants are deduped (prevent double-granting)

When you run a cohort grant, each awarded user also gets a record:

- **`promo_cohort_grants/{announcementId_userId}`**

If that doc already exists, the user is skipped as “already granted.”

### Cohort grant controls

- **Announcement**
  - Select the announcement that defines the time window.
  - Window rules:
    - Uses announcement `Starts At`
    - Uses announcement `Ends At`
    - If `Ends At` is blank, the system uses “now”

- **Eligible upgraded-to plans**
  - Which destination plans qualify (typically Pro/Elite).
  - This is based on `plan_change_events.toPlan`.

- **Reward / Amount / Reason**
  - Same semantics as other rewards.

- **Grant Cohort Reward**
  - Calls `POST /api/adminGrantPromoCohort`
  - Finds users with a matching plan-change event in the window
  - Grants each user once (dedupe via `promo_cohort_grants`)
  - Returns counts: eligible, granted, skipped already-granted

### Recommended “upgrade promo” playbook

1. Create an **in-app announcement** targeted to Free:
   - Active: ON
   - Banner: ON
   - Public: OFF
   - Target Plans: Free
   - Starts At / Ends At: set your promo window
   - Action Label: “Upgrade”
   - Action Page: Pricing

2. After the promo window ends:
   - Run **Promo Cohort Grants**
   - Select the same announcement
   - Eligible plans: Pro, Elite
   - Reward: Storage Boost (GB)
   - Amount: e.g. 5

3. Optional:
   - Create a follow-up “success” announcement for Pro/Elite users.


