import { cookies } from "next/headers";
import crypto from "crypto";
import type { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

// Legacy admin-console login. Credentials and the session-signing secret
// come only from the environment; if any is missing the login fails closed
// (no credentials accepted, no sessions issued or honoured).
const ADMIN_SESSION_COOKIE = "penny_admin_session";

interface LegacyAdminConfig {
  username: string;
  password: string;
  secret: string;
}

/** Read at call time so a removed setting takes effect immediately. */
function legacyAdminConfig(): LegacyAdminConfig | null {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!username || !password || !secret) return null;
  return { username, password, secret };
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sign(sessionData: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(sessionData).digest("hex");
}

interface AdminSession {
  username: string;
  loginTime: number;
  expiresAt: number;
}

/**
 * Verify admin credentials. Always false when the login is not configured.
 */
export function verifyAdminCredentials(username: string, password: string): boolean {
  const config = legacyAdminConfig();
  if (!config) return false;
  // Evaluate both comparisons so timing does not reveal which one failed.
  const userOk = safeEqual(username ?? "", config.username);
  const passOk = safeEqual(password ?? "", config.password);
  return userOk && passOk;
}

/**
 * Create admin session token. Throws when the login is not configured.
 */
export function createAdminSession(username: string): string {
  const config = legacyAdminConfig();
  if (!config) {
    throw new Error("Legacy admin login is not configured");
  }

  const session: AdminSession = {
    username,
    loginTime: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  };

  const signature = sign(JSON.stringify(session), config.secret);
  return Buffer.from(JSON.stringify({ session, signature })).toString("base64");
}

/**
 * Verify admin session token. Always false when the login is not configured.
 */
export function verifyAdminSession(token: string): boolean {
  const config = legacyAdminConfig();
  if (!config) return false;

  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString());
    const { session, signature } = decoded;

    if (typeof signature !== "string" || !session) {
      return false;
    }

    // Verify signature
    if (!safeEqual(signature, sign(JSON.stringify(session), config.secret))) {
      return false;
    }

    // Check expiration
    const sessionData: AdminSession = session;
    if (typeof sessionData.expiresAt !== "number" || Date.now() > sessionData.expiresAt) {
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
 * Check if user is admin (for middleware) — legacy HMAC session path.
 */
export async function isAdmin(): Promise<boolean> {
  const session = await getAdminSession();
  if (!session) return false;
  return verifyAdminSession(session);
}

// ---------------------------------------------------------------------------
// Firebase custom-claims admin auth (new primary path)
// ---------------------------------------------------------------------------

/**
 * Thrown by requireAdmin when the request lacks a valid admin token.
 * The `status` field is the HTTP code the caller should return.
 */
export class AdminAuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AdminAuthError";
  }
}

export interface AdminAuthInfo {
  uid: string;
  email?: string;
}

/**
 * Verifies the Firebase ID token on the Authorization header and asserts the
 * `admin: true` custom claim. Throws AdminAuthError on failure.
 *
 * Client call pattern:
 *   const token = await auth.currentUser?.getIdToken();
 *   fetch('/api/admin/...', { headers: { Authorization: `Bearer ${token}` } })
 */
export async function requireAdmin(req: NextRequest): Promise<AdminAuthInfo> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AdminAuthError(401, "Missing bearer token");
  }
  const token = authHeader.slice("Bearer ".length);

  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    throw new AdminAuthError(401, "Invalid token");
  }

  if (decoded.admin !== true) {
    throw new AdminAuthError(403, "Admin claim required");
  }
  return { uid: decoded.uid, email: decoded.email };
}

/**
 * Wrapper returning either a Response (on failure) or AdminAuthInfo (on success).
 * Lets API routes early-return the response without try/catch boilerplate:
 *
 *   const auth = await verifyAdmin(req);
 *   if (auth instanceof Response) return auth;
 *   // auth.uid is available here
 */
export async function verifyAdmin(
  req: NextRequest,
): Promise<Response | AdminAuthInfo> {
  try {
    return await requireAdmin(req);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw e;
  }
}

