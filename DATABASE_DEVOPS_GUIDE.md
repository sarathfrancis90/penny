# 🔧 Database DevOps Best Practices

**Purpose**: Production-ready database management for Penny  
**Last Updated**: November 17, 2025  

---

## 🎯 Goals

1. ✅ **Zero runtime errors** from missing indexes or permissions
2. ✅ **Automated deployments** via CI/CD
3. ✅ **Version-controlled schema** (Infrastructure as Code)
4. ✅ **Reproducible environments** (dev, staging, prod)
5. ✅ **Safe migrations** with rollback capability

---

## 📦 What's Been Set Up

### 1. **Firestore Indexes** (`firestore.indexes.json`)
- ✅ All query indexes pre-defined
- ✅ Composite indexes for complex queries
- ✅ Automatically deployed on push to main

### 2. **Security Rules** (`firestore.rules`)
- ✅ Comprehensive access control
- ✅ Version controlled
- ✅ Automatically validated and deployed

### 3. **CI/CD Pipeline** (`.github/workflows/firebase-deploy.yml`)
- ✅ Auto-deploy on changes to database files
- ✅ Validation before deployment
- ✅ Manual trigger option

### 4. **Schema Documentation** (`DATABASE_SCHEMA.md`)
- ✅ Complete collection schemas
- ✅ Index requirements documented
- ✅ Security model explained

---

## 🚀 Quick Start

### Initial Setup

#### 1. Install Firebase CLI
```bash
npm install -g firebase-tools
```

#### 2. Login to Firebase
```bash
firebase login
```

#### 3. Initialize Project (Already done, but for reference)
```bash
firebase init

# Select:
# - Firestore (rules and indexes)
# - Storage
```

#### 4. Set Firebase Project
```bash
firebase use penny-f4acd
```

---

## 🔄 Development Workflow

### Making Database Changes

#### Step 1: Update Schema Documentation
```bash
# Edit DATABASE_SCHEMA.md
# Document new collection or field
```

#### Step 2: Update Security Rules (if needed)
```bash
# Edit firestore.rules
# Add/modify access control
```

#### Step 3: Add Required Indexes
```bash
# Edit firestore.indexes.json
# Add composite indexes for new queries
```

#### Step 4: Test Locally
```bash
# Start Firebase emulators
firebase emulators:start

# Run your app against emulators
# FIRESTORE_EMULATOR_HOST=localhost:8080 npm run dev
```

#### Step 5: Commit and Push
```bash
git add firestore.rules firestore.indexes.json DATABASE_SCHEMA.md
git commit -m "feat: Add new collection for [feature]"
git push origin main

# CI/CD will automatically deploy! 🚀
```

---

## 🧪 Testing Strategy

### 1. Emulator Testing

**Start emulators:**
```bash
firebase emulators:start --only firestore
```

**Run against emulators:**
```bash
# In another terminal
FIRESTORE_EMULATOR_HOST=localhost:8080 npm run dev
```

**Benefits:**
- No cloud costs
- Fast iteration
- Isolated testing
- Can seed test data

### 2. Rules Testing

**Create test file:** `tests/firestore.rules.test.js`
```javascript
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');

describe('Firestore Rules', () => {
  let testEnv;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'penny-test',
      firestore: {
        rules: fs.readFileSync('firestore.rules', 'utf8'),
      },
    });
  });

  test('Users can only read their own notifications', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const bob = testEnv.authenticatedContext('bob');

    // Alice creates notification for herself
    await assertSucceeds(
      alice.firestore()
        .collection('notifications')
        .doc('notif1')
        .set({ userId: 'alice', title: 'Test' })
    );

    // Alice can read her own notification
    await assertSucceeds(
      alice.firestore()
        .collection('notifications')
        .doc('notif1')
        .get()
    );

    // Bob CANNOT read Alice's notification
    await assertFails(
      bob.firestore()
        .collection('notifications')
        .doc('notif1')
        .get()
    );
  });
});
```

**Run tests:**
```bash
npm test -- firestore.rules.test.js
```

### 3. Index Validation

**Check if query has index:**
```typescript
// In your code, queries will throw error if index missing
// Example: This query REQUIRES an index
const q = query(
  collection(db, 'notifications'),
  where('userId', '==', userId),
  where('read', '==', false),
  orderBy('createdAt', 'desc')
);

// If index missing, you'll see:
// "The query requires an index. You can create it here: [URL]"
```

**Solution:** Add to `firestore.indexes.json` BEFORE deploying!

---

## 🔐 Environment Management

### Development Environment
```bash
# Use Firebase emulators (free, local)
firebase emulators:start

# Connect your app
export FIRESTORE_EMULATOR_HOST="localhost:8080"
npm run dev
```

### Staging Environment
```bash
# Create separate Firebase project for staging
firebase projects:create penny-staging

# Use staging project
firebase use penny-staging

# Deploy
firebase deploy --only firestore
```

### Production Environment
```bash
# Use production project
firebase use penny-f4acd

# Deploy via CI/CD (automatic)
# Or manually:
firebase deploy --only firestore
```

---

## 🔄 CI/CD Setup

### GitHub Secrets Required

Set these in your GitHub repository:

1. **`FIREBASE_TOKEN`**
   ```bash
   # Generate token locally
   firebase login:ci
   
   # Copy the token
   # Add to GitHub: Settings → Secrets → Actions → New secret
   # Name: FIREBASE_TOKEN
   # Value: [paste token]
   ```

2. **`FIREBASE_PROJECT_ID`**
   ```
   Name: FIREBASE_PROJECT_ID
   Value: penny-f4acd
   ```

### Workflow Triggers

The workflow runs automatically when:
- Push to `main` branch
- Changes to: `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `firebase.json`
- Manual trigger via GitHub Actions UI

### Manual Deployment

If CI/CD fails or you need manual control:

```bash
# Deploy everything
firebase deploy

# Deploy only rules
firebase deploy --only firestore:rules

# Deploy only indexes
firebase deploy --only firestore:indexes

# Deploy only storage rules
firebase deploy --only storage
```

---

## 📊 Monitoring & Observability

### Firebase Console Monitoring

**Access:** https://console.firebase.google.com/project/penny-f4acd

**Key Metrics to Watch:**

1. **Firestore Usage**
   - Firestore → Usage
   - Monitor read/write operations
   - Check storage size
   - Watch for spikes

2. **Index Status**
   - Firestore → Indexes
   - Check for "Building" status
   - Verify all indexes are "Enabled"
   - Delete unused indexes

3. **Rules Evaluation**
   - Firestore → Rules
   - Check for rule violations
   - Review access patterns

### Setting Up Alerts

**Firebase Alerts:**
```bash
# Go to: Project Settings → Integrations
# Enable Slack/Email notifications for:
- Budget alerts
- Security rule violations
- Quota approaching limits
```

### Logging Best Practices

```typescript
// In your code, log database operations
console.log('[DB] Creating notification:', {
  userId,
  type,
  timestamp: new Date().toISOString()
});

// On errors, log details
console.error('[DB] Failed to create notification:', {
  error: error.message,
  userId,
  type
});
```

---

## 🚨 Common Issues & Solutions

### Issue 1: "The query requires an index"

**Problem:** You wrote a query without defining an index

**Solution:**
1. Firebase will provide a URL to auto-create index in console
2. Click the URL, create index
3. Export the index:
   ```bash
   firebase firestore:indexes > firestore.indexes.json
   ```
4. Commit the updated file
5. Next time, index will exist from CI/CD!

### Issue 2: "Missing or insufficient permissions"

**Problem:** Security rules blocking access

**Solution:**
1. Check `firestore.rules`
2. Verify user is authenticated
3. Ensure rule allows the operation
4. Test in emulator
5. Deploy updated rules

### Issue 3: Indexes taking too long to build

**Problem:** Large collections take time to index

**Solution:**
- Small collections: Indexes build in seconds
- Large collections (>10K docs): Can take 5-30 minutes
- Very large (>1M docs): Can take hours

**Check status:**
```bash
firebase firestore:indexes
```

**Monitor in console:**
- Firestore → Indexes → Check "Building" status

### Issue 4: CI/CD deployment fails

**Problem:** GitHub Actions workflow failing

**Debugging steps:**
1. Check GitHub Actions logs
2. Verify `FIREBASE_TOKEN` is valid
3. Regenerate token if needed:
   ```bash
   firebase login:ci
   ```
4. Update GitHub secret with new token

---

## 📈 Performance Optimization

### Query Optimization

**Bad:**
```typescript
// ❌ Loads ALL documents, then filters in memory
const snapshot = await getDocs(collection(db, 'expenses'));
const userExpenses = snapshot.docs.filter(doc => doc.data().userId === userId);
```

**Good:**
```typescript
// ✅ Firestore filters server-side (requires index)
const q = query(
  collection(db, 'expenses'),
  where('userId', '==', userId),
  orderBy('date', 'desc'),
  limit(20)
);
const snapshot = await getDocs(q);
```

### Index Optimization

**Unused indexes cost nothing in performance but add to maintenance**

**Audit indexes:**
```bash
# Check which indexes are actually used
# Firebase Console → Firestore → Indexes
# Look for "Last Used" column
```

**Remove unused indexes:**
```json
// Edit firestore.indexes.json
// Comment out or delete unused indexes
```

### Pagination Best Practices

**Use cursor-based pagination, not offset:**

```typescript
// ✅ Good: Cursor-based
const q = query(
  collection(db, 'notifications'),
  where('userId', '==', userId),
  orderBy('createdAt', 'desc'),
  startAfter(lastVisible),
  limit(20)
);

// ❌ Bad: Offset-based (slow for large collections)
// Firestore doesn't support OFFSET, and emulating it is expensive
```

---

## 🔄 Migration Scripts

### Creating a Migration

**Scenario:** You need to add a new field to all existing documents

**Create migration script:** `scripts/migrations/2025-11-17-add-notification-priority.js`

```javascript
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

async function migrate() {
  const batch = db.batch();
  let count = 0;

  // Get all notifications without priority field
  const snapshot = await db.collection('notifications')
    .where('priority', '==', null)
    .get();

  console.log(`Found ${snapshot.size} documents to migrate`);

  snapshot.docs.forEach(doc => {
    batch.update(doc.ref, {
      priority: 'medium', // Default value
      migratedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    count++;
    
    // Firestore batch limit is 500
    if (count === 500) {
      await batch.commit();
      count = 0;
      batch = db.batch();
    }
  });

  // Commit remaining
  if (count > 0) {
    await batch.commit();
  }

  console.log('Migration complete!');
}

migrate().catch(console.error);
```

**Run migration:**
```bash
node scripts/migrations/2025-11-17-add-notification-priority.js
```

**Safety checklist:**
- [ ] Test on staging first
- [ ] Backup production data
- [ ] Run during low-traffic period
- [ ] Monitor for errors
- [ ] Verify data integrity after
- [ ] Have rollback plan

---

## 🎯 Best Practices Summary

### ✅ DO:
- ✅ Version control all database config (`rules`, `indexes`, schema docs)
- ✅ Test locally with emulators before deploying
- ✅ Use CI/CD for automatic deployments
- ✅ Document schema changes in `DATABASE_SCHEMA.md`
- ✅ Define indexes BEFORE writing queries
- ✅ Use composite indexes for complex queries
- ✅ Monitor usage and costs
- ✅ Set up staging environment
- ✅ Create migration scripts for data changes
- ✅ Review security rules regularly

### ❌ DON'T:
- ❌ Create indexes manually in console (won't be version controlled)
- ❌ Deploy to production without testing
- ❌ Write queries without checking for required indexes
- ❌ Store sensitive data without encryption
- ❌ Use admin SDK in client-side code
- ❌ Bypass security rules (except via admin SDK server-side)
- ❌ Delete production data without backups
- ❌ Ignore index warnings in development

---

## 🔗 Useful Commands Cheat Sheet

```bash
# Authentication
firebase login
firebase logout
firebase login:ci  # Get CI/CD token

# Project management
firebase projects:list
firebase use penny-f4acd
firebase use --add  # Add new project alias

# Deployment
firebase deploy
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage
firebase deploy --except functions

# Emulators
firebase emulators:start
firebase emulators:start --only firestore
firebase emulators:export ./backups  # Export emulator data
firebase emulators:start --import=./backups  # Import data

# Firestore management
firebase firestore:indexes
firebase firestore:indexes:list
firebase firestore:delete --all-collections  # ⚠️ DANGER!

# Debugging
firebase --debug deploy  # Verbose output
firebase projects:list --debug
```

---

## 📚 Additional Resources

- **Firebase Docs**: https://firebase.google.com/docs/firestore
- **Security Rules**: https://firebase.google.com/docs/firestore/security/get-started
- **Indexes**: https://firebase.google.com/docs/firestore/query-data/indexing
- **Best Practices**: https://firebase.google.com/docs/firestore/best-practices
- **Pricing**: https://firebase.google.com/pricing

---

## ✅ Setup Completion Checklist

- [x] `firestore.indexes.json` created with all required indexes
- [x] `firebase.json` updated to reference indexes
- [x] Security rules include notification collections
- [x] CI/CD workflow created (`.github/workflows/firebase-deploy.yml`)
- [x] Database schema documented (`DATABASE_SCHEMA.md`)
- [x] Best practices guide created (this document)
- [ ] GitHub secrets configured (`FIREBASE_TOKEN`, `FIREBASE_PROJECT_ID`)
- [ ] Initial deployment completed
- [ ] Staging environment set up (optional but recommended)
- [ ] Team trained on workflow

---

**Next Steps:**
1. Add GitHub secrets for CI/CD
2. Deploy indexes: `firebase deploy --only firestore:indexes`
3. Verify indexes building in Firebase Console
4. Test queries to ensure no index errors
5. Set up monitoring and alerts

**Questions?** Refer to this guide or Firebase documentation!

---

**Maintained By**: DevOps Team  
**Last Updated**: November 17, 2025  
**Status**: ✅ Production Ready  

