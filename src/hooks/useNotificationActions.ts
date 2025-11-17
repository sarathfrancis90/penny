/**
 * useNotificationActions Hook
 * 
 * Provides functions to perform actions on notifications:
 * - Mark as read/unread
 * - Delete notification
 * - Mark all as read
 * - Clear all read notifications
 */

'use client';

import { useState, useCallback } from 'react';
import { 
  doc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';

interface UseNotificationActionsReturn {
  markAsRead: (notificationId: string) => Promise<boolean>;
  markAsUnread: (notificationId: string) => Promise<boolean>;
  deleteNotification: (notificationId: string) => Promise<boolean>;
  markAllAsRead: (userId: string) => Promise<boolean>;
  clearAllRead: (userId: string) => Promise<boolean>;
  loading: boolean;
}

/**
 * Hook to perform actions on notifications
 * 
 * @returns Notification action functions and loading state
 * 
 * @example
 * ```tsx
 * const { markAsRead, deleteNotification, loading } = useNotificationActions();
 * 
 * await markAsRead('notification-id');
 * ```
 */
export function useNotificationActions(): UseNotificationActionsReturn {
  const [loading, setLoading] = useState(false);

  /**
   * Mark a notification as read
   */
  const markAsRead = useCallback(async (notificationId: string): Promise<boolean> => {
    try {
      setLoading(true);
      
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, {
        read: true,
        readAt: Timestamp.now(),
      });

      setLoading(false);
      return true;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      setLoading(false);
      toast.error('Failed to mark notification as read');
      return false;
    }
  }, []);

  /**
   * Mark a notification as unread
   */
  const markAsUnread = useCallback(async (notificationId: string): Promise<boolean> => {
    try {
      setLoading(true);
      
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, {
        read: false,
        readAt: null,
      });

      setLoading(false);
      return true;
    } catch (error) {
      console.error('Error marking notification as unread:', error);
      setLoading(false);
      toast.error('Failed to mark notification as unread');
      return false;
    }
  }, []);

  /**
   * Delete a notification
   */
  const deleteNotification = useCallback(async (notificationId: string): Promise<boolean> => {
    try {
      setLoading(true);
      
      const notificationRef = doc(db, 'notifications', notificationId);
      await deleteDoc(notificationRef);

      setLoading(false);
      toast.success('Notification deleted');
      return true;
    } catch (error) {
      console.error('Error deleting notification:', error);
      setLoading(false);
      toast.error('Failed to delete notification');
      return false;
    }
  }, []);

  /**
   * Mark all notifications as read for a user
   */
  const markAllAsRead = useCallback(async (userId: string): Promise<boolean> => {
    try {
      setLoading(true);

      // Get all unread notifications
      const notificationsRef = collection(db, 'notifications');
      const q = query(
        notificationsRef,
        where('userId', '==', userId),
        where('read', '==', false)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setLoading(false);
        return true;
      }

      // Use batch write for efficiency
      const batch = writeBatch(db);
      const now = Timestamp.now();

      snapshot.forEach((docSnapshot) => {
        batch.update(docSnapshot.ref, {
          read: true,
          readAt: now,
        });
      });

      await batch.commit();

      setLoading(false);
      toast.success(`Marked ${snapshot.size} notification${snapshot.size > 1 ? 's' : ''} as read`);
      return true;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      setLoading(false);
      toast.error('Failed to mark all as read');
      return false;
    }
  }, []);

  /**
   * Clear all read notifications for a user
   */
  const clearAllRead = useCallback(async (userId: string): Promise<boolean> => {
    try {
      setLoading(true);

      // Get all read notifications
      const notificationsRef = collection(db, 'notifications');
      const q = query(
        notificationsRef,
        where('userId', '==', userId),
        where('read', '==', true)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setLoading(false);
        toast.info('No read notifications to clear');
        return true;
      }

      // Use batch write for efficiency
      const batch = writeBatch(db);

      snapshot.forEach((docSnapshot) => {
        batch.delete(docSnapshot.ref);
      });

      await batch.commit();

      setLoading(false);
      toast.success(`Cleared ${snapshot.size} notification${snapshot.size > 1 ? 's' : ''}`);
      return true;
    } catch (error) {
      console.error('Error clearing read notifications:', error);
      setLoading(false);
      toast.error('Failed to clear notifications');
      return false;
    }
  }, []);

  return {
    markAsRead,
    markAsUnread,
    deleteNotification,
    markAllAsRead,
    clearAllRead,
    loading,
  };
}

