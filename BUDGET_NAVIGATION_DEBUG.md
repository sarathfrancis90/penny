# 🔍 Budget Navigation Debugging Guide

## Current Issue
Clicking "Create First Budget" or "Manage Budgets" in a group page redirects to the chat page `/` instead of `/budgets`.

## Debug Logs Added

### 1. **AuthGuard** (`src/components/auth-guard.tsx`)
Logs every navigation check:
- `🔍 [AuthGuard]` - Shows pathname, user status, route type
- `❌ [AuthGuard] Redirecting to /login` - When redirecting to login
- `✅ [AuthGuard] Redirecting to /` - When redirecting to home

### 2. **Budgets Page** (`src/app/budgets/page.tsx`)
Logs component lifecycle:
- `🔍 [Budgets Page] Component mounted` - When page loads
- `🔍 [Budgets Page] User: [email]` - User info
- `🔍 [Budgets Page] Search params: [params]` - URL query params
- `🔍 [Budgets Page] Query params: { tab, groupId }` - Parsed params
- `✅ [Budgets Page] Setting tab to group` - When switching tabs
- `✅ [Budgets Page] Setting groupId: [id]` - When group selected

### 3. **Group Detail Page** (`src/app/groups/[id]/page.tsx`)
Logs navigation attempts:
- `🔍 [Group Detail Page] Mounted with groupId: [id]` - On page load
- `🔍 [Group Detail Page] Budget link would be: [url]` - Expected URL
- `🔗 [Group Detail Page] Navigating to: [url]` - Before navigation
- `🔗 [Group Detail Page] GroupId: [id]` - GroupId being used

---

## How to Debug

### Step 1: Open Browser Console
1. Open the app: `http://localhost:3000`
2. Open browser DevTools (F12 or Cmd+Option+I)
3. Go to the **Console** tab
4. Clear console (`Cmd+K` or `Ctrl+L`)

### Step 2: Navigate to a Group
1. Go to a group where you're the owner/admin
2. Look for these logs in console:
   ```
   🔍 [AuthGuard] { pathname: '/groups/[id]', hasUser: true, ... }
   🔍 [Group Detail Page] Mounted with groupId: ...
   🔍 [Group Detail Page] Budget link would be: /budgets?tab=group&groupId=...
   ```

### Step 3: Click "Create First Budget"
1. Click the button
2. **Watch the console closely** for:
   ```
   🔗 [Group Detail Page] Navigating to: /budgets?tab=group&groupId=...
   🔗 [Group Detail Page] GroupId: [the-group-id]
   ```

### Step 4: Check What Happens Next
After clicking, you should see:

**Expected (✅ Working):**
```
🔍 [AuthGuard] { pathname: '/budgets', hasUser: true, isPublicRoute: false }
🔍 [Budgets Page] Component mounted
🔍 [Budgets Page] User: [your-email]
🔍 [Budgets Page] Search params: tab=group&groupId=...
🔍 [Budgets Page] Query params: { tabParam: 'group', groupIdParam: '...' }
✅ [Budgets Page] Setting tab to group
✅ [Budgets Page] Setting groupId: ...
```

**Unexpected (❌ Bug):**
```
🔍 [AuthGuard] { pathname: '/', hasUser: true, isPublicRoute: false }
// OR
❌ [AuthGuard] Redirecting to /login
// OR
No budgets page logs at all
```

---

## What to Report

### If You See the Bug:
Please copy and paste **ALL** console logs from:
1. Before clicking the button
2. While clicking the button  
3. After the page changes

### Key Questions:
1. **Does the URL in the browser change to `/budgets?tab=group&groupId=...`?**
   - Yes → Navigation worked, but budgets page might be redirecting
   - No → Navigation is being intercepted before reaching budgets page

2. **Do you see ANY "Budgets Page" logs?**
   - Yes → Budgets page loaded but might have crashed
   - No → Navigation never reached budgets page

3. **What's the final URL in the browser?**
   - `/` → Something redirected to home
   - `/login` → Auth issue
   - `/budgets` (without params) → Params were lost
   - `/budgets?tab=group&groupId=...` → Page loaded but showing wrong content

---

## Common Causes

### 1. **AuthGuard Redirect Loop**
- AuthGuard thinks user is not authenticated
- Or thinks `/budgets` is a public route
- **Check:** AuthGuard logs should show `hasUser: true`

### 2. **Search Params Not Available**
- Suspense boundary might not be working
- **Check:** "Search params" log should show the query string

### 3. **Router.push() Issue**
- Next.js router might be buggy
- **Check:** Browser URL bar should change to `/budgets?...`

### 4. **Page Crash**
- Budgets page might be crashing on load
- **Check:** Console for red error messages

---

## Quick Tests

### Test 1: Direct URL
1. Manually type in browser: `http://localhost:3000/budgets?tab=group&groupId=test123`
2. **Expected:** Budgets page loads, console shows query params
3. **If this works:** Navigation code is the issue
4. **If this fails:** Budgets page itself has a problem

### Test 2: Simple Navigation
1. Go to any page
2. Open browser console
3. Type: `window.location.href = '/budgets?tab=group&groupId=test123'`
4. Press Enter
5. **Expected:** Budgets page loads
6. **If this works:** `router.push()` might be the issue

### Test 3: Check Network Tab
1. Open DevTools → **Network** tab
2. Click "Create First Budget"
3. Look for:
   - Request to `/budgets`
   - Redirects (shown as `30x` status codes)
   - Failed requests (shown in red)

---

## Next Steps

Once you've gathered the console logs, we can:
1. Identify exactly where navigation is breaking
2. Fix the root cause (not just symptoms)
3. Add proper error handling
4. Remove debug logs

---

## Dev Server Info

**Status:** ✅ Running locally
**URL:** `http://localhost:3000`
**Debug Mode:** Enabled with comprehensive logging

**To restart dev server:**
```bash
# Stop server
pkill -f "next dev"

# Start server
npm run dev
```

---

## Files with Debug Logs

- `src/components/auth-guard.tsx`
- `src/app/budgets/page.tsx`
- `src/app/groups/[id]/page.tsx`

**After debugging, we'll remove these logs in a cleanup commit.**

