# 🔥 Deploy Firestore Security Rules

The dashboard is showing "Missing or insufficient permissions" because the Firestore security rules need to be deployed.

## Quick Fix:

### Option 1: Deploy via Firebase Console (Easiest)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database** → **Rules**
4. Copy the contents from `firestore.rules` in your project
5. Click **Publish**

### Option 2: Deploy via Firebase CLI

```bash
# Install Firebase CLI if you haven't
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project (if not done)
firebase init firestore

# Deploy rules
firebase deploy --only firestore:rules
```

## Current Rules Summary

Your `firestore.rules` file already has the correct permissions:
- ✅ Users can read their own expenses
- ✅ Users can create their own expenses
- ✅ Users can update their own expenses
- ✅ Users can delete their own expenses

The rules are working correctly in the code, they just need to be deployed to your Firebase project.

## After Deploying

Once deployed, refresh your dashboard and the expenses should load correctly!

---

**Note**: The `/api/expenses` POST route uses Firebase Admin SDK which bypasses these rules, but the dashboard's real-time listener uses the client SDK which respects these rules.
