import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

export interface AuthenticatedUser {
  userId: string;
  email?: string;
}

/**
 * Verify the `Authorization: Bearer <Firebase ID token>` header of a request.
 *
 * Both the web app (see `authFetch` in `@/lib/authFetch`) and the Flutter
 * mobile app send the signed-in user's Firebase ID token this way.
 *
 * @returns The verified user, or null when the header is missing or invalid.
 */
export async function getAuthenticatedUser(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim(); // strip "Bearer "
  if (!token) {
    return null;
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    return { userId: decodedToken.uid, email: decodedToken.email };
  } catch (error) {
    console.warn("[Auth] Invalid Bearer token:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Extract the verified Firebase UID from a request's Bearer token.
 *
 * @returns The Firebase UID if a valid Bearer token is present, otherwise null.
 */
export async function getAuthenticatedUserId(
  request: NextRequest
): Promise<string | null> {
  const user = await getAuthenticatedUser(request);
  return user?.userId ?? null;
}

export type RequireAuthResult =
  | { ok: true; userId: string; email?: string }
  | { ok: false; response: NextResponse };

/**
 * Require a verified Firebase ID token on a request.
 *
 * The caller's identity always comes from the verified token. A `userId`
 * the client sent in the body or query (`claimedUserId`) is never trusted:
 * when present it must match the token's uid, otherwise the request is
 * rejected with 403.
 *
 * Usage:
 *   const auth = await requireAuthenticatedUser(request, body.userId);
 *   if (!auth.ok) return auth.response;
 *   const userId = auth.userId;
 */
export async function requireAuthenticatedUser(
  request: NextRequest,
  claimedUserId?: unknown
): Promise<RequireAuthResult> {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Unauthorized",
          details: "A valid Firebase ID token is required (Authorization: Bearer <token>)",
        },
        { status: 401 }
      ),
    };
  }

  if (
    claimedUserId !== undefined &&
    claimedUserId !== null &&
    claimedUserId !== "" &&
    claimedUserId !== user.userId
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Forbidden",
          details: "userId does not match the authenticated user",
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: user.userId, email: user.email };
}
