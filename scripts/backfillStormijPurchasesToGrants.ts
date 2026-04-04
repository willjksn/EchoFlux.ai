/**
 * Merge migrated Stormij purchases into:
 * - creatorEntitlements/{creatorId}/grants/{fanUid} (fan member "Your purchases" tab)
 * - orders/{stormijMig_<purchaseDocId>} (creator Fan Hub → Purchases — reads `orders` via /api/creatorOrders)
 *
 * Top-level `purchases` alone is not used by either UI.
 *
 * Reads EchoFlux `purchases` where creatorId matches. Resolves fanUid like migrate-stormij, else Auth by email.
 * Grant arrayUnion only runs if products/{treatId} exists; orders are still written so the creator dashboard lists the row.
 *
 * Usage (repo "type": "module"):
 *   npm run backfill:stormij-purchases-to-grants -- --creator-id=YOUR_UID [--dry-run]
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

function getCreatorId(): string {
  const arg = process.argv.find((a) => a.startsWith("--creator-id="));
  if (!arg) {
    console.error("Usage: npm run backfill:stormij-purchases-to-grants -- --creator-id=YOUR_UID [--dry-run]");
    process.exit(1);
  }
  return arg.replace("--creator-id=", "").trim();
}

const dryRun = process.argv.includes("--dry-run");

function looksLikeStripeOrPaymentId(s: string): boolean {
  const t = s.trim();
  return /^(cus_|pm_|pi_|sub_|cs_|seti_|req_|ch_)/i.test(t);
}

function inferFanUidFromPurchaseDoc(d: Record<string, unknown>): string | null {
  const candidates = [
    d.fanId,
    d.uid,
    d.userId,
    d.buyerUid,
    d.purchaserUid,
    d.firebaseUid,
    d.memberUid,
    d.customerId,
    d.memberId,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) {
      const v = c.trim();
      if (!looksLikeStripeOrPaymentId(v)) return v;
    }
  }
  return null;
}

/** Same keys as migrate-stormij infers onto `email` (plus any legacy EchoFlux-only fields). */
function inferEmailFromPurchaseDoc(d: Record<string, unknown>): string | null {
  const keys = [
    "email",
    "fanEmail",
    "buyerEmail",
    "customerEmail",
    "userEmail",
    "purchaserEmail",
    "emailAddress",
    "stripeEmail",
    "stripeCustomerEmail",
    "guestEmail",
  ];
  for (const k of keys) {
    const v = d[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  const customer = d.customer;
  if (customer && typeof customer === "object" && customer !== null) {
    const e = (customer as Record<string, unknown>).email;
    if (typeof e === "string" && e.trim().length > 0) return e.trim();
  }
  return null;
}

/**
 * Resolve the fan id used in grants/orders/fans subcollections.
 * Order: Firebase Auth email → users/{uid}.email → creators/.../fans/{docId} where doc id is the
 * email (Fan Hub "add user" uses email as document id) or field email matches.
 */
async function resolveFanIdForPurchase(
  auth: admin.auth.Auth,
  db: admin.firestore.Firestore,
  creatorId: string,
  rawEmail: string,
): Promise<string | null> {
  const trimmed = rawEmail.trim();
  const norm = trimmed.toLowerCase();
  try {
    const u = await auth.getUserByEmail(norm);
    return u.uid;
  } catch {
    /* continue */
  }
  for (const candidate of [norm, trimmed]) {
    try {
      const q = await db.collection("users").where("email", "==", candidate).limit(1).get();
      if (!q.empty) return q.docs[0].id;
    } catch {
      /* missing index */
    }
  }
  const fansCol = db.collection("creators").doc(creatorId).collection("fans");
  for (const docId of [norm, trimmed]) {
    const byId = await fansCol.doc(docId).get();
    if (byId.exists) return docId;
  }
  try {
    for (const candidate of [norm, trimmed]) {
      const q = await fansCol.where("email", "==", candidate).limit(1).get();
      if (!q.empty) return q.docs[0].id;
    }
  } catch {
    /* index */
  }
  return null;
}

function inferTreatIdFromPurchaseDoc(d: Record<string, unknown>): string {
  const candidates = [
    d.treatId,
    d.productId,
    d.treat_id,
    d.product_id,
    d.itemId,
    d.item_id,
    d.sku,
    d.priceId,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  return "";
}

function purchaseCreatedAtToIso(purchasedAt: unknown): string {
  if (purchasedAt == null) return new Date().toISOString();
  if (typeof (purchasedAt as { toDate?: () => Date }).toDate === "function") {
    return (purchasedAt as { toDate: () => Date }).toDate().toISOString();
  }
  if (purchasedAt instanceof Date) return purchasedAt.toISOString();
  if (typeof purchasedAt === "string") {
    const t = Date.parse(purchasedAt);
    return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
  }
  if (typeof purchasedAt === "number" && Number.isFinite(purchasedAt)) {
    const ms = purchasedAt < 1e12 ? purchasedAt * 1000 : purchasedAt;
    return new Date(ms).toISOString();
  }
  return new Date().toISOString();
}

function orderDocIdForMigratedPurchase(purchaseDocId: string): string {
  const safe = purchaseDocId.replace(/\//g, "_");
  return `stormijMig_${safe}`;
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
  const auth = admin.auth();

  const snap = await db.collection("purchases").where("creatorId", "==", creatorId).get();
  console.log(`Found ${snap.size} purchase doc(s) with creatorId=${creatorId}`);

  let mergedGrants = 0;
  let mergedOrders = 0;
  let skipped = 0;
  const FieldValue = admin.firestore.FieldValue;

  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const migratedFrom = d.migratedFrom;
    if (migratedFrom !== undefined && migratedFrom !== "stormij") {
      skipped++;
      continue;
    }

    const treatId = inferTreatIdFromPurchaseDoc(d);
    if (!treatId) {
      console.warn(`  Skip ${doc.id}: no treatId/productId`);
      skipped++;
      continue;
    }

    let fanUid = inferFanUidFromPurchaseDoc(d);

    const lookupEmail = inferEmailFromPurchaseDoc(d);
    if (!fanUid && lookupEmail) {
      fanUid = await resolveFanIdForPurchase(auth, db, creatorId, lookupEmail);
      if (!fanUid) {
        console.warn(
          `  Skip ${doc.id}: could not match purchase email to Auth, users/, or creators/.../fans (set purchase.fanId to the id used under creators/.../fans)`
        );
        skipped++;
        continue;
      }
    }

    if (!fanUid) {
      console.warn(
        `  Skip ${doc.id}: cannot resolve fan UID (set fanId/uid on purchase or buyer email on purchase + matching EchoFlux Auth user)`
      );
      skipped++;
      continue;
    }

    const productSnap = await db.collection("products").doc(treatId).get();
    const productExists = productSnap.exists;
    if (!productExists) {
      console.warn(
        `  ${doc.id}: product ${treatId} not in products/ — skipping grant (fan "Your purchases" needs a matching product doc); still writing creator order`
      );
    }

    const grantRef = db.collection("creatorEntitlements").doc(creatorId).collection("grants").doc(fanUid);

    const purchasedAtRaw = d.purchasedAt ?? d.purchased_at ?? d.createdAt ?? d.created_at;
    const createdAtIso = purchaseCreatedAtToIso(purchasedAtRaw);
    const productTitleFromCatalog =
      productExists && typeof (productSnap.data() as { title?: string })?.title === "string"
        ? String((productSnap.data() as { title: string }).title).trim()
        : "";
    const productTitle =
      productTitleFromCatalog ||
      (typeof d.productName === "string" && d.productName.trim()) ||
      treatId;
    const fanEmail = lookupEmail;
    let fanName: string | null = null;
    try {
      const uSnap = await db.collection("users").doc(fanUid).get();
      const ud = uSnap.data() as { displayName?: string; username?: string } | undefined;
      const dn = typeof ud?.displayName === "string" ? ud.displayName.trim() : "";
      const un = typeof ud?.username === "string" ? ud.username.trim() : "";
      fanName = dn || (un ? `@${un}` : null);
    } catch {
      /* ignore */
    }

    const orderRef = db.collection("orders").doc(orderDocIdForMigratedPurchase(doc.id));
    const orderPayload = {
      creatorId,
      fanId: fanUid,
      productId: treatId,
      productTitle,
      type: "product" as const,
      amountCents: typeof d.amountCents === "number" && Number.isFinite(d.amountCents) ? d.amountCents : 0,
      status: "paid",
      fanEmail,
      fanName,
      scheduleStatus: (typeof d.scheduleStatus === "string" && d.scheduleStatus) || "pending",
      scheduledDate: (typeof d.scheduledDate === "string" && d.scheduledDate) || null,
      scheduledTime: (typeof d.scheduledTime === "string" && d.scheduledTime) || null,
      createdAt: createdAtIso,
      migratedFrom: "stormij",
      migratedPurchaseDocId: doc.id,
    };

    if (dryRun) {
      if (productExists) console.log(`  [DRY RUN] Would arrayUnion "${treatId}" on grants/${fanUid}`);
      console.log(`  [DRY RUN] Would set orders/${orderRef.id}`);
      if (productExists) mergedGrants++;
      mergedOrders++;
      continue;
    }

    if (productExists) {
      await grantRef.set(
        {
          unlockedProductIds: FieldValue.arrayUnion(treatId),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      mergedGrants++;
      console.log(`  Grant: ${treatId} → grants/${fanUid}`);
    }

    await orderRef.set(orderPayload, { merge: true });
    mergedOrders++;
    console.log(`  Order: orders/${orderRef.id}`);
  }

  console.log(
    dryRun
      ? `[DRY RUN] Would update grants ${mergedGrants}, orders ${mergedOrders}, skipped ${skipped}`
      : `Done. Grants ${mergedGrants}, orders ${mergedOrders}, skipped ${skipped}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
