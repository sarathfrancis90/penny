import { NextRequest, NextResponse } from 'next/server';
import { generatePasskeyAuthenticationOptions } from '@/lib/passkey-utils';
import { adminDb } from '@/lib/firebase-admin';

/**
 * POST /api/auth/passkey/authenticate/start
 * Generate authentication options for passkey login
 * Supports both identifier-first flow and conditional UI (autofill)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    let allowCredentials: Array<{ id: string; type: string }> | undefined;

    // If email provided (identifier-first flow), get user's registered passkeys
    if (email) {
      // For now, return empty allowCredentials to support conditional UI
      // In a full implementation, you'd query user's passkeys by email
      allowCredentials = [];
    }

    // Generate authentication options
    const options = await generatePasskeyAuthenticationOptions(allowCredentials);

    // Store the challenge temporarily for verification
    const challengeId = email || `anon-${Date.now()}`;
    await adminDb.collection('challenges').doc(challengeId).set({
      challenge: options.challenge,
      type: 'authentication',
      email: email || null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    });

    return NextResponse.json({
      success: true,
      options,
      challengeId, // Return this so client can use it for verification
    });
  } catch (error) {
    console.error('Error starting passkey authentication:', error);
    return NextResponse.json(
      { 
        error: 'Failed to start passkey authentication',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

