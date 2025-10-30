"use client";

import { useEffect, useState } from "react";
import {
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signUp = async (email: string, password: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Create JWT session for passkey compatibility
    try {
      await fetch('/api/auth/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: userCredential.user.uid,
          email: userCredential.user.email 
        }),
      });
    } catch (error) {
      console.error('Failed to create session:', error);
      // Don't fail signup if session creation fails
    }
    
    return userCredential;
  };

  const signIn = async (email: string, password: string) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    // Create JWT session for passkey compatibility
    try {
      await fetch('/api/auth/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: userCredential.user.uid,
          email: userCredential.user.email 
        }),
      });
    } catch (error) {
      console.error('Failed to create session:', error);
      // Don't fail login if session creation fails
    }
    
    return userCredential;
  };

  const signOut = async () => {
    // Clear JWT session
    try {
      await fetch('/api/auth/session/create', {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Failed to clear session:', error);
    }
    
    return firebaseSignOut(auth);
  };

  return {
    user,
    loading,
    signUp,
    signIn,
    signOut,
  };
}
