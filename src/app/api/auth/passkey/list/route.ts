import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-min-32-characters-long'
);

/**
 * GET /api/auth/passkey/list
 * List all passkeys for the authenticated user
 */
export async function GET() {
  try {
    // Get user ID from session
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');

    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Verify JWT and get user ID
    const { payload } = await jwtVerify(sessionCookie.value, JWT_SECRET);
    const userId = payload.userId as string;

    if (!userId) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      );
    }

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

