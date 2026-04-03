import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

/**
 * Extract and validate the authenticated user ID from a request.
 *
 * Resolution order:
 *  1. `Authorization: Bearer <Firebase ID token>` header — validated via
 *     Firebase Admin SDK. Used by the Flutter mobile app.
 *  2. Falls back to `null` so callers can try body-based userId (web backward
 *     compat) themselves.
 *
 * @returns The Firebase UID if a valid Bearer token is present, otherwise null.
 */
export async function getAuthenticatedUserId(
  request: NextRequest
): Promise<string | null> {
  const authHeader = request.headers.get("authorization");

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7); // strip "Bearer "

    if (!token) {
      return null;
    }

    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      return decodedToken.uid;
    } catch (error) {
      console.warn("[Auth] Invalid Bearer token:", error instanceof Error ? error.message : error);
      return null;
    }
  }

  return null;
}
