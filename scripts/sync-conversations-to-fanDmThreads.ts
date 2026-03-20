/**
 * One-time sync: copy creators/{creatorId}/conversations (Stormij-migrated) into fanDmThreads
 * so Fan Hub Messages shows them.
 *
 * USAGE:
 *   npx ts-node scripts/sync-conversations-to-fanDmThreads.ts --creator-id=YOUR_CREATOR_ID [--dry-run]
 *
 * Requires Firebase Admin (e.g. ECHOFLUX_SERVICE_ACCOUNT or default project).
 */

import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

const ECHOFLUX_SERVICE_ACCOUNT_PATH =
  process.env.ECHOFLUX_SERVICE_ACCOUNT || path.join(__dirname, "echoflux-service-account.json");

function getCreatorId(): string {
  const arg = process.argv.find((a) => a === "--creator-id" || a.startsWith("--creator-id="));
  if (!arg) {
    console.error("Usage: npx ts-node sync-conversations-to-fanDmThreads.ts --creator-id=YOUR_CREATOR_ID [--dry-run]");
    process.exit(1);
  }
  if (arg.startsWith("--creator-id=")) return arg.replace("--creator-id=", "").trim();
  const idx = process.argv.indexOf(arg);
  const next = process.argv[idx + 1];
  if (!next || next.startsWith("--")) {
    console.error("Usage: npx ts-node sync-conversations-to-fanDmThreads.ts --creator-id=YOUR_CREATOR_ID [--dry-run]");
    process.exit(1);
  }
  return next.trim();
}

const dryRun = process.argv.includes("--dry-run");

function getThreadId(creatorId: string, fanId: string): string {
  return [creatorId, fanId].sort().join("_");
}

async function main() {
  const creatorId = getCreatorId();
  if (!fs.existsSync(ECHOFLUX_SERVICE_ACCOUNT_PATH)) {
    console.error("Echoflux service account not found:", ECHOFLUX_SERVICE_ACCOUNT_PATH);
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(ECHOFLUX_SERVICE_ACCOUNT_PATH))) });
  }
  const db = admin.firestore();

  const convRef = db.collection("creators").doc(creatorId).collection("conversations");
  const snapshot = await convRef.get();
  console.log(`Found ${snapshot.size} conversations under creators/${creatorId}/conversations`);

  let threadsCreated = 0;
  let messagesCopied = 0;

  for (const convDoc of snapshot.docs) {
    const data = convDoc.data();
    const fanId = (data.memberUid || convDoc.id) as string;
    if (!fanId) continue;

    const threadId = getThreadId(creatorId, fanId);
    const lastMessageAt = data.lastMessageAt || data.updatedAt || data.createdAt;
    const lastMessagePreview =
      typeof data.lastMessagePreview === "string" ? data.lastMessagePreview.slice(0, 200) : undefined;

    const messagesSnap = await convRef.doc(convDoc.id).collection("messages").orderBy("createdAt", "asc").get();
    let fanHasSentMessage = false;
    let lastTs = lastMessageAt;
    const messageDocs: { id: string; data: Record<string, unknown> }[] = [];

    for (const msgDoc of messagesSnap.docs) {
      const msg = msgDoc.data();
      const senderId =
        (msg.senderId as string) ||
        (msg.sender as string) ||
        (msg.fromMember ? fanId : creatorId) ||
        (msg.memberUid as string);
      if (senderId === fanId) fanHasSentMessage = true;
      const content = (msg.content ?? msg.text ?? "") as string;
      const createdAt = msg.createdAt ?? msg.timestamp ?? msgDoc.id;
      if (createdAt > lastTs) lastTs = createdAt;
      messageDocs.push({
        id: msgDoc.id,
        data: {
          senderId,
          content,
          createdAt,
          reported: msg.reported ?? false,
          reportId: msg.reportId ?? null,
        },
      });
    }

    const threadData = {
      creatorId,
      fanId,
      lastMessageAt: lastTs || new Date().toISOString(),
      lastMessagePreview: lastMessagePreview || null,
      fanHasSentMessage,
      createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: data.updatedAt || admin.firestore.FieldValue.serverTimestamp(),
    };

    if (dryRun) {
      console.log(`  [DRY RUN] Would create thread ${threadId} with ${messageDocs.length} messages`);
      threadsCreated++;
      messagesCopied += messageDocs.length;
      continue;
    }

    const threadRef = db.collection("fanDmThreads").doc(threadId);
    await threadRef.set(threadData, { merge: true });
    threadsCreated++;

    const messagesRef = threadRef.collection("messages");
    for (const { id, data: msgData } of messageDocs) {
      await messagesRef.doc(id).set(msgData, { merge: true });
      messagesCopied++;
    }
  }

  console.log(dryRun ? "[DRY RUN] Would create" : "Created", threadsCreated, "thread(s),", messagesCopied, "message(s).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
