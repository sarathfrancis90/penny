import { NextRequest, NextResponse } from "next/server";
import {
  verifyAdminCredentials,
  createAdminSession,
  setAdminSessionCookie,
  clearAdminSession,
  getAdminSession,
  verifyAdminSession,
} from "@/lib/admin-auth";

// POST - Admin login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    // Verify credentials
    if (!verifyAdminCredentials(username, password)) {
      // Add delay to prevent brute force attacks
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Create session
    const sessionToken = createAdminSession(username);
    await setAdminSessionCookie(sessionToken);

    return NextResponse.json({
      success: true,
      message: "Admin login successful",
    });
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { error: "Login failed" },
      { status: 500 }
    );
  }
}

// GET - Check admin session
export async function GET() {
  try {
    const session = await getAdminSession();
    
    if (!session || !verifyAdminSession(session)) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
    });
  } catch (error) {
    console.error("Admin session check error:", error);
    return NextResponse.json(
      { authenticated: false },
      { status: 500 }
    );
  }
}

// DELETE - Admin logout
export async function DELETE() {
  try {
    await clearAdminSession();
    
    return NextResponse.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Admin logout error:", error);
    return NextResponse.json(
      { error: "Logout failed" },
      { status: 500 }
    );
  }
}

