/**
 * useNotifications Hook
 * 
 * Provides real-time access to user notifications with Firestore listeners.
 * Handles fetching, filtering, and real-time updates.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit as firestoreLimit,
  onSnapshot,
  Query,
  DocumentData
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Notification, NotificationCategory } from '@/lib/types/notifications';

interface UseNotificationsOptions {
  userId?: string;
  category?: NotificationCategory;
  limit?: number;
  includeRead?: boolean;
}

interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * Hook to fetch and listen to user notifications
 * 
 * @param options - Configuration options
 * @returns Notifications data and utilities
 * 
 * @example
 * ```tsx
 * const { notifications, unreadCount, loading } = useNotifications({
 *   userId: user?.uid,
 *   limit: 10,
 *   includeRead: false
 * });
 * ```
 */
export function useNotifications(options: UseNotificationsOptions = {}): UseNotificationsReturn {
  const { 
    userId, 
    category, 
    limit = 20, 
    includeRead = true 
  } = options;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build query
      const notificationsRef = collection(db, 'notifications');
      let q: Query<DocumentData> = query(
        notificationsRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        firestoreLimit(limit)
      );

      // Add category filter if specified
      if (category) {
        q = query(
          notificationsRef,
          where('userId', '==', userId),
          where('category', '==', category),
          orderBy('createdAt', 'desc'),
          firestoreLimit(limit)
        );
      }

      // Add read filter if specified
      if (!includeRead) {
        q = query(
          notificationsRef,
          where('userId', '==', userId),
          where('read', '==', false),
          orderBy('createdAt', 'desc'),
          firestoreLimit(limit)
        );
      }

      // Set up real-time listener
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const notificationsData: Notification[] = [];
          let unread = 0;

          snapshot.forEach((doc) => {
            const data = doc.data();
            const notification: Notification = {
              id: doc.id,
              userId: data.userId,
              type: data.type,
              title: data.title,
              body: data.body,
              icon: data.icon,
              priority: data.priority,
              category: data.category,
              read: data.read,
              readAt: data.readAt,
              delivered: data.delivered,
              deliveredAt: data.deliveredAt,
              actions: data.actions,
              actionUrl: data.actionUrl,
              relatedId: data.relatedId,
              relatedType: data.relatedType,
              groupId: data.groupId,
              isGrouped: data.isGrouped,
              groupKey: data.groupKey,
              groupCount: data.groupCount,
              groupedNotifications: data.groupedNotifications,
              actorId: data.actorId,
              actorName: data.actorName,
              actorAvatar: data.actorAvatar,
              createdAt: data.createdAt,
              expiresAt: data.expiresAt,
              metadata: data.metadata,
            };

            notificationsData.push(notification);

            if (!notification.read) {
              unread++;
            }
          });

          setNotifications(notificationsData);
          setUnreadCount(unread);
          setLoading(false);
        },
        (err) => {
          console.error('Error listening to notifications:', err);
          setError(err as Error);
          setLoading(false);
        }
      );

      // Cleanup listener on unmount
      return () => {
        unsubscribe();
      };
    } catch (err) {
      console.error('Error setting up notifications listener:', err);
      setError(err as Error);
      setLoading(false);
    }
  }, [userId, category, limit, includeRead, refreshTrigger]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refresh,
  };
}

/**
 * Hook to get unread notification count only (lightweight)
 * 
 * @param userId - User ID to fetch count for
 * @returns Unread count and loading state
 */
export function useUnreadNotificationCount(userId?: string) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);

    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setUnreadCount(snapshot.size);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching unread count:', error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [userId]);

  return { unreadCount, loading };
}

