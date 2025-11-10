import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-min-32-characters-long'
);

/**
 * POST /api/auth/session/create
 * Create a JWT session for an authenticated Firebase user
 * This bridges Firebase Authentication with the JWT session system used by passkeys
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, email } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

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
export async function DELETE() {
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


