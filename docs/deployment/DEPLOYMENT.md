# Penny Deployment Guide

## Deploying to Vercel (Recommended)

Vercel is the optimal hosting platform for Penny as it's built specifically for Next.js applications and offers excellent PWA support.

---

## Prerequisites

Before deploying, ensure you have:

1. ✅ A GitHub account
2. ✅ Your code pushed to a GitHub repository
3. ✅ Firebase project credentials
4. ✅ Google Gemini API key

---

## Step 1: Prepare Your Repository

### 1.1 Create `.env.example` file

Create a template for environment variables (without actual secrets):

```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key
```

### 1.2 Ensure `.env.local` is in `.gitignore`

Your `.gitignore` should include:
```
.env*.local
.env
```

### 1.3 Commit and Push

```bash
git add .
git commit -m "Prepare for deployment"
git push origin main
```

---

## Step 2: Deploy to Vercel

### 2.1 Sign Up / Log In to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **"Sign Up"** or **"Log In"**
3. Choose **"Continue with GitHub"**
4. Authorize Vercel to access your repositories

### 2.2 Import Your Project

1. Click **"Add New Project"**
2. Select **"Import Git Repository"**
3. Find your `penny` repository
4. Click **"Import"**

### 2.3 Configure Project

Vercel will auto-detect Next.js. Configure as follows:

**Framework Preset:** Next.js (auto-detected)

**Root Directory:** `./` (leave as default)

**Build Command:** `npm run build` (auto-detected)

**Output Directory:** `.next` (auto-detected)

**Install Command:** `npm install` (auto-detected)

### 2.4 Add Environment Variables

Click **"Environment Variables"** and add each variable:

| Name | Value | Example |
|------|-------|---------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Your Firebase API Key | `AIza...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Your Auth Domain | `penny-abc123.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Your Project ID | `penny-abc123` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Your Storage Bucket | `penny-abc123.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Your Sender ID | `123456789` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Your App ID | `1:123:web:abc` |
| `GEMINI_API_KEY` | Your Gemini API Key | `AIza...` |

**Important:** 
- Make sure to select **"Production", "Preview", and "Development"** for all environments
- Double-check there are no extra spaces or quotes

### 2.5 Deploy

1. Click **"Deploy"**
2. Wait 2-3 minutes for the build to complete
3. 🎉 Your app is live!

---

## Step 3: Configure Firebase for Production

### 3.1 Add Your Vercel Domain to Firebase

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to **Authentication** → **Settings** → **Authorized Domains**
4. Click **"Add Domain"**
5. Add your Vercel domain (e.g., `penny-xyz.vercel.app`)

### 3.2 Update Firestore Rules (if needed)

Ensure your Firestore rules allow authenticated users:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Expenses collection
    match /expenses/{expenseId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
    
    // Users collection (optional)
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## Step 4: Test Your Deployment

### 4.1 Basic Functionality
- ✅ Visit your Vercel URL
- ✅ Sign up / Log in
- ✅ Upload a receipt (test camera/file access)
- ✅ Check dashboard loads
- ✅ Verify data saves to Firestore

### 4.2 PWA Functionality
- ✅ Open DevTools → Application → Manifest
- ✅ Check for "Install" prompt on mobile
- ✅ Test offline mode (Network tab → Offline)
- ✅ Verify service worker registers

### 4.3 HTTPS Check
- ✅ Confirm URL starts with `https://`
- ✅ Check for valid SSL certificate (lock icon)

---

## Step 5: Set Up Custom Domain (Optional)

### 5.1 In Vercel Dashboard

1. Go to your project **Settings** → **Domains**
2. Click **"Add Domain"**
3. Enter your domain (e.g., `penny.yourdomain.com`)
4. Follow DNS configuration instructions

### 5.2 Update Firebase

Add your custom domain to Firebase Authorized Domains (Step 3.1)

---

## Continuous Deployment

🎉 **Automatic deployments are now enabled!**

- **Production:** Every push to `main` branch auto-deploys
- **Preview:** Every PR gets a unique preview URL
- **Rollbacks:** Instant rollback to any previous deployment

---

## Monitoring & Debugging

### Vercel Dashboard

- **Deployments:** View all deployments and their status
- **Analytics:** Page views, performance metrics (free tier)
- **Logs:** Real-time function logs for API routes
- **Speed Insights:** Core Web Vitals tracking

### Check Logs

1. Go to your project in Vercel
2. Click **"Deployments"**
3. Click on a deployment
4. View **"Build Logs"** or **"Function Logs"**

### Common Issues

#### Build Fails
```bash
# Check for:
- Missing environment variables
- TypeScript errors
- Missing dependencies
```

#### API Routes Don't Work
```bash
# Verify:
- GEMINI_API_KEY is set correctly
- API route is in /app/api/ directory
- No CORS issues
```

#### Firebase Connection Issues
```bash
# Verify:
- All NEXT_PUBLIC_* variables are set
- Domain is authorized in Firebase
- No typos in environment variables
```

---

## Alternative: Netlify

If you prefer Netlify:

### Quick Deploy

1. Go to [netlify.com](https://netlify.com)
2. **New site from Git** → Connect GitHub
3. **Build settings:**
   - Build command: `npm run build`
   - Publish directory: `.next`
4. Add environment variables (same as Vercel)
5. Deploy!

**Note:** Vercel is more optimized for Next.js and serverless functions.

---

## Alternative: Firebase Hosting + Cloud Functions

For a fully Firebase-integrated solution:

### Requirements
- More complex setup
- Requires Cloud Functions for API routes
- Need to adapt Next.js for Firebase

**Recommendation:** Stick with Vercel for simplicity and better Next.js support.

---

## Cost Comparison (Free Tiers)

| Platform | Free Tier Limits | Best For |
|----------|-----------------|----------|
| **Vercel** | 100GB bandwidth, unlimited sites | Next.js apps ⭐ |
| **Netlify** | 100GB bandwidth, 300 min build | Static sites |
| **Firebase** | 10GB storage, 360MB/day | Firebase-heavy apps |

---

## Post-Deployment Checklist

- [ ] App loads on production URL
- [ ] Environment variables configured
- [ ] Firebase authentication works
- [ ] Receipt upload works (camera & file)
- [ ] Gemini AI processes receipts
- [ ] Dashboard displays data
- [ ] PWA installable on mobile
- [ ] Service worker caches assets
- [ ] Offline mode works
- [ ] Domain authorized in Firebase
- [ ] SSL certificate valid (HTTPS)
- [ ] Test on multiple devices

---

## Development Workflow

### Local Development
```bash
npm run dev
# Access at http://localhost:3000
```

### Preview Deployments
- Create a PR → Get automatic preview URL
- Test changes before merging

### Production Deployment
- Merge PR to main → Auto-deploys to production
- Or push directly to main

---

## Useful Vercel CLI Commands

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from terminal
vercel

# Deploy to production
vercel --prod

# Check deployment status
vercel ls

# View logs
vercel logs [deployment-url]

# Add environment variable
vercel env add GEMINI_API_KEY
```

---

## Security Best Practices

1. ✅ **Never commit** `.env.local` or `.env` files
2. ✅ **Use environment variables** for all secrets
3. ✅ **Rotate API keys** if accidentally exposed
4. ✅ **Set Firestore rules** to protect user data
5. ✅ **Enable Firebase App Check** for production
6. ✅ **Monitor usage** in Vercel & Firebase dashboards

---

## Support & Resources

- **Vercel Docs:** https://vercel.com/docs
- **Next.js Deployment:** https://nextjs.org/docs/deployment
- **Firebase Hosting:** https://firebase.google.com/docs/hosting
- **PWA on Vercel:** https://vercel.com/guides/progressive-web-apps

---

## Summary

**Recommended Setup:**
- **Hosting:** Vercel (free tier)
- **Database:** Firebase Firestore
- **Auth:** Firebase Auth
- **AI:** Google Gemini API
- **Deployment:** Auto-deploy from GitHub

**Total Cost:** $0/month for development and moderate usage 🎉

Happy deploying! 🚀
