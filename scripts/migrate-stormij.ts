/**
 * Stormij to Echoflux Migration Script
 * 
 * This script copies data from Stormij's Firebase to Echoflux's Firebase.
 * It is READ-ONLY on the Stormij side - no data is modified or deleted.
 * 
 * USAGE (repo uses "type": "module" — use --esm):
 *   npx ts-node --esm scripts/migrate-stormij.ts [--dry-run] [--collection=posts,treats,members]
 *   Or: npm run migrate:stormij:dry -- --creator-id=YOUR_UID
 * 
 * OPTIONS:
 *   --dry-run         Preview what would be migrated without writing
 *   --collection=X    Only migrate specific collections (comma-separated)
 *   --creator-id=X    The Echoflux creator ID to associate data with
 * 
 * REQUIREMENTS:
 *   - Service account JSON for both Firebase projects
 *   - Set environment variables before running
 */

import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM: no __dirname (package.json has "type": "module")
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION - Update these paths before running
// ============================================================================

const PROJECT_ROOT = path.join(__dirname, '..');
const STORMIJ_SERVICE_ACCOUNT_PATH = process.env.STORMIJ_SERVICE_ACCOUNT || path.join(PROJECT_ROOT, 'stormij-service-account.json');
const ECHOFLUX_SERVICE_ACCOUNT_PATH = process.env.ECHOFLUX_SERVICE_ACCOUNT || path.join(PROJECT_ROOT, 'echoflux-service-account.json');

// The Echoflux creator ID (user ID) that will own the migrated data
const ECHOFLUX_CREATOR_ID = process.env.ECHOFLUX_CREATOR_ID || '';
const ECHOFLUX_CREATOR_HANDLE = 'stormijxo'; // The handle for the creator page

// ============================================================================
// COLLECTION MAPPINGS
// ============================================================================

interface MigrationStats {
  collection: string;
  read: number;
  written: number;
  skipped: number;
  errors: string[];
}

const stats: MigrationStats[] = [];

// ============================================================================
// INITIALIZE FIREBASE APPS
// ============================================================================

function initializeApps() {
  // Check if service account files exist
  if (!fs.existsSync(STORMIJ_SERVICE_ACCOUNT_PATH)) {
    console.error(`❌ Stormij service account not found: ${STORMIJ_SERVICE_ACCOUNT_PATH}`);
    console.log('\nTo get the service account:');
    console.log('1. Go to Firebase Console → Stormij project → Project Settings → Service Accounts');
    console.log('2. Click "Generate new private key"');
    console.log('3. Save as stormij-service-account.json in the project root:', PROJECT_ROOT);
    process.exit(1);
  }

  if (!fs.existsSync(ECHOFLUX_SERVICE_ACCOUNT_PATH)) {
    console.error(`❌ Echoflux service account not found: ${ECHOFLUX_SERVICE_ACCOUNT_PATH}`);
    console.log('\nTo get the service account:');
    console.log('1. Go to Firebase Console → Echoflux project → Project Settings → Service Accounts');
    console.log('2. Click "Generate new private key"');
    console.log('3. Save as echoflux-service-account.json in the project root:', PROJECT_ROOT);
    process.exit(1);
  }

  const stormijKey = JSON.parse(fs.readFileSync(STORMIJ_SERVICE_ACCOUNT_PATH, 'utf8')) as admin.ServiceAccount;
  const echofluxKey = JSON.parse(fs.readFileSync(ECHOFLUX_SERVICE_ACCOUNT_PATH, 'utf8')) as admin.ServiceAccount;

  // Initialize Stormij (source) - READ ONLY
  const stormijApp = admin.initializeApp({
    credential: admin.credential.cert(stormijKey),
  }, 'stormij');

  // Initialize Echoflux (destination)
  const echofluxApp = admin.initializeApp({
    credential: admin.credential.cert(echofluxKey),
  }, 'echoflux');

  return {
    stormijDb: stormijApp.firestore(),
    echofluxDb: echofluxApp.firestore(),
  };
}

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

/**
 * Migrate Posts (fanPosts collection)
 */
async function migratePosts(
  stormijDb: admin.firestore.Firestore,
  echofluxDb: admin.firestore.Firestore,
  creatorId: string,
  dryRun: boolean
): Promise<MigrationStats> {
  const stat: MigrationStats = { collection: 'posts', read: 0, written: 0, skipped: 0, errors: [] };
  
  console.log('\n📝 Migrating Posts...');
  
  try {
    // Read from Stormij posts collection
    const snapshot = await stormijDb.collection('posts').get();
    stat.read = snapshot.size;
    console.log(`   Found ${snapshot.size} posts in Stormij`);

    if (dryRun) {
      console.log('   [DRY RUN] Would migrate posts to fanPosts collection');
      stat.skipped = snapshot.size;
      return stat;
    }

    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        
        // Transform to Echoflux fanPosts format
        const echofluxPost = {
          id: doc.id,
          creatorId,
          body: data.body || '',
          mediaUrls: data.mediaUrls || [],
          mediaTypes: data.mediaTypes || [],
          audioUrls: data.audioUrls || [],
          captionStyle: data.captionStyle || 'static',
          overlayText: data.overlayText || '',
          overlayTextColor: data.overlayTextColor || '',
          overlayTextSize: data.overlayTextSize || 18,
          overlayHighlight: data.overlayHighlight || false,
          overlayItalic: data.overlayItalic || false,
          hideComments: data.hideComments || false,
          hideLikes: data.hideLikes || false,
          showTipButton: data.showTipButton !== false,
          poll: data.poll || null,
          tipGoal: data.tipGoal || null,
          lockedContent: data.lockedContent || null,
          status: data.status || 'published',
          calendarDate: data.calendarDate || '',
          calendarTime: data.calendarTime || '',
          scheduledAt: data.scheduledAt || null,
          publishedAt: data.publishedAt || null,
          createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          likeCount: data.likeCount || 0,
          likedBy: data.likedBy || [],
          comments: data.comments || [],
          // Migration metadata
          migratedFrom: 'stormij',
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          originalDocId: doc.id,
        };

        // Write to Echoflux fanPosts collection (under creator's subcollection)
        await echofluxDb
          .collection('creators')
          .doc(creatorId)
          .collection('fanPosts')
          .doc(doc.id)
          .set(echofluxPost);
        
        stat.written++;
        process.stdout.write(`\r   Migrated ${stat.written}/${snapshot.size} posts`);
      } catch (err) {
        stat.errors.push(`Post ${doc.id}: ${err}`);
      }
    }
    console.log(''); // New line after progress
  } catch (err) {
    stat.errors.push(`Failed to read posts: ${err}`);
  }

  return stat;
}

/** Valid `TreatProduct.type` values in EchoFlux (`types.ts`) — used when Stormij already stores `type`. */
const ECHOFLUX_TREAT_PRODUCT_TYPES = new Set<string>([
  'tip',
  'unlock_media',
  'bundle',
  'chat_session',
  'voice_note_30s',
  'voice_note_60s',
  'private_video_reply',
  'birthday_message',
  'overthinking_response',
  'random_checkin',
  'live_chat_5m',
  'live_chat_15m',
  'live_chat_30m',
  'live_chat_45m',
  'live_chat_60m',
  'live_chat_1h',
  'live_video_5m',
  'live_video_10m',
  'live_video_15m',
  'live_video_30m',
  'live_video_45m',
  'live_video_60m',
  'custom',
]);

function strField(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function numField(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Stormij historically used `price` in dollars (4.99) or whole dollars (5). Some docs may use
 * `price` / `priceCents` as integer cents (499). Prefer explicit `priceCents` / `amountCents` when present.
 */
function stormijPriceToCents(data: Record<string, unknown>): number {
  const explicit =
    numField(data.priceCents) ?? numField(data.amountCents) ?? numField(data.priceInCents);
  if (explicit != null && explicit >= 0) return Math.round(explicit);

  const price = numField(data.price);
  if (price == null) return 0;
  // Fractional → dollars (e.g. 4.99 → 499 cents)
  if (!Number.isInteger(price)) return Math.max(0, Math.round(price * 100));
  // Integer: 0–99 → treat as whole dollars (5 → $5.00); 100+ → treat as cents (499 → $4.99)
  if (price >= 0 && price < 100) return Math.max(0, Math.round(price * 100));
  return Math.max(0, Math.round(price));
}

function inferQuantityLimit(data: Record<string, unknown>): number | undefined {
  const lim =
    numField(data.quantityLimit) ??
    numField(data.quantityTotal) ??
    numField(data.totalQuantity) ??
    numField(data.maxQuantity);
  if (lim == null || lim < 0) return undefined;
  return Math.round(lim);
}

function inferSoldCount(data: Record<string, unknown>, quantityLimit?: number): number {
  const explicit =
    numField(data.soldCount) ?? numField(data.sold) ?? numField(data.quantitySold);
  if (explicit != null && explicit >= 0) return Math.round(explicit);
  const total = numField(data.quantityTotal) ?? numField(data.totalQuantity);
  const left = numField(data.quantityLeft) ?? numField(data.remaining);
  if (total != null && left != null && total >= left) return Math.round(total - left);
  if (quantityLimit != null && left != null && quantityLimit >= left) {
    return Math.round(quantityLimit - left);
  }
  return 0;
}

function normalizeTreatType(raw: unknown, docId: string, title: string): string {
  if (typeof raw === 'string' && ECHOFLUX_TREAT_PRODUCT_TYPES.has(raw)) return raw;
  return mapTreatType(docId, title);
}

function coerceFirestoreTime(
  v: unknown
): admin.firestore.Timestamp | admin.firestore.FieldValue {
  if (v == null) return admin.firestore.FieldValue.serverTimestamp();
  if (v instanceof admin.firestore.Timestamp) return v;
  try {
    if (typeof (v as { toDate?: () => Date }).toDate === 'function') {
      const d = (v as { toDate: () => Date }).toDate();
      if (d && !isNaN(d.getTime())) return admin.firestore.Timestamp.fromDate(d);
    }
  } catch {
    /* ignore */
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return admin.firestore.Timestamp.fromDate(d);
  }
  return admin.firestore.FieldValue.serverTimestamp();
}

/**
 * Migrate Treats → EchoFlux `products/{docId}` (schema: `api/products.ts`, `types.TreatProduct`).
 */
async function migrateTreats(
  stormijDb: admin.firestore.Firestore,
  echofluxDb: admin.firestore.Firestore,
  creatorId: string,
  dryRun: boolean
): Promise<MigrationStats> {
  const stat: MigrationStats = { collection: 'treats', read: 0, written: 0, skipped: 0, errors: [] };
  
  console.log('\n🎁 Migrating Treats...');
  
  try {
    const snapshot = await stormijDb.collection('treats').get();
    stat.read = snapshot.size;
    console.log(`   Found ${snapshot.size} treats in Stormij`);

    if (dryRun) {
      if (snapshot.docs.length > 0) {
        const sample = snapshot.docs[0];
        const keys = Object.keys(sample.data() || {}).sort();
        console.log(`   [DRY RUN] Sample doc "${sample.id}" fields: ${keys.join(', ')}`);
      }
      console.log('   [DRY RUN] Would write to EchoFlux collection `products` with title, priceCents, visible, sortOrder, …');
      stat.skipped = snapshot.size;
      return stat;
    }

    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        const title =
          strField(data.title) ||
          strField(data.name) ||
          strField(data.label) ||
          'Untitled treat';
        const description =
          strField(data.description) || strField(data.body) || undefined;

        const visible =
          typeof data.visible === 'boolean'
            ? data.visible
            : data.hidden === true || data.isHidden === true
              ? false
              : data.active === false
                ? false
                : true;

        const archived = !!(data.archived || data.deleted || data.isArchived);

        const sortOrder =
          numField(data.sortOrder) ??
          numField(data.order) ??
          numField(data.position) ??
          0;

        const quantityLimit = inferQuantityLimit(data);
        const soldCount = inferSoldCount(data, quantityLimit);

        const mediaUrl =
          strField(data.mediaUrl) ||
          strField(data.media) ||
          strField(data.videoUrl) ||
          undefined;
        const imageUrl =
          strField(data.imageUrl) ||
          strField(data.image) ||
          strField(data.thumbnailUrl) ||
          strField(data.photoUrl) ||
          undefined;

        const durationMinutes =
          numField(data.durationMinutes) ?? numField(data.duration) ?? undefined;

        const echofluxProduct: Record<string, unknown> = {
          creatorId,
          type: normalizeTreatType(data.type, doc.id, title),
          title,
          description: description ?? null,
          priceCents: stormijPriceToCents(data),
          mediaUrl: mediaUrl ?? null,
          imageUrl: imageUrl ?? null,
          archived,
          visible,
          sortOrder: Math.round(sortOrder),
          soldCount,
          createdAt: coerceFirestoreTime(data.createdAt ?? data.created),
          updatedAt: coerceFirestoreTime(data.updatedAt ?? data.updated),
          migratedFrom: 'stormij',
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          originalDocId: doc.id,
        };

        if (quantityLimit !== undefined) echofluxProduct.quantityLimit = quantityLimit;
        if (durationMinutes != null && durationMinutes > 0) {
          echofluxProduct.durationMinutes = durationMinutes;
        }

        await echofluxDb.collection('products').doc(doc.id).set(echofluxProduct);
        stat.written++;
        process.stdout.write(`\r   Migrated ${stat.written}/${snapshot.size} treats`);
      } catch (err) {
        stat.errors.push(`Treat ${doc.id}: ${err}`);
      }
    }
    console.log('');
  } catch (err) {
    stat.errors.push(`Failed to read treats: ${err}`);
  }

  return stat;
}

/**
 * Map Stormij treat ID/name to Echoflux product type (when `type` field missing or unknown).
 */
function mapTreatType(id: string, name: string): string {
  const idLower = (id || '').toLowerCase();
  const nameLower = (name || '').toLowerCase();
  
  if (idLower.includes('voice-30') || nameLower.includes('30-second voice')) return 'voice_note_30s';
  if (idLower.includes('voice-60') || nameLower.includes('60-second voice')) return 'voice_note_60s';
  if (idLower.includes('video-reply') || nameLower.includes('video reply')) return 'private_video_reply';
  if (idLower.includes('birthday') || nameLower.includes('birthday')) return 'birthday_message';
  if (idLower.includes('overthinking') || nameLower.includes('overthinking')) return 'overthinking_response';
  if (idLower.includes('check-in') || nameLower.includes('check-in')) return 'random_checkin';
  if (idLower.includes('chat-session-15') || nameLower.includes('15-min')) return 'live_chat_15m';
  if (idLower.includes('chat-session-30') || nameLower.includes('30-min')) return 'live_chat_30m';
  if (idLower.includes('chat-session-45') || nameLower.includes('45-min')) return 'live_chat_45m';
  if (idLower.includes('chat-session-60') || nameLower.includes('1-hour')) return 'live_chat_1h';
  if (nameLower.includes('live video') && nameLower.includes('5')) return 'live_video_5m';
  if (nameLower.includes('live video') && nameLower.includes('10')) return 'live_video_10m';
  if (nameLower.includes('live video') && nameLower.includes('15')) return 'live_video_15m';
  if (nameLower.includes('live video') && nameLower.includes('30')) return 'live_video_30m';
  return 'custom';
}

/**
 * Migrate Members (subscribers)
 */
async function migrateMembers(
  stormijDb: admin.firestore.Firestore,
  echofluxDb: admin.firestore.Firestore,
  creatorId: string,
  dryRun: boolean
): Promise<MigrationStats> {
  const stat: MigrationStats = { collection: 'members', read: 0, written: 0, skipped: 0, errors: [] };
  
  console.log('\n👥 Migrating Members...');
  
  try {
    const snapshot = await stormijDb.collection('members').get();
    stat.read = snapshot.size;
    console.log(`   Found ${snapshot.size} members in Stormij`);

    if (dryRun) {
      console.log('   [DRY RUN] Would migrate members');
      stat.skipped = snapshot.size;
      return stat;
    }

    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();

        const usernameRaw =
          (typeof data.username === 'string' && data.username.trim()) ||
          (typeof data.handle === 'string' && data.handle.trim()) ||
          (typeof data.instagram_handle === 'string' && data.instagram_handle.trim()) ||
          (typeof data.instagramHandle === 'string' && data.instagramHandle.trim()) ||
          (typeof data.memberUsername === 'string' && data.memberUsername.trim()) ||
          '';
        const username = usernameRaw ? usernameRaw.replace(/^@/, '').toLowerCase() : null;

        const roleLower = String(
          data.role || data.userRole || data.user_role || data.memberRole || data.member_role || ''
        ).toLowerCase();
        let role: 'admin' | 'tipper' | 'member' | undefined =
          roleLower === 'admin' ||
          roleLower === 'administrator' ||
          roleLower === 'owner' ||
          roleLower === 'moderator' ||
          data.isAdmin === true ||
          data.is_admin === true
            ? 'admin'
            : roleLower === 'tipper'
              ? 'tipper'
              : roleLower === 'member'
                ? 'member'
                : undefined;
        if (!role) {
          const access = String(data.accessLevel || data.access_level || '').toLowerCase();
          if (access === 'admin') role = 'admin';
        }
        if (!role && Array.isArray(data.permissions)) {
          for (const p of data.permissions) {
            const ps = String(p).toLowerCase();
            if (ps === 'admin' || ps === 'administrator') {
              role = 'admin';
              break;
            }
          }
        }

        const statusStr = String(
          data.subscriptionStatus || data.subscription_status || data.status || data.planStatus || ''
        ).toLowerCase();
        const cancelAtEnd = data.cancelAtPeriodEnd === true || data.cancel_at_period_end === true;
        let subscriptionStatus = 'active';
        if (statusStr.includes('cancel') || statusStr === 'canceled' || statusStr === 'cancelled' || data.cancelled === true || data.canceled === true) {
          subscriptionStatus = 'canceled';
        } else if (statusStr.includes('past_due')) {
          subscriptionStatus = 'past_due';
        } else if (statusStr.includes('trialing')) {
          subscriptionStatus = 'trialing';
        } else if (statusStr.includes('active')) {
          subscriptionStatus = 'active';
        } else if (statusStr) {
          subscriptionStatus = statusStr;
        }
        if (cancelAtEnd && subscriptionStatus !== 'canceled') {
          subscriptionStatus = 'active';
        }

        const periodEnd = data.subscriptionCurrentPeriodEnd || data.current_period_end || data.currentPeriodEnd || null;

        // Preserve original join/signup time — do not use serverTimestamp() unless no date exists on Stormij
        // (serverTimestamp() would make every fan look like they signed up on migration day).
        const joinedAt =
          data.createdAt ||
          data.joinedAt ||
          data.subscribedAt ||
          data.signupAt ||
          data.signupDate ||
          data.memberSince ||
          data.created_at ||
          data.joined_at ||
          data.subscribed_at ||
          admin.firestore.FieldValue.serverTimestamp();
        const echofluxMember: Record<string, unknown> = {
          id: doc.id,
          creatorId,
          email: data.email || null,
          displayName: data.displayName || data.name || data.note || null,
          username,
          uid: data.uid || data.userId || null,
          subscriptionStatus,
          subscribedAt: joinedAt,
          createdAt: joinedAt,
          cancelAtPeriodEnd: cancelAtEnd,
          ...(periodEnd != null ? { subscriptionCurrentPeriodEnd: periodEnd } : {}),
          ...(role ? { role } : {}),
          // Migration metadata
          migratedFrom: 'stormij',
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          originalDocId: doc.id,
        };

        const fanDocId = (data.uid || data.userId || doc.id) as string;
        await echofluxDb
          .collection('creators')
          .doc(creatorId)
          .collection('fans')
          .doc(fanDocId)
          .set(echofluxMember);
        
        stat.written++;
        process.stdout.write(`\r   Migrated ${stat.written}/${snapshot.size} members`);
      } catch (err) {
        stat.errors.push(`Member ${doc.id}: ${err}`);
      }
    }
    console.log('');
  } catch (err) {
    stat.errors.push(`Failed to read members: ${err}`);
  }

  return stat;
}

/** Best-effort fan Firebase UID from Stormij purchase doc (for grants backfill). */
function inferFanIdFromStormijPurchase(data: Record<string, unknown>): string | null {
  const candidates = [
    data.uid,
    data.userId,
    data.fanId,
    data.memberUid,
    data.customerId,
    data.memberId,
    data.firebaseUid,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c.trim();
  }
  return null;
}

/**
 * Migrate Purchases (transaction history)
 */
async function migratePurchases(
  stormijDb: admin.firestore.Firestore,
  echofluxDb: admin.firestore.Firestore,
  creatorId: string,
  dryRun: boolean
): Promise<MigrationStats> {
  const stat: MigrationStats = { collection: 'purchases', read: 0, written: 0, skipped: 0, errors: [] };
  
  console.log('\n💳 Migrating Purchases...');
  
  try {
    const snapshot = await stormijDb.collection('purchases').get();
    stat.read = snapshot.size;
    console.log(`   Found ${snapshot.size} purchases in Stormij`);

    if (dryRun) {
      console.log('   [DRY RUN] Would migrate purchases (includes fanId when present on Stormij docs)');
      stat.skipped = snapshot.size;
      return stat;
    }

    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        const stormijCreator =
          typeof data.creatorId === 'string' ? data.creatorId.trim() : '';
        if (stormijCreator && stormijCreator !== creatorId) {
          stat.skipped++;
          continue;
        }

        const fanId = inferFanIdFromStormijPurchase(data);
        const treatId =
          (typeof data.treatId === 'string' && data.treatId.trim()) ||
          (typeof data.productId === 'string' && data.productId.trim()) ||
          null;

        const echofluxPurchase = {
          id: doc.id,
          creatorId,
          email: data.email || null,
          productName: data.productName || null,
          treatId,
          amountCents: data.amountCents || 0,
          purchasedAt: data.createdAt || data.purchasedAt || null,
          scheduleStatus: data.scheduleStatus || 'pending',
          scheduledDate: data.scheduledDate || null,
          scheduledTime: data.scheduledTime || null,
          scheduledAt: data.scheduledAt || null,
          ...(fanId ? { fanId } : {}),
          // Migration metadata
          migratedFrom: 'stormij',
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          originalDocId: doc.id,
        };

        await echofluxDb.collection('purchases').doc(doc.id).set(echofluxPurchase);
        stat.written++;
        process.stdout.write(`\r   Migrated ${stat.written}/${snapshot.size} purchases`);
      } catch (err) {
        stat.errors.push(`Purchase ${doc.id}: ${err}`);
      }
    }
    console.log('');
  } catch (err) {
    stat.errors.push(`Failed to read purchases: ${err}`);
  }

  return stat;
}

/**
 * Migrate Conversations (DMs)
 */
async function migrateConversations(
  stormijDb: admin.firestore.Firestore,
  echofluxDb: admin.firestore.Firestore,
  creatorId: string,
  dryRun: boolean
): Promise<MigrationStats> {
  const stat: MigrationStats = { collection: 'conversations', read: 0, written: 0, skipped: 0, errors: [] };
  
  console.log('\n💬 Migrating Conversations...');
  
  try {
    const snapshot = await stormijDb.collection('conversations').get();
    stat.read = snapshot.size;
    console.log(`   Found ${snapshot.size} conversations in Stormij`);

    if (dryRun) {
      console.log('   [DRY RUN] Would migrate conversations and messages');
      stat.skipped = snapshot.size;
      return stat;
    }

    for (const convDoc of snapshot.docs) {
      try {
        const convData = convDoc.data();
        
        // Migrate conversation
        const echofluxConv = {
          id: convDoc.id,
          creatorId,
          memberUid: convData.memberUid || convDoc.id,
          memberEmail: convData.memberEmail || null,
          memberDisplayName: convData.memberDisplayName || null,
          createdAt: convData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: convData.updatedAt || admin.firestore.FieldValue.serverTimestamp(),
          lastMessageAt: convData.lastMessageAt || null,
          lastMessagePreview: convData.lastMessagePreview || null,
          firstMessageFromMember: convData.firstMessageFromMember || null,
          // Migration metadata
          migratedFrom: 'stormij',
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await echofluxDb
          .collection('creators')
          .doc(creatorId)
          .collection('conversations')
          .doc(convDoc.id)
          .set(echofluxConv);

        // Migrate messages in this conversation
        const messagesSnapshot = await stormijDb
          .collection('conversations')
          .doc(convDoc.id)
          .collection('messages')
          .get();

        for (const msgDoc of messagesSnapshot.docs) {
          const msgData = msgDoc.data();
          await echofluxDb
            .collection('creators')
            .doc(creatorId)
            .collection('conversations')
            .doc(convDoc.id)
            .collection('messages')
            .doc(msgDoc.id)
            .set({
              ...msgData,
              migratedFrom: 'stormij',
              migratedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        stat.written++;
        process.stdout.write(`\r   Migrated ${stat.written}/${snapshot.size} conversations`);
      } catch (err) {
        stat.errors.push(`Conversation ${convDoc.id}: ${err}`);
      }
    }
    console.log('');
  } catch (err) {
    stat.errors.push(`Failed to read conversations: ${err}`);
  }

  return stat;
}

/**
 * Migrate Site Config (creator storefront settings)
 */
async function migrateSiteConfig(
  stormijDb: admin.firestore.Firestore,
  echofluxDb: admin.firestore.Firestore,
  creatorId: string,
  dryRun: boolean
): Promise<MigrationStats> {
  const stat: MigrationStats = { collection: 'site_config', read: 0, written: 0, skipped: 0, errors: [] };
  
  console.log('\n⚙️  Migrating Site Config...');
  
  try {
    const configDoc = await stormijDb.collection('site_config').doc('content').get();
    
    if (!configDoc.exists) {
      console.log('   No site config found');
      return stat;
    }
    
    stat.read = 1;
    const data = configDoc.data() || {};

    if (dryRun) {
      console.log('   [DRY RUN] Would migrate site config to creator storefront settings');
      stat.skipped = 1;
      return stat;
    }

    const heroImage =
      (data.heroImageUrl as string) ||
      (data.heroImage as string) ||
      (data.landingHeroImageUrl as string) ||
      (data.memberHeroImageUrl as string) ||
      (data.hero_image as string) ||
      '';
    const displayName =
      (data.displayName as string) || (data.siteTitle as string) || 'Stormi J';
    const bio = (data.bio as string) || (data.tagline as string) || '';
    const avatar = (data.avatarUrl as string) || (data.avatar as string) || (data.logoUrl as string) || '';
    const logo = (data.logoUrl as string) || (data.logo as string) || '';

    // Map to Echoflux creator storefront settings
    const storefrontSettings = {
      handle: ECHOFLUX_CREATOR_HANDLE,
      displayName,
      bio,
      avatar,
      logo,
      heroImage,
      heroTagline: (data.heroTagline as string) || (data.hero_tagline as string) || '',
      heroPromise: (data.heroPromise as string) || (data.hero_promise as string) || 'Your access to the real me',
      theme: {
        primary: '#d4558b',
        background: '#fff2f8',
        text: '#2f1a24',
        textMuted: '#7c5b68',
        border: '#f3dbe5',
        accentHover: '#bc3f74',
        buttonStyle: 'solid',
      },
      socialLinks: {
        instagram: { url: '', show: data.showSocialInstagram !== false },
        facebook: { url: '', show: data.showSocialFacebook !== false },
        x: { url: '', show: data.showSocialX !== false },
        tiktok: { url: '', show: data.showSocialTiktok !== false },
        youtube: { url: '', show: data.showSocialYoutube !== false },
      },
      // Tip page settings from Stormij
      tipPageSettings: {
        heroImageUrl: data.tipPageHeroImageUrl || '',
        heroTitle: data.tipPageHeroTitle || 'Show Your Love',
        heroSubtext: data.tipPageHeroSubtext || 'No minimum — send what you like.',
        heroTitleColor: data.tipPageHeroTitleColor || '#d25288',
        heroSubtextColor: data.tipPageHeroSubtextColor || '#fef0f7',
      },
      // About section
      aboutSettings: {
        imageUrl: data.aboutStormiJImageUrl || '',
        videoUrl: data.aboutStormiJVideoUrl || '',
        text: data.aboutStormiJText || '',
        visible: data.aboutStormiJVisible !== false,
      },
      // Migration metadata
      migratedFrom: 'stormij',
      migratedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await echofluxDb.collection('creators').doc(creatorId).set(storefrontSettings, { merge: true });
    stat.written = 1;
    console.log('   ✓ Migrated site config');
  } catch (err) {
    stat.errors.push(`Failed to migrate site config: ${err}`);
  }

  return stat;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         STORMIJ → ECHOFLUX MIGRATION SCRIPT                    ║');
  console.log('║                                                                 ║');
  console.log('║  This script READS from Stormij and WRITES to Echoflux.        ║');
  console.log('║  Stormij data will NOT be modified or deleted.                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Parse arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const collectionsArg = args.find(a => a.startsWith('--collection='));
  const creatorIdArg = args.find(a => a.startsWith('--creator-id='));
  
  const collectionsToMigrate = collectionsArg 
    ? collectionsArg.split('=')[1].split(',')
    : ['posts', 'treats', 'members', 'purchases', 'conversations', 'site_config'];
  
  const creatorId = creatorIdArg 
    ? creatorIdArg.split('=')[1]
    : ECHOFLUX_CREATOR_ID;

  if (!creatorId) {
    console.error('❌ No creator ID specified!');
    console.log('\nEither:');
    console.log('1. Set ECHOFLUX_CREATOR_ID environment variable');
    console.log('2. Pass --creator-id=YOUR_CREATOR_ID as argument');
    console.log('\nThe creator ID is the Firebase Auth UID of the Echoflux user who will own this data.');
    process.exit(1);
  }

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No data will be written\n');
  }

  console.log(`Creator ID: ${creatorId}`);
  console.log(`Handle: ${ECHOFLUX_CREATOR_HANDLE}`);
  console.log(`Collections: ${collectionsToMigrate.join(', ')}\n`);

  // Initialize Firebase apps
  const { stormijDb, echofluxDb } = initializeApps();
  console.log('✓ Connected to both Firebase projects\n');

  // Run migrations
  if (collectionsToMigrate.includes('site_config')) {
    stats.push(await migrateSiteConfig(stormijDb, echofluxDb, creatorId, dryRun));
  }
  if (collectionsToMigrate.includes('posts')) {
    stats.push(await migratePosts(stormijDb, echofluxDb, creatorId, dryRun));
  }
  if (collectionsToMigrate.includes('treats')) {
    stats.push(await migrateTreats(stormijDb, echofluxDb, creatorId, dryRun));
  }
  if (collectionsToMigrate.includes('members')) {
    stats.push(await migrateMembers(stormijDb, echofluxDb, creatorId, dryRun));
  }
  if (collectionsToMigrate.includes('purchases')) {
    stats.push(await migratePurchases(stormijDb, echofluxDb, creatorId, dryRun));
  }
  if (collectionsToMigrate.includes('conversations')) {
    stats.push(await migrateConversations(stormijDb, echofluxDb, creatorId, dryRun));
  }

  // Print summary
  console.log('\n' + '═'.repeat(60));
  console.log('MIGRATION SUMMARY');
  console.log('═'.repeat(60));
  
  let totalRead = 0, totalWritten = 0, totalSkipped = 0, totalErrors = 0;
  
  for (const s of stats) {
    console.log(`\n${s.collection}:`);
    console.log(`   Read: ${s.read} | Written: ${s.written} | Skipped: ${s.skipped}`);
    if (s.errors.length > 0) {
      console.log(`   Errors: ${s.errors.length}`);
      s.errors.slice(0, 3).forEach(e => console.log(`      - ${e}`));
      if (s.errors.length > 3) console.log(`      ... and ${s.errors.length - 3} more`);
    }
    totalRead += s.read;
    totalWritten += s.written;
    totalSkipped += s.skipped;
    totalErrors += s.errors.length;
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`TOTAL: Read ${totalRead} | Written ${totalWritten} | Skipped ${totalSkipped} | Errors ${totalErrors}`);
  
  if (dryRun) {
    console.log('\n🔍 This was a DRY RUN. Run without --dry-run to actually migrate.');
  } else if (totalErrors === 0) {
    console.log('\n✅ Migration completed successfully!');
    console.log(`\nNext steps:`);
    console.log(`1. Verify data in Echoflux Firebase Console`);
    console.log(`2. If you migrated conversations, copy them into fanDmThreads (Fan Hub + member Messages read this):`);
    console.log(`   npm run sync:fan-dm-threads -- --creator-id=${creatorId}`);
    console.log(`3. If you migrated purchases, merge treat unlocks into entitlements (Your purchases tab reads grants):`);
    console.log(`   npm run backfill:stormij-purchases-to-grants -- --creator-id=${creatorId}`);
    console.log(`   (dry-run: add --dry-run)`);
    console.log(`4. Test the page at echoflux.ai/${ECHOFLUX_CREATOR_HANDLE}`);
    console.log(`5. Hero/avatar: re-run site_config migration if URLs were added in Stormij, or set in My Page`);
  } else {
    console.log('\n⚠️  Migration completed with errors. Review the errors above.');
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
