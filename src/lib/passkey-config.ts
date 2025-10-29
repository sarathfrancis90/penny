/**
 * Passkey Configuration
 * Handles environment-specific configuration for WebAuthn/Passkey authentication
 */

/**
 * Get the Relying Party ID based on the current environment
 * This must match the domain where the app is running
 */
export function getRPID(): string {
  // Use environment variable if set
  if (process.env.NEXT_PUBLIC_RP_ID) {
    return process.env.NEXT_PUBLIC_RP_ID;
  }

  // Auto-detect based on hostname (client-side only)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    // Development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'localhost';
    }
    
    // Production - return the actual hostname
    return hostname;
  }

  // Server-side fallback
  // In production, this should be set via environment variables
  return 'localhost';
}

/**
 * Get the origin URL based on the current environment
 */
export function getOrigin(): string {
  // Use environment variable if set
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // Auto-detect based on location (client-side only)
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  // Server-side fallback
  return 'http://localhost:3000';
}

/**
 * Get the app name for passkey prompts
 */
export function getRPName(): string {
  return process.env.NEXT_PUBLIC_APP_NAME || 'Penny AI';
}

/**
 * Get all passkey configuration
 */
export function getPasskeyConfig() {
  return {
    rpID: getRPID(),
    rpName: getRPName(),
    origin: getOrigin(),
  };
}

