import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { withObservability } from '@/lib/observability/withObservability';
import { requireAuthenticatedUser } from '@/lib/auth-middleware';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-min-32-characters-long'
);

/**
 * POST /api/auth/session/create
 * Create a JWT session for an authenticated Firebase user
 * This bridges Firebase Authentication with the JWT session system used by passkeys
 */
async function postHandler(request: NextRequest) {
  try {
    // Only mint a session for the user proven by a verified Firebase ID
    // token; a body userId must match it.
    const body = await request.json().catch(() => ({}));
    const auth = await requireAuthenticatedUser(request, body?.userId);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;
    const email = auth.email ?? null;

    // Create JWT session token
    const token = await new SignJWT({ 
      userId, 
      email,
      authMethod: 'firebase' 
    })
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

    return NextResponse.json({
      success: true,
      message: 'Session created successfully',
    });
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create session',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/session/create
 * Clear the JWT session (logout)
 */
async function deleteHandler() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete('session');

    return NextResponse.json({
      success: true,
      message: 'Session cleared',
    });
  } catch (error) {
    console.error('Error clearing session:', error);
    return NextResponse.json(
      {
        error: 'Failed to clear session',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export const POST = withObservability(postHandler, { route: '/api/auth/session/create' });
export const DELETE = withObservability(deleteHandler, { route: '/api/auth/session/create' });
