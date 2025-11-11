import { NextRequest, NextResponse } from 'next/server';
import { verifyPasskeyRegistration } from '@/lib/passkey-utils';
import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';

/**
 * POST /api/auth/passkey/register/verify
 * Verify and complete passkey registration
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, response, deviceName } = await request.json();

    if (!userId || !response) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get the stored challenge
    const challengeDoc = await adminDb.collection('challenges').doc(userId).get();

    if (!challengeDoc.exists) {
      return NextResponse.json(
        { error: 'Challenge not found or expired' },
        { status: 400 }
      );
    }

    const { challenge, expiresAt } = challengeDoc.data()!;

    // Check if challenge has expired
    if (new Date() > expiresAt.toDate()) {
      await adminDb.collection('challenges').doc(userId).delete();
      return NextResponse.json(
        { error: 'Challenge expired. Please try again.' },
        { status: 400 }
      );
    }

    // Verify the registration response
    const verification = await verifyPasskeyRegistration(
      response as RegistrationResponseJSON,
      challenge
    );

    if (!verification.verified) {
      return NextResponse.json(
        { error: 'Passkey registration verification failed' },
        { status: 400 }
      );
    }

    // Registration successful! Store the credential
    const { registrationInfo } = verification;
    
    if (!registrationInfo) {
      return NextResponse.json(
        { error: 'Registration info missing' },
        { status: 500 }
      );
    }

    // Store the passkey credential in Firestore
    const credentialIDToStore = Buffer.from(registrationInfo.credential.id).toString('base64url');
    console.log('Storing passkey with credentialID:', credentialIDToStore);
    console.log('Response ID from client:', response.id);
    console.log('IDs match:', credentialIDToStore === response.id);
    
    await adminDb.collection('passkeys').add({
      userId,
      credentialID: credentialIDToStore,
      credentialPublicKey: Buffer.from(registrationInfo.credential.publicKey).toString('base64url'),
      counter: registrationInfo.credential.counter,
      credentialDeviceType: registrationInfo.credentialDeviceType,
      credentialBackedUp: registrationInfo.credentialBackedUp,
      deviceName: deviceName || 'Unknown Device',
      transports: response.response?.transports || [],
      createdAt: Timestamp.now(),
      lastUsedAt: Timestamp.now(),
    });

    // Clean up the challenge
    await adminDb.collection('challenges').doc(userId).delete();

    return NextResponse.json({
      success: true,
      verified: true,
      message: 'Passkey registered successfully',
    });
  } catch (error) {
    console.error('Error verifying passkey registration:', error);
    return NextResponse.json(
      { 
        error: 'Failed to verify passkey registration',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

