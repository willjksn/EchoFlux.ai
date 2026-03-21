# Fan Hub Messages (creator inbox)

DMs are **not** read from Firestore in the browser. The app calls:

| Endpoint | Role |
|----------|------|
| `GET /api/fanDmThreads?as=creator` | List threads (`fanDmThreads` collection) |
| `GET /api/fanDmMessages?threadId=…` | List messages (`fanDmThreads/{id}/messages`) |
| `POST /api/fanDmSend` | Send a reply |

All of these need a valid **Firebase ID token** (`Authorization: Bearer …`) and a working **Firebase Admin** backend (Vercel env: `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64`).

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
- Subcollection: `messages` with `senderId`, `content`, `createdAt`
