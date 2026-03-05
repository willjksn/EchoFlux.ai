# Fan DMs and safety (Firestore + security)

Fan–creator DMs, report message, block fan, and bans are implemented via **server-only APIs**. All reads/writes use Firebase Admin SDK in API routes, so **no client Firestore rules are required** for `fanDmThreads`, `creatorBlocks`, or `reports`; the default deny rule is sufficient.

---

## Collections

| Collection | Purpose |
|------------|---------|
| **fanDmThreads** | One doc per creator–fan pair. Fields: `creatorId`, `fanId`, `lastMessageAt`, `lastMessagePreview`, `createdAt`, `updatedAt`. Doc ID = `[creatorId, fanId].sort().join('_')`. |
| **fanDmThreads/{threadId}/messages** | Messages in the thread. Fields: `senderId`, `content`, `createdAt`, `reported`, `reportId`. |
| **creatorBlocks/{creatorId}/blocked/{fanId}** | Block list; doc exists = fan is banned (cannot message or purchase). |
| **reports** | Admin review queue. Fields: `creatorId`, `fanId`, `threadId`, `messageId`, `reporterId`, `reason`, `status` (pending \| reviewed \| dismissed), `createdAt`, `reviewedAt`, `reviewedBy`. |

---

## Security rule recommendations

- **Current:** All access is server-side (Admin SDK). No client rules needed; default deny is correct.
- **If you later allow client read/write (e.g. real-time listeners):**
  - **fanDmThreads:** Allow read if `request.auth.uid == resource.data.creatorId || request.auth.uid == resource.data.fanId`. Allow create/update only from server (or with careful validation that uid is creator or fan and thread id matches).
  - **fanDmThreads/{id}/messages:** Allow read if auth uid is creator or fan of parent thread; allow create only if auth uid is creator or fan and `senderId == request.auth.uid`.
  - **creatorBlocks/{creatorId}/blocked:** Allow read for creatorId (creator sees own block list); allow write only for `request.auth.uid == creatorId` (creator can block/unblock).
  - **reports:** Allow read/write only for admins; or allow create for authenticated users with validated `threadId`/`messageId`/`reporterId`, and read/update only for admins.

---

## Indexes (see also firestore.indexes.json)

1. **fanDmThreads**  
   - `creatorId` (ASC), `lastMessageAt` (DESC) — for creator inbox list.  
   - `fanId` (ASC), `lastMessageAt` (DESC) — for fan thread list.

2. **fanDmThreads/{threadId}/messages**  
   - Single field `createdAt` (ASC or DESC) is enough for `orderBy("createdAt", "asc")` (default single-field index).

---

## APIs and rate limits

| Endpoint | Rate limit (Upstash) | Notes |
|----------|----------------------|--------|
| **fanDmSend** | 30 / min per user | Enforces ban (blocked fans get 403). |
| **reportMessage** | 10 / hour per user | Creates report doc and sets message.reported. |
| **blockFan** | — | Creator only. |
| **purchaseProduct** | — | Returns 403 if fan is blocked. |

---

## Admin: reports review

Reports are stored in **reports** with `status: 'pending'`. To build an admin UI:

- List: query `reports` where `status == 'pending'` (add composite index if needed).
- Update status: set `status` to `reviewed` or `dismissed`, and `reviewedAt`, `reviewedBy` (admin uid).

No API is provided in this change; add e.g. `api/adminListReports.ts` and `api/adminUpdateReport.ts` when needed.
