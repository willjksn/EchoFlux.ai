/**
 * Stormij to Echoflux Migration Script
 * 
 * This script copies data from Stormij's Firebase to Echoflux's Firebase.
 * It is READ-ONLY on the Stormij side - no data is modified or deleted.
 * 
 * USAGE:
 *   npx ts-node scripts/migrate-stormij.ts [--dry-run] [--collection=posts,treats,members]
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

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION - Update these paths before running
// ============================================================================

const STORMIJ_SERVICE_ACCOUNT_PATH = process.env.STORMIJ_SERVICE_ACCOUNT || './stormij-service-account.json';
const ECHOFLUX_SERVICE_ACCOUNT_PATH = process.env.ECHOFLUX_SERVICE_ACCOUNT || './echoflux-service-account.json';

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
    console.log('3. Save as stormij-service-account.json in the scripts folder');
    process.exit(1);
  }

  if (!fs.existsSync(ECHOFLUX_SERVICE_ACCOUNT_PATH)) {
    console.error(`❌ Echoflux service account not found: ${ECHOFLUX_SERVICE_ACCOUNT_PATH}`);
    console.log('\nTo get the service account:');
    console.log('1. Go to Firebase Console → Echoflux project → Project Settings → Service Accounts');
    console.log('2. Click "Generate new private key"');
    console.log('3. Save as echoflux-service-account.json in the scripts folder');
    process.exit(1);
  }

  // Initialize Stormij (source) - READ ONLY
  const stormijApp = admin.initializeApp({
    credential: admin.credential.cert(require(path.resolve(STORMIJ_SERVICE_ACCOUNT_PATH))),
  }, 'stormij');

  // Initialize Echoflux (destination)
  const echofluxApp = admin.initializeApp({
    credential: admin.credential.cert(require(path.resolve(ECHOFLUX_SERVICE_ACCOUNT_PATH))),
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

/**
 * Migrate Treats (products collection)
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
      console.log('   [DRY RUN] Would migrate treats to products collection');
      stat.skipped = snapshot.size;
      return stat;
    }

    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        
        // Transform to Echoflux products format
        const echofluxProduct = {
          id: doc.id,
          creatorId,
          name: data.name || '',
          description: data.description || '',
          priceCents: (data.price || 0) * 100, // Convert dollars to cents
          type: mapTreatType(data.id, data.name),
          quantityLeft: data.quantityLeft ?? null,
          quantityTotal: data.quantityLeft ?? null,
          order: data.order || 0,
          hidden: data.hidden || false,
          active: !data.hidden,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          // Migration metadata
          migratedFrom: 'stormij',
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          originalDocId: doc.id,
        };

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
 * Map Stormij treat ID/name to Echoflux product type
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
        
        // Store as fan in Echoflux
        const echofluxMember = {
          id: doc.id,
          creatorId,
          email: data.email || null,
          displayName: data.displayName || data.instagram_handle || data.note || null,
          uid: data.uid || data.userId || null,
          subscriptionStatus: 'active', // Assume active for migration
          subscribedAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          // Migration metadata
          migratedFrom: 'stormij',
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          originalDocId: doc.id,
        };

        await echofluxDb
          .collection('creators')
          .doc(creatorId)
          .collection('fans')
          .doc(doc.id)
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
      console.log('   [DRY RUN] Would migrate purchases');
      stat.skipped = snapshot.size;
      return stat;
    }

    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        
        const echofluxPurchase = {
          id: doc.id,
          creatorId,
          email: data.email || null,
          productName: data.productName || null,
          treatId: data.treatId || null,
          amountCents: data.amountCents || 0,
          purchasedAt: data.createdAt || data.purchasedAt || null,
          scheduleStatus: data.scheduleStatus || 'pending',
          scheduledDate: data.scheduledDate || null,
          scheduledTime: data.scheduledTime || null,
          scheduledAt: data.scheduledAt || null,
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

    // Map to Echoflux creator storefront settings
    const storefrontSettings = {
      handle: ECHOFLUX_CREATOR_HANDLE,
      displayName: 'Stormi J',
      bio: '',
      avatar: '', // Will need to be uploaded separately
      logo: '',
      heroImage: '',
      heroTagline: '',
      heroPromise: 'Your access to the real me',
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
    console.log(`2. Test the page at echoflux.ai/${ECHOFLUX_CREATOR_HANDLE}`);
    console.log(`3. Upload images (avatar, hero, logo) through the Page Builder`);
  } else {
    console.log('\n⚠️  Migration completed with errors. Review the errors above.');
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
