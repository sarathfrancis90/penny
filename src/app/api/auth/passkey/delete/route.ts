import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { withObservability } from '@/lib/observability/withObservability';
import { requireAuthenticatedUser } from '@/lib/auth-middleware';

/**
 * DELETE /api/auth/passkey/delete
 * Delete a specific passkey for the authenticated user
 */
async function deleteHandler(request: NextRequest) {
  try {
    // Identify the user from their verified Firebase ID token
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;

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

export const DELETE = withObservability(deleteHandler, { route: '/api/auth/passkey/delete' });
