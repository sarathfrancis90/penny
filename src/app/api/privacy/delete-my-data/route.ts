import { NextRequest } from 'next/server';
import { withObservability } from '@/lib/observability/withObservability';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

/**
 * Deletes user data across Firestore and best-effort downstream processors.
 * Firestore deletion is authoritative; downstream deletes are fire-and-forget
 * to avoid blocking the user on external API availability.
 */
async function handler(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const token = authHeader.slice('Bearer '.length);

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // User-scoped data
  const userScopedCollections = [
    'expenses',
    'budgets_personal',
    'income_sources_personal',
    'savings_goals_personal',
    'conversations',
    'notifications',
    'monthly_income_records',
    'budget_usage_cache',
    'budget_allocation_history',
  ];

  for (const col of userScopedCollections) {
    const snap = await adminDb
      .collection(col)
      .where('userId', '==', uid)
      .get();
    if (snap.empty) continue;
    // Firestore batch cap: 500 writes
    const chunks: FirebaseFirestore.QueryDocumentSnapshot[][] = [];
    for (let i = 0; i < snap.docs.length; i += 400) {
      chunks.push(snap.docs.slice(i, i + 400));
    }
    for (const chunk of chunks) {
      const batch = adminDb.batch();
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  // User profile doc
  try {
    await adminDb.collection('users').doc(uid).delete();
  } catch {
    // Non-fatal: profile may not exist
  }

  // Passkeys — if present
  try {
    const passkeys = await adminDb
      .collection('passkeys')
      .where('userId', '==', uid)
      .get();
    const batch = adminDb.batch();
    passkeys.docs.forEach((d) => batch.delete(d.ref));
    if (passkeys.size) await batch.commit();
  } catch {
    // Non-fatal
  }

  // Revoke refresh tokens, then delete auth record
  await adminAuth.revokeRefreshTokens(uid);
  await adminAuth.deleteUser(uid);

  // Downstream best-effort deletes (fire and forget, wrapped in allSettled)
  const deletes: Promise<unknown>[] = [];

  if (
    process.env.POSTHOG_PERSONAL_API_KEY &&
    process.env.POSTHOG_PROJECT_ID
  ) {
    const host =
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';
    deletes.push(
      fetch(
        `${host}/api/projects/${process.env.POSTHOG_PROJECT_ID}/persons/?distinct_id=${encodeURIComponent(uid)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,
          },
        },
      ),
    );
  }

  if (
    process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT_WEB
  ) {
    deletes.push(
      fetch(
        `https://sentry.io/api/0/projects/${process.env.SENTRY_ORG}/${process.env.SENTRY_PROJECT_WEB}/users/${encodeURIComponent(uid)}/`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}`,
          },
        },
      ),
    );
  }

  await Promise.allSettled(deletes);

  return new Response(
    JSON.stringify({ status: 'deleted', uid }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

export const POST = withObservability(handler, {
  route: '/api/privacy/delete-my-data',
});
