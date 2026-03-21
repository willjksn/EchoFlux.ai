# Fan Hub notifications (bell)

## Storage

- **Inbox (per user):** `users/{firebaseUid}/notifications/{id}`
- **Global log (admin / analytics):** `fan_notifications/{autoId}` (written alongside inbox by `sendFanNotification` in `api/_fanNotifications.ts`)

Both **creators** (Fan Hub `/fan`) and **members** (storefront member view) use the **same** inbox path for their Firebase Auth `uid`.

## UI

| Surface | Component |
|--------|-----------|
| Creator Fan Hub tabs | `FanHubNotificationBell` in `PremiumStudioLayout` (right of tab row) |
| Member storefront header | `FanHubNotificationBell` in `FanStorefrontView` (next to Cancel membership) |

The bell listens with `onSnapshot` on `users/{uid}/notifications` ordered by `createdAt` (ISO strings or Timestamps). Users can **mark read** / **mark all read** (client `updateDoc`).

## When notifications are created

- **DMs:** `api/fanDmSend.ts` calls `sendFanNotification` for the **other** participant (`new_message`).
- **Video chat:** `api/liveVideoChat.ts` uses `sendFanNotification` for fan-facing events.

Add more call sites by importing `sendFanNotification` from `api/_fanNotifications.ts` (server-side only).

## Firestore rules

Under `users/{userId}`, the recursive subcollection rule allows the signed-in owner to read/write their own subcollections, including `notifications`. Server writes use the Admin SDK and bypass rules.

## Legacy Stormij data

If old notifications lived in another collection in the Stormij project, run a one-off script to copy them into `users/{uid}/notifications` with fields: `title`, `body`, `read`, `createdAt` (ISO string), `type`, `fanId` (recipient uid).

## Local dev

Same as other `/api` routes: `fanDmSend` must hit a deployment with Admin credentials (e.g. `DEV_API_PROXY`) for DM-triggered notifications to persist.
