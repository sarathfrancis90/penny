# Penny Testing Guide

## Local Development Testing Options

### Option 1: Firebase Emulators (Recommended for Testing)

Use Firebase Emulators to test without affecting production data.

#### Setup Firebase Emulators:

```bash
# Install Firebase CLI globally
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize emulators in your project
firebase init emulators
# Select: Authentication, Firestore, Storage
# Use default ports or customize

# Start emulators
firebase emulators:start
```

#### Update `.env.local` for Emulator Mode:

```env
# Add these for emulator mode (comment out for production)
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true
```

#### Configure App to Use Emulators:

Update `src/lib/firebase.ts` to detect emulator mode (see code below).

**Benefits:**
- ✅ No real data affected
- ✅ Fast reset (just restart emulators)
- ✅ Can import/export test data
- ✅ Free, unlimited testing

---

### Option 2: Test Firebase Project

Create a separate Firebase project for testing.

1. Create `penny-pwa-test` project in Firebase Console
2. Copy credentials to `.env.local.test`
3. Switch between files for testing vs production

---

### Option 3: Use Production with Test Accounts

Use real Firebase but with test accounts and manual cleanup.

---

## Data Reset Methods

### 1. Clear Browser Data (Quick Reset)

**IndexedDB + LocalStorage:**
```javascript
// Open browser console (F12) and run:
indexedDB.deleteDatabase('pennyDB');
localStorage.clear();
sessionStorage.clear();
location.reload();
```

**Or use DevTools:**
1. Open DevTools (F12)
2. Application tab → Storage
3. Clear storage → Clear site data

### 2. Clear Firestore Data (Manual)

**Via Firebase Console:**
1. Go to Firestore Database
2. Select collection (e.g., `expenses`)
3. Delete documents or entire collection
4. Or use Firestore rules to prevent writes during testing

### 3. Delete Test User Account

**Via Firebase Console:**
1. Authentication → Users
2. Find test user
3. Delete user account

---

## Built-in Dev Tools

### Reset Button (Development Only)

Add a dev-only reset button to your app:

**Location:** Profile page or hidden debug panel

**Features:**
- Clear IndexedDB
- Sign out user
- Show reset confirmation
- Only visible in development

### Browser Extensions

**React DevTools:**
```bash
# Inspect component state
# Clear state manually
```

**Redux DevTools** (if you add Redux later):
- Time travel debugging
- State reset

---

## Testing Workflows

### Workflow 1: Complete Fresh Start

```bash
# 1. Stop dev server
Ctrl+C

# 2. Clear build cache
rm -rf .next

# 3. Clear IndexedDB (via browser console)
indexedDB.deleteDatabase('pennyDB');

# 4. Delete test Firebase data (via console or emulator restart)

# 5. Restart dev server
npm run dev

# 6. Test with clean slate
```

### Workflow 2: Quick Reset Between Tests

```bash
# Browser console:
indexedDB.deleteDatabase('pennyDB'); location.reload();

# Or use the dev reset button in the app
```

### Workflow 3: Emulator Reset

```bash
# Ctrl+C to stop emulators
# Restart with clean data:
firebase emulators:start --import=./test-data --export-on-exit
```

---

## Test Data Scenarios

### Scenario 1: Empty State Testing
- New user signup
- No expenses
- Test onboarding flow

### Scenario 2: Populated Data
- Pre-populate with test expenses
- Test dashboard calculations
- Test search/filter

### Scenario 3: Offline Testing
- Chrome DevTools → Network → Offline
- Add expenses (should queue to IndexedDB)
- Go online (should auto-sync)

### Scenario 4: Edge Cases
- Very large amounts ($999,999.99)
- Long vendor names
- Many expenses (100+)
- Rapid submissions

---

## Automated Testing (Future)

### Unit Tests
```bash
npm install --save-dev jest @testing-library/react
npm test
```

### E2E Tests
```bash
npm install --save-dev cypress
npx cypress open
```

---

## Quick Commands

### Clear Everything (Browser Console)
```javascript
// Paste in browser console:
(async () => {
  await indexedDB.deleteDatabase('pennyDB');
  localStorage.clear();
  sessionStorage.clear();
  console.log('✅ All local data cleared');
  location.reload();
})();
```

### Check Current Data (Browser Console)
```javascript
// Check IndexedDB:
(async () => {
  const db = await window.indexedDB.open('pennyDB');
  console.log('Database:', db);
})();

// Check localStorage:
console.log('LocalStorage:', localStorage);
```

---

## Environment Setup

### `.env.local` (Production)
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_production_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=penny-pwa.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=penny-pwa
# ... rest of production config
GEMINI_API_KEY=your_gemini_key
```

### `.env.local.test` (Testing)
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_test_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=penny-pwa-test.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=penny-pwa-test
# ... rest of test config
GEMINI_API_KEY=your_test_gemini_key
```

### Switch Between Environments
```bash
# Use test environment
cp .env.local.test .env.local
npm run dev

# Back to production
cp .env.local.prod .env.local
npm run dev
```

---

## Best Practices

1. **Use Test Accounts:**
   - Email: test@example.com
   - Use disposable email services
   - Don't use real personal data

2. **Test with Realistic Data:**
   - Use real receipt images
   - Vary expense amounts and categories
   - Test edge cases

3. **Document Test Results:**
   - Keep notes on bugs found
   - Screenshot issues
   - Track performance

4. **Regular Data Cleanup:**
   - Clear test data weekly
   - Don't let test data accumulate
   - Use emulators when possible

5. **Version Control:**
   - Never commit `.env.local`
   - Keep test credentials separate
   - Document test setup in README

---

## Troubleshooting

### "Data Still There After Reset"
- Clear browser cache entirely
- Try incognito mode
- Check if service worker is caching (PWA)

### "Can't Delete IndexedDB"
- Close all tabs of the app
- Clear browser cache
- Restart browser

### "Firebase Permission Errors"
- Check security rules
- Verify authentication
- Check user ID in Firestore documents

---

## Next Steps

1. Set up Firebase Emulators
2. Create test user accounts
3. Add dev reset button
4. Document your testing workflow
5. Consider automated testing for critical flows
