import { NextRequest, NextResponse } from 'next/server';
import { verifyPasskeyAuthentication } from '@/lib/passkey-utils';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { SignJWT } from 'jose';
import { cookies } from 'next/headers';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';
import { Timestamp } from 'firebase-admin/firestore';

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
    const challengeDoc = await adminDb.collection('challenges').doc(challengeId).get();

    if (!challengeDoc.exists) {
      return NextResponse.json(
        { error: 'Challenge not found or expired' },
        { status: 400 }
      );
    }

    const { challenge, expiresAt } = challengeDoc.data()!;

    // Check if challenge has expired
    if (new Date() > expiresAt.toDate()) {
      await adminDb.collection('challenges').doc(challengeId).delete();
      return NextResponse.json(
        { error: 'Challenge expired. Please try again.' },
        { status: 400 }
      );
    }

    // Find the passkey credential by credentialID
    const credentialID = response.id;
    const passkeysSnapshot = await adminDb
      .collection('passkeys')
      .where('credentialID', '==', credentialID)
      .get();

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
    await adminDb.collection('passkeys').doc(passkeyDoc.id).update({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: Timestamp.now(),
    });

    // Create session using Firebase-compatible approach
    const userId = passkeyData.userId;
    
    // Ensure Firebase Auth user exists (create if needed)
    let firebaseUser;
    try {
      firebaseUser = await adminAuth.getUser(userId);
    } catch (error: any) {
      // User doesn't exist in Firebase Auth, create one
      if (error.code === 'auth/user-not-found') {
        // Get user email from Firestore or use a placeholder
        const userDoc = await adminDb.collection('users').doc(userId).get();
        const email = userDoc.exists ? userDoc.data()?.email : `${userId}@passkey.local`;
        
        firebaseUser = await adminAuth.createUser({
          uid: userId,
          email: email,
          emailVerified: true,
        });
      } else {
        throw error;
      }
    }
    
    // Create Firebase custom token for client-side Firebase auth
    const customToken = await adminAuth.createCustomToken(userId);
    
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
    await adminDb.collection('challenges').doc(challengeId).delete();

    return NextResponse.json({
      success: true,
      verified: true,
      userId,
      customToken, // Send Firebase custom token to client
      message: 'Authentication successful',
    });
  } catch (error) {
    console.error('Error verifying passkey authentication:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to verify passkey authentication';
    let details = 'Unknown error';
    
    if (error instanceof Error) {
      details = error.message;
      
      // Check for specific Firebase errors
      if (error.message.includes('auth/')) {
        errorMessage = 'Failed to create Firebase session';
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: details
      },
      { status: 500 }
    );
  }
}

