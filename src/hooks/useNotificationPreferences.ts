'use client';

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import type { NotificationType, NotificationFrequency } from '@/lib/types/notifications';

// Default preferences for new users
const DEFAULT_PREFERENCES: Record<NotificationType, {
  inApp: boolean;
  push: boolean;
  frequency: NotificationFrequency;
}> = {
  // Group notifications - High priority, realtime
  'group_expense_added': { inApp: true, push: true, frequency: 'realtime' },
  'group_invitation': { inApp: true, push: true, frequency: 'realtime' },
  'group_member_joined': { inApp: true, push: false, frequency: 'realtime' },
  'group_member_left': { inApp: true, push: false, frequency: 'realtime' },
  'group_role_changed': { inApp: true, push: true, frequency: 'realtime' },
  'group_settings_changed': { inApp: true, push: false, frequency: 'realtime' },
  
  // Budget notifications - Critical, realtime
  'budget_warning': { inApp: true, push: true, frequency: 'realtime' },
  'budget_critical': { inApp: true, push: true, frequency: 'realtime' },
  'budget_exceeded': { inApp: true, push: true, frequency: 'realtime' },
  'budget_reset': { inApp: true, push: false, frequency: 'realtime' },
  
  // System notifications - Lower priority, can be digest
  'weekly_summary': { inApp: true, push: false, frequency: 'weekly' },
  'monthly_summary': { inApp: true, push: false, frequency: 'monthly' },
  'receipts_uncategorized': { inApp: true, push: false, frequency: 'daily' },
  
  // Social (future) - Currently disabled
  'comment_added': { inApp: false, push: false, frequency: 'never' },
  'expense_split_request': { inApp: false, push: false, frequency: 'never' },
};

interface UseNotificationPreferencesResult {
  preferences: Record<NotificationType, { inApp: boolean; push: boolean; frequency: NotificationFrequency }>;
  globalMute: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  loading: boolean;
  error: string | null;
  initialized: boolean;
}

/**
 * Hook to manage and initialize notification preferences for users
 * Automatically creates default preferences for new users
 */
export function useNotificationPreferences(userId?: string): UseNotificationPreferencesResult {
  const [preferences, setPreferences] = useState<Record<NotificationType, { inApp: boolean; push: boolean; frequency: NotificationFrequency }>>(DEFAULT_PREFERENCES);
  const [globalMute, setGlobalMute] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState("22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState("08:00");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const initializePreferences = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      // Check if user has notification settings
      const settingsRef = doc(db, "userNotificationSettings", userId);
      const settingsDoc = await getDoc(settingsRef);

      if (!settingsDoc.exists()) {
        // Create default settings for new user
        console.log(`[Preferences] Creating default settings for user ${userId}`);
        await setDoc(settingsRef, {
          userId,
          globalMute: false,
          quietHoursStart: "22:00",
          quietHoursEnd: "08:00",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        
        setGlobalMute(false);
        setQuietHoursStart("22:00");
        setQuietHoursEnd("08:00");
      } else {
        // Load existing settings
        const settings = settingsDoc.data();
        setGlobalMute(settings.globalMute || false);
        setQuietHoursStart(settings.quietHoursStart || "22:00");
        setQuietHoursEnd(settings.quietHoursEnd || "08:00");
      }

      // Check if user has notification preferences
      const prefsRef = doc(db, "users", userId, "notificationPreferences", "default");
      const prefsDoc = await getDoc(prefsRef);

      if (!prefsDoc.exists()) {
        // Create default preferences for new user
        console.log(`[Preferences] Creating default notification preferences for user ${userId}`);
        await setDoc(prefsRef, DEFAULT_PREFERENCES);
        setPreferences(DEFAULT_PREFERENCES);
      } else {
        // Load existing preferences
        const userPrefs = prefsDoc.data() as Record<NotificationType, { inApp: boolean; push: boolean; frequency: NotificationFrequency }>;
        setPreferences(userPrefs);
      }

      setInitialized(true);
    } catch (err) {
      console.error("[Preferences] Error initializing preferences:", err);
      setError(err instanceof Error ? err.message : "Failed to load preferences");
      // Fall back to defaults on error
      setPreferences(DEFAULT_PREFERENCES);
      setInitialized(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    initializePreferences();
  }, [userId, initializePreferences]);

  return {
    preferences,
    globalMute,
    quietHoursStart,
    quietHoursEnd,
    loading,
    error,
    initialized,
  };
}

/**
 * Helper function to check if a notification should be sent based on preferences
 * This is used server-side in the NotificationService
 */
export async function shouldSendNotification(
  userId: string,
  type: NotificationType,
  channel: 'inApp' | 'push' = 'inApp'
): Promise<boolean> {
  try {
    // Check global mute
    const settingsRef = doc(db, "userNotificationSettings", userId);
    const settingsDoc = await getDoc(settingsRef);
    
    if (settingsDoc.exists()) {
      const settings = settingsDoc.data();
      if (settings.globalMute) {
        return false; // User has muted all notifications
      }

      // Check quiet hours
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTime = currentHour * 60 + currentMinute;

      const startTime = parseInt(settings.quietHoursStart?.split(':')[0] || '22') * 60 + 
                       parseInt(settings.quietHoursStart?.split(':')[1] || '0');
      const endTime = parseInt(settings.quietHoursEnd?.split(':')[0] || '8') * 60 + 
                     parseInt(settings.quietHoursEnd?.split(':')[1] || '0');

      // Handle overnight quiet hours (e.g., 22:00 - 08:00)
      const isInQuietHours = startTime > endTime
        ? (currentTime >= startTime || currentTime <= endTime)
        : (currentTime >= startTime && currentTime <= endTime);

      if (isInQuietHours && channel === 'push') {
        return false; // Don't send push during quiet hours
      }
    }

    // Check type-specific preferences
    const prefsRef = doc(db, "users", userId, "notificationPreferences", "default");
    const prefsDoc = await getDoc(prefsRef);

    if (prefsDoc.exists()) {
      const prefs = prefsDoc.data();
      const typePref = prefs[type];

      if (typePref) {
        if (channel === 'inApp' && !typePref.inApp) return false;
        if (channel === 'push' && !typePref.push) return false;
        if (typePref.frequency === 'never') return false;
      }
    }

    return true; // Send notification if all checks pass
  } catch (error) {
    console.error("[Preferences] Error checking notification preferences:", error);
    return true; // Default to sending if error occurs (fail open)
  }
}
