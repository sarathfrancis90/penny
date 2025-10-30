# Debugging 401 Unauthorized on Passkey API

## Understanding the 401 Error

The **401 Unauthorized** error on `/api/auth/passkey/list` is **EXPECTED** when:
- ❌ User is not logged in (no session cookie)
- ❌ Session cookie expired
- ❌ JWT_SECRET not set in Vercel (can't validate session)

### ✅ This is NOT an error if you haven't logged in yet!

---

## Step-by-Step Debugging

### 1️⃣ Check: Is JWT_SECRET Set in Vercel?

**Go to:** https://vercel.com → Your Project → Settings → Environment Variables

**Look for:** `JWT_SECRET`

**If missing, add it:**
```bash
# Run this in your terminal to generate:
npm run generate-secret

# Then add to Vercel:
JWT_SECRET=<paste-generated-secret-here>
```

---

### 2️⃣ Test: Create an Account and Log In

**Step 1: Sign Up**
1. Go to: https://penny-amber.vercel.app/signup
2. Create account with email/password
3. Check browser console for errors

**Step 2: Log In**
1. Go to: https://penny-amber.vercel.app/login
2. Sign in with the credentials you just created
3. Check if you're redirected to the homepage

**Step 3: Check Session Cookie**
1. Open browser DevTools (F12)
2. Go to: Application → Cookies → https://penny-amber.vercel.app
3. Look for: `session` cookie
4. If missing: Session creation failed

---

### 3️⃣ Test: Profile Page Access

**After logging in:**
1. Navigate to: https://penny-amber.vercel.app/profile
2. Open browser console
3. Check if passkey section loads

**Expected behavior:**
- ✅ No errors in console (401 on profile page is BAD)
- ✅ "Enable Face ID / Touch ID" button visible
- ✅ No passkeys listed (first time user)

**Actual behavior if broken:**
- ❌ Repeated 401 errors
- ❌ Profile page doesn't load
- ❌ No session cookie in browser

---

### 4️⃣ Debug: Check Session Creation

**If session cookie is missing after login:**

Check if password-based login creates a session:

1. **Find:** `src/hooks/useAuth.ts`
2. **Check:** Does `signIn()` function exist?
3. **Verify:** Firebase Auth is working

**Expected:** After successful Firebase auth, a session should be created.

**Actual issue:** Passkey authentication and password authentication might use different session mechanisms.

---

### 5️⃣ The Real Problem: Session Management

Looking at your codebase, I see the issue:

**Passkey authentication** creates a JWT session:
```typescript
// In /api/auth/passkey/authenticate/verify
const token = await new SignJWT({ userId, authMethod: 'passkey' })
  .sign(JWT_SECRET);
cookies().set('session', token, { ... });
```

**But password authentication** (Firebase) doesn't create this session!

Firebase Auth uses its own session mechanism, which is separate from the JWT session used by passkeys.

---

## 🔧 Solution: You Need Both Sessions

### Current Architecture Problem:

```
Password Login (Firebase)
   ↓
Firebase Session Token ✅
JWT Session Cookie ❌  ← Missing!
   ↓
Profile page loads
   ↓
Calls /api/auth/passkey/list
   ↓
API checks JWT session ← FAILS! No JWT session exists
   ↓
Returns 401
```

### The Fix:

You need to create a JWT session AFTER Firebase authentication.

---

## 🚀 Quick Fix

### Option 1: Make Profile Page Handle Missing Session

Update `src/components/passkey-management.tsx` or wherever you call `loadPasskeys()`:

```typescript
useEffect(() => {
  // Only load passkeys if user is authenticated
  if (user) {
    loadPasskeys().catch((error) => {
      // Handle 401 gracefully - user needs to enable passkeys first
      if (error.status === 401) {
        console.log('No passkey session yet - user can enable it');
      }
    });
  }
}, [user, loadPasskeys]);
```

### Option 2: Create JWT Session on Firebase Login

Create an API route: `/api/auth/session/create`

```typescript
// POST /api/auth/session/create
export async function POST(request: NextRequest) {
  try {
    // Get Firebase ID token from request
    const { idToken } = await request.json();
    
    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;
    
    // Create JWT session
    const token = await new SignJWT({ userId, authMethod: 'firebase' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .sign(JWT_SECRET);
    
    // Set session cookie
    cookies().set('session', token, { ... });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
```

Then call this after Firebase login in `useAuth.ts`.

---

## 🧪 Testing Commands

### Test 1: Check if logged in (with cookies)

```bash
# First, log in via browser and get the session cookie value
# Then test with cookie:

curl 'https://penny-amber.vercel.app/api/auth/passkey/list' \
  -H 'Cookie: session=<your-session-cookie-value>' \
  -v
```

**Expected:** 
- With valid session: `200 OK` + passkey list
- Without session: `401 Unauthorized` ← This is correct!

### Test 2: Generate JWT Secret

```bash
npm run generate-secret
```

Copy one of the generated secrets and add to Vercel.

### Test 3: Check Vercel Environment

```bash
vercel env ls
```

Should show `JWT_SECRET` and all `NEXT_PUBLIC_*` variables.

---

## 🎯 Summary

**The 401 error is CORRECT behavior!**

The issue is:
1. ✅ Passkey API requires authentication
2. ✅ You're not sending a session cookie (not logged in)
3. ❌ Even after Firebase login, there's no JWT session

**To fix:**
1. **Short-term:** Don't show errors for 401 on profile page (already fixed in latest code)
2. **Long-term:** Create JWT session after Firebase login
3. **Immediate:** Set `JWT_SECRET` in Vercel and redeploy

---

## 📝 Next Steps

1. **Generate and add JWT_SECRET:**
   ```bash
   npm run generate-secret
   # Add to Vercel environment variables
   ```

2. **Test the full flow:**
   - Sign up → Log in → Go to Profile
   - The 401 should disappear once you're logged in
   - If it persists, you need Option 2 (create JWT session on Firebase login)

3. **Check browser console:**
   - Look for the session cookie after login
   - If missing, implement Option 2

---

## 🆘 Still Not Working?

If you've:
- ✅ Added JWT_SECRET to Vercel
- ✅ Redeployed
- ✅ Logged in with email/password
- ❌ Still seeing 401 on profile page

Then the issue is: **Firebase login doesn't create a JWT session**.

You'll need to implement **Option 2** above to bridge Firebase Auth with the JWT session system used by passkeys.

