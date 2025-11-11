import { NextRequest, NextResponse } from 'next/server';
import { generatePasskeyRegistrationOptions } from '@/lib/passkey-utils';
import { adminDb } from '@/lib/firebase-admin';

/**
 * POST /api/auth/passkey/register/start
 * Generate registration options for creating a new passkey
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, email, displayName } = await request.json();

    if (!userId || !email) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate registration options
    const options = await generatePasskeyRegistrationOptions(
      userId,
      email,
      displayName || email
    );

    // Store the challenge temporarily for verification
    // Using a temporary collection that auto-expires after 5 minutes
    await adminDb.collection('challenges').doc(userId).set({
      challenge: options.challenge,
      type: 'registration',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    });

    return NextResponse.json({
      success: true,
      options,
    });
  } catch (error) {
    console.error('Error starting passkey registration:', error);
    return NextResponse.json(
      { 
        error: 'Failed to start passkey registration',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

