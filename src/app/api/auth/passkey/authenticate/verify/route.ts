import { NextRequest, NextResponse } from 'next/server';
import { verifyPasskeyAuthentication } from '@/lib/passkey-utils';
import { collection, query, where, getDocs, doc, getDoc, deleteDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { SignJWT } from 'jose';
import { cookies } from 'next/headers';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-min-32-characters-long'
);

/**
 * POST /api/auth/passkey/authenticate/verify
 * Verify passkey authentication and create session
 */
export async function POST(request: NextRequest) {
  try {
    const { challengeId, response } = await request.json();

    if (!challengeId || !response) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get the stored challenge
    const challengeRef = doc(db, 'challenges', challengeId);
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

    // Find the passkey credential by credentialID
    const credentialID = response.id;
    const passkeysRef = collection(db, 'passkeys');
    const passkeysQuery = query(passkeysRef, where('credentialID', '==', credentialID));
    const passkeysSnapshot = await getDocs(passkeysQuery);

    if (passkeysSnapshot.empty) {
      return NextResponse.json(
        { error: 'Passkey not found' },
        { status: 404 }
      );
    }

    const passkeyDoc = passkeysSnapshot.docs[0];
    const passkeyData = passkeyDoc.data();

    // Prepare credential data for verification
    const credential = {
      id: Buffer.from(passkeyData.credentialID, 'base64url'),
      publicKey: Buffer.from(passkeyData.credentialPublicKey, 'base64url'),
      counter: passkeyData.counter,
    };

    // Verify the authentication response
    const verification = await verifyPasskeyAuthentication(
      response as AuthenticationResponseJSON,
      challenge,
      credential
    );

    if (!verification.verified) {
      return NextResponse.json(
        { error: 'Passkey authentication verification failed' },
        { status: 400 }
      );
    }

    // Authentication successful! Update counter and last used
    await updateDoc(doc(db, 'passkeys', passkeyDoc.id), {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: Timestamp.now(),
    });

    // Create session using Firebase-compatible approach
    const userId = passkeyData.userId;
    
    // Create JWT session token
    const token = await new SignJWT({ userId, authMethod: 'passkey' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .setIssuedAt()
      .sign(JWT_SECRET);

    // Set session cookie
    const cookieStore = await cookies();
    cookieStore.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    // Clean up the challenge
    await deleteDoc(challengeRef);

    return NextResponse.json({
      success: true,
      verified: true,
      userId,
      message: 'Authentication successful',
    });
  } catch (error) {
    console.error('Error verifying passkey authentication:', error);
    return NextResponse.json(
      { 
        error: 'Failed to verify passkey authentication',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

