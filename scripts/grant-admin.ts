#!/usr/bin/env tsx
/**
 * One-off script to grant Firebase Auth admin custom claim.
 *
 * Usage: `npx tsx scripts/grant-admin.ts <firebase-uid>`
 *
 * Requires env `FIREBASE_ADMIN_CREDENTIALS` = service account JSON (single line).
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

async function main() {
  const uid = process.argv[2];
  if (!uid) {
    console.error('Usage: npx tsx scripts/grant-admin.ts <firebase-uid>');
    process.exit(1);
  }

  const creds = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (!creds) {
    console.error('FIREBASE_ADMIN_CREDENTIALS env var required');
    process.exit(1);
  }

  if (getApps().length === 0) {
    initializeApp({ credential: cert(JSON.parse(creds)) });
  }

  const auth = getAuth();
  await auth.setCustomUserClaims(uid, { admin: true });
  await auth.revokeRefreshTokens(uid);
  console.log(`✓ Granted admin + revoked tokens for ${uid}.`);
  console.log('  User must sign in again for the claim to appear in ID token.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
