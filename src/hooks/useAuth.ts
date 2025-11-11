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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setLoading(false);
      
      // Auto-create JWT session for authenticated users
      if (user) {
        try {
          await fetch('/api/auth/session/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              userId: user.uid,
              email: user.email 
            }),
          });
        } catch (error) {
          console.error('Failed to sync session:', error);
        }
      }
    });

    return unsubscribe;
  }, []);

  const signUp = async (email: string, password: string) => {
    return createUserWithEmailAndPassword(auth, email, password);
  };

  const signIn = async (email: string, password: string) => {
    return signInWithEmailAndPassword(auth, email, password);
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
