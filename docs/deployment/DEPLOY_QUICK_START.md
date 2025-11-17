# 🚀 Quick Deploy to Vercel

## 5-Minute Deployment Guide

### Step 1: Push to GitHub (if not already done)

```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

### Step 2: Deploy to Vercel

1. **Go to:** https://vercel.com
2. **Sign up** with GitHub
3. **Click:** "Add New Project"
4. **Select:** Your `penny` repository
5. **Click:** "Import"

### Step 3: Add Environment Variables

Copy these 7 variables from your `.env.local`:

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
GEMINI_API_KEY
```

**In Vercel:**
- Click "Environment Variables"
- Paste each variable name and value
- Select all environments (Production, Preview, Development)

### Step 4: Deploy

1. Click **"Deploy"**
2. Wait 2-3 minutes ⏱️
3. Get your URL: `https://penny-[random].vercel.app` 🎉

### Step 5: Authorize Domain in Firebase

1. Go to [Firebase Console](https://console.firebase.google.com)
2. **Authentication** → **Settings** → **Authorized Domains**
3. Click **"Add Domain"**
4. Add: `penny-[random].vercel.app`

### Done! 🎉

Visit your app at the Vercel URL and test it out!

---

## Auto-Deploy Setup ✅

Now every time you push to `main`:
- ✅ Automatic deployment
- ✅ Build & test
- ✅ Live in ~2 minutes

Every PR gets a preview URL for testing! 🔍

---

## Troubleshooting

**Build fails?**
- Check environment variables are set
- Look at build logs in Vercel

**Login doesn't work?**
- Make sure domain is authorized in Firebase
- Check all Firebase variables are correct

**Need help?** See full guide in `DEPLOYMENT.md`

---

## What You Get (Free Tier)

- ✅ Unlimited deployments
- ✅ 100GB bandwidth/month
- ✅ Automatic HTTPS
- ✅ Global CDN
- ✅ Preview deployments
- ✅ Analytics & monitoring

**Cost: $0/month** 💰
