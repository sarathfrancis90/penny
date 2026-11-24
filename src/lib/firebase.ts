import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase (avoid multiple initializations)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Dev-only: point the client SDKs at the local Firebase emulators. Never active
// in production builds; the global flag stops a second connect on hot reload.
const emulatorGlobal = globalThis as { __pennyFirebaseEmulators?: boolean };
if (
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" &&
  process.env.NODE_ENV !== "production" &&
  !emulatorGlobal.__pennyFirebaseEmulators
) {
  emulatorGlobal.__pennyFirebaseEmulators = true;
  const hostPort = (value: string | undefined, fallback: string) => {
    const [host, port] = (value || fallback).split(":");
    return [host, Number(port)] as const;
  };
  const [fsHost, fsPort] = hostPort(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST, "127.0.0.1:8285");
  const [stHost, stPort] = hostPort(process.env.NEXT_PUBLIC_STORAGE_EMULATOR_HOST, "127.0.0.1:9299");
  connectAuthEmulator(auth, `http://${process.env.NEXT_PUBLIC_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, fsHost, fsPort);
  connectStorageEmulator(storage, stHost, stPort);
}

// Export the app instance
export default app;
