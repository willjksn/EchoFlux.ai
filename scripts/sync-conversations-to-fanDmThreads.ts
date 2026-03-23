/**
 * One-time sync: copy Stormij-shaped DM threads into `fanDmThreads` so Fan Hub Messages can read them.
 *
 * Stormij stores chats as:
 *   - Top-level `conversations/{convId}/messages/{msgId}` (source Stormij project), OR
 *   - After `migrate-stormij.ts`: `creators/{creatorId}/conversations/...` (EchoFlux project).
 *
 * Fan Hub **only** reads `fanDmThreads/{sortedCreatorFanId}` — it does **not** query `conversations`.
 *
 * USAGE (repo has "type": "module"):
 *   npm run sync:fan-dm-threads -- --creator-id=YOUR_CREATOR_ID [--dry-run]
 *
 * If your EchoFlux Firestore still has the legacy **root** collection `conversations` (not under creators):
 *   npm run sync:fan-dm-threads -- --creator-id=YOUR_CREATOR_ID --source=root
 */

import admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..");

const ECHOFLUX_SERVICE_ACCOUNT_PATH =
  process.env.ECHOFLUX_SERVICE_ACCOUNT || path.join(PROJECT_ROOT, "echoflux-service-account.json");

function toIso(v: unknown): string {
  if (v == null) return new Date().toISOString();
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
  }
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (v instanceof Date) return v.toISOString();
  return new Date().toISOString();
}

function getCreatorId(): string {
  const arg = process.argv.find((a) => a === "--creator-id" || a.startsWith("--creator-id="));
  if (!arg) {
    console.error("Usage: npm run sync:fan-dm-threads -- --creator-id=YOUR_CREATOR_ID [--dry-run]");
    process.exit(1);
  }
  if (arg.startsWith("--creator-id=")) return arg.replace("--creator-id=", "").trim();
  const idx = process.argv.indexOf(arg);
  const next = process.argv[idx + 1];
  if (!next || next.startsWith("--")) {
    console.error("Usage: npm run sync:fan-dm-threads -- --creator-id=YOUR_CREATOR_ID [--dry-run]");
    process.exit(1);
  }
  return next.trim();
}

const dryRun = process.argv.includes("--dry-run");

/** Read `conversations` at DB root (Stormij shape) instead of `creators/{id}/conversations`. */
const sourceRoot = process.argv.some((a) => a === "--source=root" || a === "--from-stormij-root");

function getThreadId(creatorId: string, fanId: string): string {
  return [creatorId, fanId].sort().join("_");
}

async function main() {
  const creatorId = getCreatorId();
  if (!fs.existsSync(ECHOFLUX_SERVICE_ACCOUNT_PATH)) {
    console.error("Echoflux service account not found:", ECHOFLUX_SERVICE_ACCOUNT_PATH);
    process.exit(1);
  }

  const key = JSON.parse(fs.readFileSync(ECHOFLUX_SERVICE_ACCOUNT_PATH, "utf8")) as admin.ServiceAccount;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(key) });
  }
  const db = admin.firestore();

  const conversationsCol = sourceRoot
    ? db.collection("conversations")
    : db.collection("creators").doc(creatorId).collection("conversations");
  const snapshot = await conversationsCol.get();
  if (sourceRoot) {
    console.log(
      `Found ${snapshot.size} conversations under top-level collection "conversations" (Stormij root). ` +
        `Thread creatorId will be set to --creator-id=${creatorId} for each.`
    );
  } else {
    console.log(`Found ${snapshot.size} conversations under creators/${creatorId}/conversations`);
  }

  let threadsCreated = 0;
  let messagesCopied = 0;

  for (const convDoc of snapshot.docs) {
    const data = convDoc.data();
    if (sourceRoot) {
      const docCreator = data.creatorId as string | undefined;
      if (docCreator && docCreator !== creatorId) {
        continue;
      }
    }
    const fanId = (data.memberUid || convDoc.id) as string;
    if (!fanId) continue;

    const threadId = getThreadId(creatorId, fanId);
    let lastMessageAtIso = toIso(data.lastMessageAt || data.updatedAt || data.createdAt);

    const messagesSnap = await conversationsCol
      .doc(convDoc.id)
      .collection("messages")
      .orderBy("createdAt", "asc")
      .get()
      .catch(async () =>
        // Some legacy rows omit createdAt for ordering — fall back to unsorted get()
        conversationsCol.doc(convDoc.id).collection("messages").get()
      );
    let fanHasSentMessage = false;
    const messageDocs: { id: string; data: Record<string, unknown> }[] = [];

    for (const msgDoc of messagesSnap.docs) {
      const msg = msgDoc.data();
      const senderId =
        (msg.senderId as string) ||
        (msg.sender as string) ||
        (msg.fromMember ? fanId : creatorId) ||
        (msg.memberUid as string) ||
        (msg.userId as string) ||
        (msg.from === "member" || msg.from === "fan" ? fanId : "") ||
        creatorId;
      // Any message not from the creator counts as fan activity (1:1 DM).
      if (senderId === fanId || (senderId && senderId !== creatorId)) fanHasSentMessage = true;
      const content = (msg.content ?? msg.text ?? "") as string;
      const createdAtIso = toIso(msg.createdAt ?? msg.timestamp ?? msgDoc.id);
      const tMsg = new Date(createdAtIso).getTime();
      const tLast = new Date(lastMessageAtIso).getTime();
      if (tMsg > tLast) lastMessageAtIso = createdAtIso;
      messageDocs.push({
        id: msgDoc.id,
        data: {
          senderId,
          content,
          createdAt: createdAtIso,
          reported: msg.reported ?? false,
          reportId: msg.reportId ?? null,
        },
      });
    }

    let lastMessagePreview =
      typeof data.lastMessagePreview === "string" ? data.lastMessagePreview.slice(0, 200) : null;
    if (!lastMessagePreview && messageDocs.length > 0) {
      const last = messageDocs[messageDocs.length - 1];
      const c = (last.data.content as string) || "";
      lastMessagePreview = c ? c.slice(0, 200) : null;
    }

    const threadData = {
      creatorId,
      fanId,
      lastMessageAt: lastMessageAtIso,
      lastMessagePreview,
      fanHasSentMessage: fanHasSentMessage || messageDocs.length > 0,
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt || data.lastMessageAt || data.createdAt),
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

  console.log(
    dryRun ? "[DRY RUN] Would create" : "Created",
    threadsCreated,
    "thread(s),",
    messagesCopied,
    "message(s)."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
