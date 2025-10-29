# Passkey Authentication - Vercel Deployment Checklist

## Critical Environment Variables Required

### ✅ Step 1: Add These Environment Variables in Vercel

Go to: https://vercel.com → Your Project → Settings → Environment Variables

**Required for Passkey Authentication:**

```
NEXT_PUBLIC_RP_ID=penny-amber.vercel.app
NEXT_PUBLIC_APP_URL=https://penny-amber.vercel.app
NEXT_PUBLIC_APP_NAME=Penny AI
JWT_SECRET=your-secure-random-32-character-minimum-secret-key-here
```

**⚠️ CRITICAL**: 
- `NEXT_PUBLIC_RP_ID` must EXACTLY match your domain
- `JWT_SECRET` must be at least 32 characters long
- Generate a secure random string for `JWT_SECRET` (use: `openssl rand -base64 32`)

### ✅ Step 2: Verify Firebase Environment Variables

Make sure these are also set in Vercel:

**Firebase Client Configuration:**
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

**Firebase Admin (if using admin features):**
```
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

**Gemini AI:**
```
GEMINI_API_KEY=...
```

### ✅ Step 3: Deploy the Latest Code

```bash
git add .
git commit -m "fix: Configure passkey authentication for production"
git push origin main
```

Wait for Vercel to complete the deployment (~2 minutes).

---

## Troubleshooting Guide

### Issue 1: "The RP ID 'localhost' is invalid for this domain"

**Cause**: `NEXT_PUBLIC_RP_ID` environment variable not set in Vercel

**Solution**:
1. Add `NEXT_PUBLIC_RP_ID=penny-amber.vercel.app` in Vercel
2. Redeploy the application
3. Clear browser cache and try again

### Issue 2: 401 Unauthorized on /api/auth/passkey/list

**Expected Behavior**: This is NORMAL on the login page
- The user isn't logged in yet
- The API correctly returns 401
- The UI handles this gracefully

**If this persists after logging in**:
- Check that `JWT_SECRET` is set in Vercel
- Verify the user is properly authenticated

### Issue 3: 404 on passkey API routes

**Cause**: API routes not deployed or build failed

**Solution**:
1. Check Vercel deployment logs
2. Verify all files under `src/app/api/auth/passkey/` are committed
3. Run `git ls-files src/app/api/auth/` to confirm

### Issue 4: "startAuthentication() was not called correctly"

**Cause**: RP ID mismatch or configuration issue

**Solution**:
1. Verify `NEXT_PUBLIC_RP_ID` exactly matches your domain
2. Clear browser cache and stored passkeys
3. Try registering a new passkey

### Issue 5: Passkey registration works but authentication fails

**Cause**: Counter mismatch or corrupted passkey data

**Solution**:
1. Delete the passkey from browser settings
2. Delete from Firestore `passkeys` collection
3. Register a new passkey

---

## Testing Checklist

### Before Testing:
- [ ] All environment variables set in Vercel
- [ ] Latest code deployed and build succeeded
- [ ] Clear browser cache
- [ ] Clear any previously registered passkeys

### Test Flow:
1. [ ] Visit https://penny-amber.vercel.app
2. [ ] Click "Sign up" and create an account with email/password
3. [ ] After signup, go to Profile page
4. [ ] Click "Enable Face ID / Touch ID"
5. [ ] Complete biometric authentication
6. [ ] Verify passkey appears in the list
7. [ ] Sign out
8. [ ] On login page, click "Sign in with Face ID / Touch ID"
9. [ ] Complete biometric authentication
10. [ ] Verify you're logged in successfully

### macOS PWA Testing:
1. [ ] Install as PWA: Safari → File → Add to Dock
2. [ ] Open from Dock (runs as standalone app)
3. [ ] Try passkey authentication
4. [ ] Verify it works the same as browser

---

## What Was Fixed

### Files Modified:

1. **`src/lib/passkey-config.ts`**
   - Added warning when `NEXT_PUBLIC_RP_ID` not set
   - Better fallback handling for server-side rendering

2. **`src/lib/passkey-utils.ts`**
   - Now uses centralized config module
   - Consistent RP ID across client and server

3. **`src/hooks/usePasskey.ts`**
   - Handles 401 errors gracefully on login page
   - Doesn't show errors for unauthenticated users

4. **`env.example`**
   - Added clear documentation for production setup
   - Example values for penny-amber.vercel.app

---

## Security Notes

### JWT_SECRET
- Must be at least 32 characters
- Should be cryptographically random
- Never commit to git
- Different for dev/staging/production

### RP ID
- Must exactly match your domain
- Cannot use wildcards
- Different for each environment:
  - Dev: `localhost`
  - Production: `penny-amber.vercel.app`
  - Custom domain: `penny.yourdomain.com`

### Passkey Security
- Passkeys are device-bound cryptographic keys
- Cannot be phished (unlike passwords)
- Synced across devices via iCloud/Google Password Manager
- User verification required (biometric/PIN)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser/PWA                           │
│  ┌───────────────────┐         ┌──────────────────────┐    │
│  │  Login/Signup UI  │────────▶│ usePasskey Hook       │    │
│  └───────────────────┘         └──────────────────────┘    │
│             │                             │                  │
│             │                             ▼                  │
│             │                  ┌──────────────────────┐     │
│             │                  │ @simplewebauthn      │     │
│             │                  │ /browser             │     │
│             │                  └──────────────────────┘     │
└─────────────┼─────────────────────────┬────────────────────┘
              │                         │
              ▼                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Next.js API Routes                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  /api/auth/passkey/register/start                     │  │
│  │  /api/auth/passkey/register/verify                    │  │
│  │  /api/auth/passkey/authenticate/start                 │  │
│  │  /api/auth/passkey/authenticate/verify                │  │
│  │  /api/auth/passkey/list                               │  │
│  │  /api/auth/passkey/delete                             │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                    │
│                         ▼                                    │
│              ┌──────────────────────┐                        │
│              │ passkey-config.ts    │◀─── ENV VARS          │
│              │ passkey-utils.ts     │                        │
│              └──────────────────────┘                        │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
                ┌──────────────────────┐
                │   Firebase Firestore │
                │   - passkeys         │
                │   - challenges       │
                └──────────────────────┘
```

---

## Support & Resources

- **WebAuthn Specification**: https://www.w3.org/TR/webauthn-3/
- **SimpleWebAuthn Docs**: https://simplewebauthn.dev/
- **FIDO Alliance**: https://fidoalliance.org/
- **Vercel Environment Variables**: https://vercel.com/docs/environment-variables

---

## Quick Commands

Generate a secure JWT secret:
```bash
openssl rand -base64 32
```

Check deployed environment variables:
```bash
vercel env ls
```

View deployment logs:
```bash
vercel logs
```

Test API endpoint:
```bash
curl https://penny-amber.vercel.app/api/auth/passkey/list
# Should return 401 (expected when not authenticated)
```

