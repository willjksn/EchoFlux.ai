# Fan hub backfill (fan cards + DM threads)

This backfill writes **fan preference** docs and optional **DM thread** placeholders so:

- **Fans** tab (`onlyfans_fan_preferences`) lists the same people as **User Management** (`creators/.../fans`).
- **Chat session** fan dropdown sees the same list.
- **Messages** can show a thread row per member even before the first DM (placeholder thread).

## When to run

1. **After Stormij migration** — `scripts/migrate-stormij.ts` copies members into `creators/{creatorId}/fans` but does **not** create `onlyfans_fan_preferences`. Run this backfill once per creator.
2. **Legacy Stripe subscribers** who joined before the webhook started syncing preferences.

## What to read first (Stormij / Echo parity)

| Doc | Purpose |
|-----|--------|
| [STORMIJ_MIGRATION.md](./STORMIJ_MIGRATION.md) | Service accounts, `migrate-stormij.ts`, member → `fans` field mapping |
| [ECHOFLUX_STORMIJ_UNIFIED_ANALYSIS.md](../ECHOFLUX_STORMIJ_UNIFIED_ANALYSIS.md) | Product parity notes (repo root) |
| [ECHOFLUX_STORMIJ_PARITY_ACTION_PLAN.md](./ECHOFLUX_STORMIJ_PARITY_ACTION_PLAN.md) | Checklist-style parity work |

**We do not have the old Stormijxo repo inside this workspace** — behavior is inferred from migration scripts and these docs. Member **usernames** in Echo come from:

- `creators/.../fans` fields: `username`, `memberUsername`, `handle`, `instagram_handle` (migration writes `username`).
- `users/{fanUid}.username` after the fan claims a global handle (`api/claimMemberUsername.ts`).

User Management merges `users/{fanId}` so the primary label can show `@handle` when the fan doc is missing it.

## Prerequisites

- Node 18+
- Firebase **Admin** service account JSON for **Echo/Echoflux** (same as migration guide: `echoflux-service-account.json` in project root, or set `ECHOFLUX_SERVICE_ACCOUNT`).

## Commands

Dry run (no writes):

```bash
cd c:\Projects\engagesuite.ai
npx ts-node --esm scripts/backfill-fan-hub-preferences.ts --dry-run --creator-id=YOUR_CREATOR_UID
```

Apply backfill:

```bash
npx ts-node --esm scripts/backfill-fan-hub-preferences.ts --creator-id=YOUR_CREATOR_UID
```

Only fan preferences (no `fanDmThreads` rows):

```bash
npx ts-node --esm scripts/backfill-fan-hub-preferences.ts --creator-id=YOUR_CREATOR_UID --skip-threads
```

Optional env default for creator id:

```bash
set ECHOFLUX_CREATOR_ID=YOUR_UID
npx ts-node --esm scripts/backfill-fan-hub-preferences.ts
```

## npm script

```bash
npm run backfill:fan-hub -- --creator-id=YOUR_UID
npm run backfill:fan-hub -- --dry-run --creator-id=YOUR_UID
```

## Implementation note

The script inlines the same logic as `api/_syncFanHubFanPreference.ts` (Node ESM cannot reliably import the API module from `scripts/`). If you change one, update the other.
