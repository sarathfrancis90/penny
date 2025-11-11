import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-min-32-characters-long'
);

/**
 * DELETE /api/auth/passkey/delete
 * Delete a specific passkey for the authenticated user
 */
export async function DELETE(request: NextRequest) {
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

    const { passkeyId } = await request.json();

    if (!passkeyId) {
      return NextResponse.json(
        { error: 'Passkey ID is required' },
        { status: 400 }
      );
    }

    // Get the passkey document
    const passkeyDoc = await adminDb.collection('passkeys').doc(passkeyId).get();

    if (!passkeyDoc.exists) {
      return NextResponse.json(
        { error: 'Passkey not found' },
        { status: 404 }
      );
    }

    const passkeyData = passkeyDoc.data()!;

    // Verify the passkey belongs to the authenticated user
    if (passkeyData.userId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized to delete this passkey' },
        { status: 403 }
      );
    }

    // Delete the passkey
    await adminDb.collection('passkeys').doc(passkeyId).delete();

    return NextResponse.json({
      success: true,
      message: 'Passkey deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting passkey:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete passkey',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}


