/**
 * useNotificationPreferences Hook
 * 
 * Manages user notification preferences.
 * Auto-creates default preferences for new users.
 */

'use client';

import { useState, useEffect } from 'react';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  NotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES
} from '@/lib/types/notifications';
import { toast } from 'sonner';

interface UseNotificationPreferencesReturn {
  preferences: NotificationPreferences | null;
  loading: boolean;
  error: Error | null;
  updatePreferences: (updates: Partial<NotificationPreferences>) => Promise<boolean>;
  resetToDefaults: () => Promise<boolean>;
}

/**
 * Hook to manage notification preferences
 * 
 * @param userId - User ID to fetch/manage preferences for
 * @returns Preferences data and management functions
 * 
 * @example
 * ```tsx
 * const { preferences, loading, updatePreferences } = useNotificationPreferences(user?.uid);
 * 
 * // Update preferences
 * await updatePreferences({
 *   pushEnabled: true,
 *   quietHours: { enabled: true, start: "22:00", end: "08:00" }
 * });
 * ```
 */
export function useNotificationPreferences(userId?: string): UseNotificationPreferencesReturn {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setPreferences(null);
      setLoading(false);
      return;
    }

    const initializePreferences = async () => {
      setLoading(true);
      setError(null);

      try {
        const prefsDoc = await getDoc(doc(db, 'notificationPreferences', userId));

        if (prefsDoc.exists()) {
          // Preferences exist, load them
          setPreferences(prefsDoc.data() as NotificationPreferences);
        } else {
          // No preferences exist, create defaults
          console.log('[Notifications] Creating default preferences for user:', userId);
          
          const defaultPrefs: NotificationPreferences = {
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            userId,
            createdAt: Timestamp.now(),
            lastUpdated: Timestamp.now(),
          };

          await setDoc(doc(db, 'notificationPreferences', userId), defaultPrefs);
          setPreferences(defaultPrefs);
          
          console.log('[Notifications] Default preferences created');
        }

        setLoading(false);
      } catch (err) {
        console.error('[Notifications] Error loading preferences:', err);
        setError(err as Error);
        setLoading(false);
      }
    };

    initializePreferences();
  }, [userId]);

  const updatePreferences = async (updates: Partial<NotificationPreferences>): Promise<boolean> => {
    if (!userId) {
      toast.error('No user logged in');
      return false;
    }

    try {
      setLoading(true);

      await updateDoc(doc(db, 'notificationPreferences', userId), {
        ...updates,
        lastUpdated: serverTimestamp(),
      });

      // Update local state
      setPreferences(prev => prev ? { ...prev, ...updates, lastUpdated: Timestamp.now() } : null);

      toast.success('Notification preferences updated');
      setLoading(false);
      return true;
    } catch (error) {
      console.error('[Notifications] Error updating preferences:', error);
      toast.error('Failed to update preferences');
      setLoading(false);
      return false;
    }
  };

  const resetToDefaults = async (): Promise<boolean> => {
    if (!userId) {
      toast.error('No user logged in');
      return false;
    }

    try {
      setLoading(true);

      const defaultPrefs: NotificationPreferences = {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        userId,
        createdAt: preferences?.createdAt || Timestamp.now(),
        lastUpdated: Timestamp.now(),
      };

      await setDoc(doc(db, 'notificationPreferences', userId), defaultPrefs);
      setPreferences(defaultPrefs);

      toast.success('Reset to default preferences');
      setLoading(false);
      return true;
    } catch (error) {
      console.error('[Notifications] Error resetting preferences:', error);
      toast.error('Failed to reset preferences');
      setLoading(false);
      return false;
    }
  };

  return {
    preferences,
    loading,
    error,
    updatePreferences,
    resetToDefaults,
  };
}

