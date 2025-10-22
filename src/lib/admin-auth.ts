import { cookies } from "next/headers";
import crypto from "crypto";

// Admin credentials - stored in environment variables
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "penny_admin_2024";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "PnY@2024#Secure$Admin!";

// Session management
const ADMIN_SESSION_COOKIE = "penny_admin_session";
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "admin-secret-key-change-in-production";

interface AdminSession {
  username: string;
  loginTime: number;
  expiresAt: number;
}

/**
 * Verify admin credentials
 */
export function verifyAdminCredentials(username: string, password: string): boolean {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

/**
 * Create admin session token
 */
export function createAdminSession(username: string): string {
  const session: AdminSession = {
    username,
    loginTime: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  };

  const sessionData = JSON.stringify(session);
  const hmac = crypto.createHmac("sha256", SESSION_SECRET);
  const signature = hmac.update(sessionData).digest("hex");
  
  return Buffer.from(JSON.stringify({ session, signature })).toString("base64");
}

/**
 * Verify admin session token
 */
export function verifyAdminSession(token: string): boolean {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString());
    const { session, signature } = decoded;

    // Verify signature
    const hmac = crypto.createHmac("sha256", SESSION_SECRET);
    const expectedSignature = hmac.update(JSON.stringify(session)).digest("hex");
    
    if (signature !== expectedSignature) {
      return false;
    }

    // Check expiration
    const sessionData: AdminSession = session;
    if (Date.now() > sessionData.expiresAt) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Set admin session cookie
 */
export async function setAdminSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 24 * 60 * 60, // 24 hours
    path: "/",
  });
}

/**
 * Get admin session from cookie
 */
export async function getAdminSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE);
  return sessionCookie?.value || null;
}

/**
 * Clear admin session
 */
export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

/**
 * Check if user is admin (for middleware)
 */
export async function isAdmin(): Promise<boolean> {
  const session = await getAdminSession();
  if (!session) return false;
  return verifyAdminSession(session);
}

