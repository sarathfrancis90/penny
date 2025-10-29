/**
 * Passkey Utilities for WebAuthn Implementation
 * Following October 2025 best practices and WebAuthn Level 3 specification
 * 
 * WebAuthn Level 3: https://www.w3.org/TR/webauthn-3/
 * FIDO2 Standards: https://fidoalliance.org/specifications/
 * 
 * Key Features:
 * - Resident keys (discoverable credentials) for autofill support
 * - Conditional mediation for seamless passkey autofill in login forms
 * - Platform authenticators (Face ID, Touch ID, Windows Hello)
 * - User verification required for enhanced security
 * - Multi-device passkeys with cloud sync (iCloud Keychain, Google Password Manager)
 */

import { 
  generateRegistrationOptions, 
  verifyRegistrationResponse, 
  generateAuthenticationOptions, 
  verifyAuthenticationResponse
} from '@simplewebauthn/server';
import type { 
  RegistrationResponseJSON, 
  AuthenticationResponseJSON 
} from '@simplewebauthn/types';

// Get RP (Relying Party) configuration from environment
const rpName = process.env.NEXT_PUBLIC_APP_NAME || 'Penny AI';
const rpID = process.env.NEXT_PUBLIC_RP_ID || (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
const origin = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

/**
 * Generate options for passkey registration (WebAuthn create)
 * Uses resident keys (discoverable credentials) for best UX
 */
export async function generatePasskeyRegistrationOptions(userId: string, userName: string, userDisplayName: string) {
  try {
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(userId),
      userName,
      userDisplayName,
      // Request attestation for enhanced security verification
      attestationType: 'none', // 'none' for privacy, 'direct' for more security
      // Prefer platform authenticators (device biometrics) over cross-platform (USB keys)
      authenticatorSelection: {
        // Require resident key (discoverable credential) for autofill support
        residentKey: 'required',
        // Prefer platform authenticators (Face ID, Touch ID, Windows Hello)
        authenticatorAttachment: 'platform',
        // Require user verification (biometric/PIN)
        userVerification: 'required',
      },
      // Support multiple algorithms for broader compatibility
      supportedAlgorithmIDs: [-7, -257], // ES256 and RS256
    });

    return options;
  } catch (error) {
    console.error('Error generating registration options:', error);
    throw new Error('Failed to generate passkey registration options');
  }
}

/**
 * Verify passkey registration response
 */
export async function verifyPasskeyRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string
) {
  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    return verification;
  } catch (error) {
    console.error('Error verifying registration:', error);
    throw new Error('Failed to verify passkey registration');
  }
}

/**
 * Generate options for passkey authentication (WebAuthn get)
 * Supports conditional UI (autofill) for seamless login
 */
export async function generatePasskeyAuthenticationOptions(allowCredentials?: Array<{ id: string; type: string }>) {
  try {
    const options = await generateAuthenticationOptions({
      rpID,
      // If allowCredentials is empty, it enables discoverable credentials (autofill)
      allowCredentials: allowCredentials?.map(cred => ({
        id: cred.id,
        transports: ['internal', 'hybrid'], // Support platform and cross-platform
      })),
      userVerification: 'required',
    });

    return options;
  } catch (error) {
    console.error('Error generating authentication options:', error);
    throw new Error('Failed to generate passkey authentication options');
  }
}

/**
 * Verify passkey authentication response
 */
export async function verifyPasskeyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  credential: {
    publicKey: Uint8Array;
    id: Uint8Array;
    counter: number;
  }
) {
  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        // Use .slice() to ensure proper Uint8Array<ArrayBuffer> type
        publicKey: credential.publicKey.slice(),
        id: Buffer.from(credential.id).toString('base64url'), // Convert to Base64URLString
        counter: credential.counter,
      },
      requireUserVerification: true,
    });

    return verification;
  } catch (error) {
    console.error('Error verifying authentication:', error);
    throw new Error('Failed to verify passkey authentication');
  }
}

/**
 * Get device/browser name for better UX in device management
 */
export function getDeviceInfo(): string {
  if (typeof window === 'undefined') return 'Unknown Device';

  const ua = navigator.userAgent;
  let device = 'Unknown Device';
  
  // Detect OS/Device
  if (/iPhone|iPad|iPod/.test(ua)) {
    device = 'iPhone/iPad';
  } else if (/Android/.test(ua)) {
    device = 'Android Device';
  } else if (/Macintosh|Mac OS X/.test(ua)) {
    device = 'Mac';
  } else if (/Windows/.test(ua)) {
    device = 'Windows PC';
  } else if (/Linux/.test(ua)) {
    device = 'Linux PC';
  }

  // Detect Browser
  let browser = '';
  if (/Chrome/.test(ua) && !/Edg/.test(ua)) {
    browser = 'Chrome';
  } else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
    browser = 'Safari';
  } else if (/Firefox/.test(ua)) {
    browser = 'Firefox';
  } else if (/Edg/.test(ua)) {
    browser = 'Edge';
  }

  return browser ? `${device} (${browser})` : device;
}

/**
 * Check if WebAuthn is available in the current browser
 */
export function isWebAuthnAvailable(): boolean {
  return typeof window !== 'undefined' && 
         window.PublicKeyCredential !== undefined && 
         typeof window.PublicKeyCredential === 'function';
}

/**
 * Check if platform authenticator (biometrics) is available
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnAvailable()) return false;
  
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Check if conditional mediation (autofill) is supported
 */
export async function isConditionalMediationAvailable(): Promise<boolean> {
  if (!isWebAuthnAvailable()) return false;
  
  try {
    return await PublicKeyCredential.isConditionalMediationAvailable();
  } catch {
    return false;
  }
}

