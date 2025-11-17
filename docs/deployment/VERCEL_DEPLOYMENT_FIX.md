# Vercel Deployment Fix for Passkey Error

## Problem
Error: "The RP ID 'localhost' is invalid for this domain"

This error occurs when passkey authentication is configured with localhost but running on a production domain.

## Solution

### Step 1: Add Environment Variables in Vercel

1. Go to your Vercel dashboard: https://vercel.com
2. Select your project: **penny-amber**
3. Go to **Settings** → **Environment Variables**
4. Add the following environment variables:

```
NEXT_PUBLIC_RP_ID=penny-amber.vercel.app
NEXT_PUBLIC_APP_URL=https://penny-amber.vercel.app
NEXT_PUBLIC_APP_NAME=Penny AI
```

**Important**: 
- The `NEXT_PUBLIC_RP_ID` MUST exactly match your deployment domain
- Include the protocol (https://) in `NEXT_PUBLIC_APP_URL`
- Set these for **Production** environment

### Step 2: Ensure All Required Environment Variables Are Set

Make sure these Firebase and other required variables are also set in Vercel:

**Firebase Client (All prefixed with NEXT_PUBLIC_)**:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

**Firebase Admin (Server-side)**:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

**Other Services**:
- `GEMINI_API_KEY`
- `JWT_SECRET`

**Admin Console** (if using):
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

### Step 3: Deploy the Code Changes

Push the updated code to trigger a new deployment:

```bash
git add .
git commit -m "fix: Configure passkey authentication for production deployment"
git push origin main
```

### Step 4: Verify the Deployment

1. Wait for Vercel to complete the deployment (usually 1-2 minutes)
2. Visit https://penny-amber.vercel.app
3. Try registering a passkey again
4. The error should be resolved

## Alternative: Using a Custom Domain

If you're using a custom domain (e.g., `penny.yourdomain.com`):

1. Set `NEXT_PUBLIC_RP_ID=penny.yourdomain.com`
2. Set `NEXT_PUBLIC_APP_URL=https://penny.yourdomain.com`
3. Make sure your custom domain is properly configured in Vercel

## Testing Locally

To test locally with the updated configuration:

1. Keep your `.env.local` with localhost settings:
   ```
   NEXT_PUBLIC_RP_ID=localhost
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

2. The new `passkey-config.ts` will automatically detect the environment

## Troubleshooting

### Error persists after deployment

1. **Clear browser cache**: Passkey configurations can be cached
2. **Check Vercel logs**: Go to Deployments → View Function Logs
3. **Verify environment variables**: Make sure they're set for the Production environment, not just Preview

### Multiple domains

If you have multiple deployment environments:
- **Production**: Use the production domain in environment variables
- **Preview**: Vercel automatically uses the preview URL
- **Development**: Use localhost

The new configuration automatically handles this based on `window.location.hostname`.

## What Changed

### New Files
- `src/lib/passkey-config.ts`: Smart configuration that auto-detects environment

### Updated Files
- `src/lib/passkey-utils.ts`: Now uses the new configuration module
- `env.example`: Clearer documentation for production setup

### Why This Fix Works

The previous implementation hardcoded `localhost` as a fallback, which was sent to the browser even in production. The new implementation:

1. Prioritizes environment variables (set in Vercel)
2. Falls back to auto-detecting the current hostname
3. Works seamlessly across development and production environments

