/**
 * React Hook for Passkey Operations
 * Handles passkey registration, authentication, and management
 */

import { useState, useEffect } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/types';

interface Passkey {
  id: string;
  deviceName: string;
  credentialDeviceType: string;
  credentialBackedUp: boolean;
  createdAt: string;
  lastUsedAt: string;
}

export function usePasskey() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);

  // Check if WebAuthn is available
  useEffect(() => {
    const checkAvailability = async () => {
      if (typeof window === 'undefined') return;
      
      try {
        const available = window.PublicKeyCredential !== undefined;
        setIsAvailable(available);

        if (available) {
          // Check for platform authenticator (biometrics)
          const hasPlatformAuthenticator = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          setIsAvailable(hasPlatformAuthenticator);
        }
      } catch {
        setIsAvailable(false);
      }
    };

    checkAvailability();
  }, []);

  /**
   * Register a new passkey
   */
  const registerPasskey = async (userId: string, email: string, displayName?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Start registration on server
      const startResponse = await fetch('/api/auth/passkey/register/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email, displayName }),
      });

      if (!startResponse.ok) {
        const data = await startResponse.json();
        throw new Error(data.error || 'Failed to start registration');
      }

      const { options } = await startResponse.json();

      // Prompt user for biometric/passkey
      const registrationResponse: RegistrationResponseJSON = await startRegistration(options);

      // Verify registration on server
      const verifyResponse = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, response: registrationResponse }),
      });

      if (!verifyResponse.ok) {
        const data = await verifyResponse.json();
        throw new Error(data.error || 'Failed to verify registration');
      }

      const result = await verifyResponse.json();
      
      // Refresh passkey list
      await loadPasskeys();

      setIsLoading(false);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      setError(errorMessage);
      setIsLoading(false);
      throw err;
    }
  };

  /**
   * Authenticate with passkey
   */
  const authenticateWithPasskey = async (email?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Start authentication on server
      const startResponse = await fetch('/api/auth/passkey/authenticate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!startResponse.ok) {
        const data = await startResponse.json();
        throw new Error(data.error || 'Failed to start authentication');
      }

      const { options, challengeId } = await startResponse.json();

      // Prompt user for biometric/passkey
      const authenticationResponse: AuthenticationResponseJSON = await startAuthentication(options);

      // Verify authentication on server
      const verifyResponse = await fetch('/api/auth/passkey/authenticate/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, response: authenticationResponse }),
      });

      if (!verifyResponse.ok) {
        const data = await verifyResponse.json();
        throw new Error(data.error || 'Failed to verify authentication');
      }

      const result = await verifyResponse.json();

      setIsLoading(false);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
      setError(errorMessage);
      setIsLoading(false);
      throw err;
    }
  };

  /**
   * Load user's registered passkeys
   * Note: This requires the user to be authenticated (have a session)
   */
  const loadPasskeys = async () => {
    try {
      const response = await fetch('/api/auth/passkey/list');
      
      // Handle 401 gracefully - user just needs to log in first
      if (response.status === 401) {
        // User not authenticated yet - this is OK, just clear passkeys
        setPasskeys([]);
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to load passkeys');
      }

      const { passkeys: loadedPasskeys } = await response.json();
      setPasskeys(loadedPasskeys || []);
    } catch (err) {
      console.error('Error loading passkeys:', err);
      // Don't set error for auth issues - just clear passkeys
      setPasskeys([]);
    }
  };

  /**
   * Delete a passkey
   */
  const deletePasskey = async (passkeyId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/passkey/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passkeyId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete passkey');
      }

      // Refresh passkey list
      await loadPasskeys();

      setIsLoading(false);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete passkey';
      setError(errorMessage);
      setIsLoading(false);
      throw err;
    }
  };

  /**
   * Check if conditional mediation (autofill) is available
   */
  const checkConditionalMediation = async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      return false;
    }

    try {
      const available = await PublicKeyCredential.isConditionalMediationAvailable();
      return available;
    } catch {
      return false;
    }
  };

  return {
    passkeys,
    isLoading,
    error,
    isAvailable,
    registerPasskey,
    authenticateWithPasskey,
    loadPasskeys,
    deletePasskey,
    checkConditionalMediation,
  };
}


