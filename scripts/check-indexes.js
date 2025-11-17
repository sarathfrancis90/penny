#!/usr/bin/env node

/**
 * Check Firestore Index Status
 * 
 * Usage: node scripts/check-indexes.js
 * 
 * This script checks the status of all Firestore indexes
 * and reports which ones are building, enabled, or failed.
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
  path.join(__dirname, '../serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Service account key not found!');
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS or place serviceAccountKey.json in project root');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

/**
 * Check if all required indexes exist by attempting common queries
 */
async function checkIndexes() {
  console.log('🔍 Checking Firestore indexes...\n');

  const indexChecks = [
    {
      name: 'Notifications by user + read status',
      check: async () => {
        const q = db.collection('notifications')
          .where('userId', '==', 'test-user')
          .where('read', '==', false)
          .orderBy('createdAt', 'desc')
          .limit(1);
        await q.get();
      }
    },
    {
      name: 'Expenses by user + date',
      check: async () => {
        const q = db.collection('expenses')
          .where('userId', '==', 'test-user')
          .orderBy('date', 'desc')
          .limit(1);
        await q.get();
      }
    },
    {
      name: 'Expenses by user + category + date',
      check: async () => {
        const q = db.collection('expenses')
          .where('userId', '==', 'test-user')
          .where('category', '==', 'Food')
          .orderBy('date', 'desc')
          .limit(1);
        await q.get();
      }
    },
    {
      name: 'Group expenses by groupId + date',
      check: async () => {
        const q = db.collection('expenses')
          .where('groupId', '==', 'test-group')
          .orderBy('date', 'desc')
          .limit(1);
        await q.get();
      }
    },
    {
      name: 'Conversations by user + status',
      check: async () => {
        const q = db.collection('conversations')
          .where('userId', '==', 'test-user')
          .where('status', '==', 'active')
          .orderBy('updatedAt', 'desc')
          .limit(1);
        await q.get();
      }
    },
    {
      name: 'Personal budgets by user + period',
      check: async () => {
        const q = db.collection('budgets_personal')
          .where('userId', '==', 'test-user')
          .where('period.month', '==', 11)
          .where('period.year', '==', 2025)
          .limit(1);
        await q.get();
      }
    },
    {
      name: 'Group budgets by groupId + period',
      check: async () => {
        const q = db.collection('budgets_group')
          .where('groupId', '==', 'test-group')
          .where('period.month', '==', 11)
          .where('period.year', '==', 2025)
          .limit(1);
        await q.get();
      }
    },
    {
      name: 'Notifications by category',
      check: async () => {
        const q = db.collection('notifications')
          .where('userId', '==', 'test-user')
          .where('category', '==', 'budget')
          .orderBy('createdAt', 'desc')
          .limit(1);
        await q.get();
      }
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const { name, check } of indexChecks) {
    try {
      await check();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${name}`);
      if (error.message.includes('index')) {
        console.log(`   ⚠️  Missing index. Deploy with: firebase deploy --only firestore:indexes`);
      } else {
        console.log(`   Error: ${error.message}`);
      }
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed === 0) {
    console.log('🎉 All indexes are working correctly!\n');
    return 0;
  } else {
    console.log('⚠️  Some indexes are missing. Run: firebase deploy --only firestore:indexes\n');
    console.log('📝 Check firestore.indexes.json to ensure all indexes are defined.\n');
    return 1;
  }
}

// Run the checks
checkIndexes()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error('❌ Error checking indexes:', error);
    process.exit(1);
  });

