# Firebase Setup Instructions for Penny

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or "Create a project"
3. Enter project name: `penny-pwa`
4. Accept terms and click Continue
5. (Optional) Enable Google Analytics if desired
6. Click "Create project" and wait for it to complete

## Step 2: Register Web App

1. In your Firebase project dashboard, click the **Web** icon (`</>`) to add a web app
2. Enter app nickname: `Penny Web App`
3. **Do NOT** check "Also set up Firebase Hosting" (we'll use Next.js deployment)
4. Click "Register app"
5. You'll see your Firebase configuration object - **keep this page open**

## Step 3: Enable Authentication

1. In the left sidebar, click **"Authentication"**
2. Click **"Get started"**
3. Go to the **"Sign-in method"** tab
4. Click on **"Email/Password"**
5. Toggle the **"Enable"** switch
6. Click **"Save"**

## Step 4: Enable Firestore Database

1. In the left sidebar, click **"Firestore Database"**
2. Click **"Create database"**
3. Choose **"Start in test mode"** (we'll add security rules later)
4. Select your preferred location (choose closest to Canada, e.g., `us-central1`)
5. Click **"Enable"**

## Step 5: Enable Storage (for receipt images)

1. In the left sidebar, click **"Storage"**
2. Click **"Get started"**
3. Choose **"Start in test mode"**
4. Click **"Next"**
5. Select the same location as your Firestore database
6. Click **"Done"**

## Step 6: Configure Environment Variables

1. Go back to **Project Settings** (gear icon near "Project Overview")
2. Scroll down to "Your apps" section
3. Copy your Firebase configuration values
4. Open the `.env.local` file in your Penny project
5. Replace the placeholder values with your actual Firebase config:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_actual_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=penny-pwa.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=penny-pwa
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=penny-pwa.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_actual_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_actual_app_id
```

## Step 7: Configure Firestore Security Rules

**IMPORTANT:** Test mode security rules allow anyone to read/write your database. You must update the security rules before using Penny with real data.

1. In the Firebase Console, go to **"Firestore Database"**
2. Click the **"Rules"** tab
3. Replace the default rules with the contents of `firestore.rules` from your Penny project
4. Or copy these rules:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    function isAuthenticated() {
      return request.auth != null;
    }
    
    match /expenses/{expenseId} {
      allow read: if isAuthenticated() && 
                     resource.data.userId == request.auth.uid;
      
      allow create: if isAuthenticated() && 
                       request.resource.data.userId == request.auth.uid &&
                       request.resource.data.keys().hasAll(['vendor', 'amount', 'date', 'category', 'userId']) &&
                       request.resource.data.amount is number &&
                       request.resource.data.amount > 0;
      
      allow update: if isAuthenticated() && 
                       resource.data.userId == request.auth.uid &&
                       request.resource.data.userId == request.auth.uid;
      
      allow delete: if isAuthenticated() && 
                       resource.data.userId == request.auth.uid;
    }
    
    match /users/{userId} {
      allow read, create, update: if request.auth.uid == userId;
      allow delete: if false;
    }
    
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

5. Click **"Publish"**
6. Confirm that you want to update the rules

These rules ensure:
- ✅ Only authenticated users can access data
- ✅ Users can only read/write their own expenses
- ✅ Required fields must be present
- ✅ Amount must be a positive number
- ✅ User data is protected

## Step 8: Test the Setup

1. Save the `.env.local` file
2. Restart your Next.js dev server:
   ```bash
   npm run dev
   ```
3. Navigate to `http://localhost:3000/signup`
4. Try creating a test account
5. If successful, you should be redirected to the home page
6. Try adding an expense to test Firestore integration

## Security Notes

- The `.env.local` file is already in `.gitignore` and won't be committed
- These are **client-side** environment variables (prefixed with `NEXT_PUBLIC_`)
- Firebase security will be controlled through Firestore Security Rules (we'll add these later)
- Test mode is enabled for now - we'll add proper security rules in a future prompt

## Troubleshooting

- **"Firebase: Error (auth/configuration-not-found)"**: Your environment variables aren't loaded. Make sure `.env.local` is in the project root and restart the dev server.
- **"Firebase: Error (auth/api-key-not-valid)"**: Double-check your API key in `.env.local`
- **Build fails**: Clear `.next` folder and rebuild: `rm -rf .next && npm run build`

---

**✅ Once completed, you're ready to move to the next prompt!**
