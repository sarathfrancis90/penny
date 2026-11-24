import { auth } from "@/lib/firebase";

/**
 * `fetch` for Penny's own API routes. Attaches the signed-in user's Firebase
 * ID token as `Authorization: Bearer <token>`, which every user-data route
 * verifies server-side (see `requireAuthenticatedUser` in
 * `@/lib/auth-middleware`). Without a signed-in user the request is sent
 * without a token and the route answers 401.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  await auth.authStateReady();
  const headers = new Headers(init.headers);
  const user = auth.currentUser;
  if (user && !headers.has("Authorization")) {
    const token = await user.getIdToken();
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
