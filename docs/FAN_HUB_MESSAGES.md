# Fan Hub Messages (creator inbox)

## Where Stormij stores DMs vs what EchoFlux reads

| Location | Used by |
|----------|---------|
| Stormij: top-level `conversations/{id}/messages` | Legacy Stormij Firebase only |
| After migration: `creators/{creatorId}/conversations/{id}/messages` | Raw copy in EchoFlux; **Fan Hub still does not read this** |
| **`fanDmThreads/{threadId}/messages`** | **Fan Hub Messages** (`/api/fanDmThreads`, `/api/fanDmMessages`) |

Populate `fanDmThreads` with:

```bash
npm run sync:fan-dm-threads -- --creator-id=YOUR_UID
```

- Default: reads **`creators/{creatorId}/conversations`** (post–`migrate-stormij` layout).
- If your EchoFlux project still has chats only under the **root** collection `conversations` (same shape as Stormij):

```bash
npm run sync:fan-dm-threads -- --creator-id=YOUR_UID --source=root
```

---

DMs are **not** read from Firestore in the browser. The app calls:

| Endpoint | Role |
|----------|------|
| `GET /api/fanDmThreads?as=creator` | List threads (`fanDmThreads` collection) |
| `GET /api/fanDmMessages?threadId=…` | List messages (`fanDmThreads/{id}/messages`) |
| `POST /api/fanDmSend` | Send a reply |
| `POST /api/deleteFanDmThread` | **Creator only** — delete thread + all messages (`body: { threadId }`) |
| `POST /api/deleteFanDmMessage` | **Creator only** — delete one message; refreshes thread preview (`body: { threadId, messageId }`) |

All of these need a valid **Firebase ID token** (`Authorization: Bearer …`) and a working **Firebase Admin** backend (Vercel env: `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64`).

## UI: “Conversations couldn’t load” or “Messages couldn’t load”

The Fan Hub uses `/api/fanDmThreads` and `/api/fanDmMessages`. If those requests fail, the UI now shows the **error** instead of looking like an empty inbox.

## If the list is empty (“No conversations yet”)

1. **New product** — Threads are created when someone **sends the first message** (fan from storefront or creator reply). Placeholder fan rows alone do not create threads.
2. **Stormij import** — Legacy chats may live under `creators/{creatorId}/conversations/...`. Copy them into `fanDmThreads` with:
   ```bash
   npm run sync:fan-dm-threads -- --creator-id=YOUR_UID
   ```
   See `scripts/sync-conversations-to-fanDmThreads.ts`.
3. **Localhost** — Vite does not run `/api` routes. Set `DEV_API_PROXY=https://your-deployment.vercel.app` in `.env.local` and restart `npm run dev`. See `docs/LOCAL_DEV.md`.

## If you see a thread but “No messages in this conversation yet”

- The thread document exists but the **`messages` subcollection** may be empty (e.g. placeholder thread). Send a test reply, or re-run the sync script so messages are copied.
- In Firebase Console, check: `fanDmThreads/{threadId}/messages`.

## If you see “Messages couldn’t load” (amber box)

- **401** — Sign out and sign in again.
- **403 / 404** — Token user is not a participant or thread id mismatch (rare if the thread came from the list).
- **500** — Server error: missing Admin key on **Preview** in Vercel, missing Firestore index (see `firestore.indexes.json` for `fanDmThreads`), or check **Vercel → Functions → Logs**.

## Firestore shape (reference)

- Collection: `fanDmThreads`
- Document id: `sort([creatorId, fanId]).join('_')`
- Subcollection: `messages` with `senderId`, `content`, `createdAt`, optional **`read`** (boolean)

### Read receipts (creator inbox only)

- **`read: true`** on a message means the **fan** has opened the thread and that row was a **creator-sent** message (set when the fan calls `GET /api/fanDmMessages`).
- The **creator** inbox shows **· Read** / **· Unread** on **their own** bubbles only. The storefront **does not** show read receipts to fans.
- **`POST /api/fanDmSend`** sets **`read: false`** on new messages. The creator opening the thread does **not** mark fan messages as read.

### Display labels (fan @handle)

`GET /api/fanDmMessages` returns **`labels: { fan, creator }`** for bubble headers. The server merges **`users/{fanId}`** with **`creators/{creatorId}/fans/{fanId}`** so the fan row shows **`@username`** (or name) even when the global user doc is sparse. Thread list (`GET /api/fanDmThreads?as=creator`) uses the same fan resolution.
