import { NextRequest, NextResponse } from 'next/server';
import { verifyPasskeyRegistration, getDeviceInfo } from '@/lib/passkey-utils';
import { collection, doc, getDoc, deleteDoc, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';

/**
 * POST /api/auth/passkey/register/verify
 * Verify and complete passkey registration
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, response } = await request.json();

    if (!userId || !response) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get the stored challenge
    const challengeRef = doc(db, 'challenges', userId);
    const challengeDoc = await getDoc(challengeRef);

    if (!challengeDoc.exists()) {
      return NextResponse.json(
        { error: 'Challenge not found or expired' },
        { status: 400 }
      );
    }

    const { challenge, expiresAt } = challengeDoc.data();

    // Check if challenge has expired
    if (new Date() > expiresAt.toDate()) {
      await deleteDoc(challengeRef);
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
    await addDoc(collection(db, 'passkeys'), {
      userId,
      credentialID: Buffer.from(registrationInfo.credential.id).toString('base64url'),
      credentialPublicKey: Buffer.from(registrationInfo.credential.publicKey).toString('base64url'),
      counter: registrationInfo.credential.counter,
      credentialDeviceType: registrationInfo.credentialDeviceType,
      credentialBackedUp: registrationInfo.credentialBackedUp,
      deviceName: getDeviceInfo(),
      transports: response.response?.transports || [],
      createdAt: Timestamp.now(),
      lastUsedAt: Timestamp.now(),
    });

    // Clean up the challenge
    await deleteDoc(challengeRef);

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

