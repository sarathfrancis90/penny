import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { withObservability } from '@/lib/observability/withObservability';
import { requireAuthenticatedUser } from '@/lib/auth-middleware';

/**
 * GET /api/auth/passkey/list
 * List all passkeys for the authenticated user
 */
async function getHandler(request: NextRequest) {
  try {
    // Identify the user from their verified Firebase ID token
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;

    // Get all passkeys for this user
    const passkeysSnapshot = await adminDb
      .collection('passkeys')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    const passkeys = passkeysSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        deviceName: data.deviceName,
        credentialDeviceType: data.credentialDeviceType,
        credentialBackedUp: data.credentialBackedUp,
        createdAt: data.createdAt?.toDate().toISOString(),
        lastUsedAt: data.lastUsedAt?.toDate().toISOString(),
        // Don't send sensitive data to client
      };
    });

    return NextResponse.json({
      success: true,
      passkeys,
    });
  } catch (error) {
    console.error('Error listing passkeys:', error);
    return NextResponse.json(
      {
        error: 'Failed to list passkeys',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export const GET = withObservability(getHandler, { route: '/api/auth/passkey/list' });
