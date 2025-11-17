/**
 * Notification Cleanup Service
 * 
 * Handles automatic expiry and deletion of old notifications.
 * Can be called by a cron job or cloud function.
 */

import { 
  collection, 
  query, 
  where, 
  getDocs,
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Configuration for cleanup behavior
 */
const CLEANUP_CONFIG = {
  // Delete read notifications older than 30 days
  READ_RETENTION_DAYS: 30,
  
  // Delete unread notifications older than 90 days
  UNREAD_RETENTION_DAYS: 90,
  
  // Process in batches to avoid timeouts
  BATCH_SIZE: 500,
};

/**
 * Delete expired notifications
 * 
 * @returns Number of notifications deleted
 */
export async function cleanupExpiredNotifications(): Promise<number> {
  console.log('[NotificationCleanup] Starting cleanup...');
  
  const now = Timestamp.now();
  const readCutoff = Timestamp.fromMillis(
    now.toMillis() - (CLEANUP_CONFIG.READ_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  );
  const unreadCutoff = Timestamp.fromMillis(
    now.toMillis() - (CLEANUP_CONFIG.UNREAD_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  );

  let totalDeleted = 0;

  try {
    // Delete old read notifications
    const readQuery = query(
      collection(db, 'notifications'),
      where('read', '==', true),
      where('createdAt', '<', readCutoff)
    );

    const readSnapshot = await getDocs(readQuery);
    console.log(`[NotificationCleanup] Found ${readSnapshot.size} old read notifications`);

    for (const doc of readSnapshot.docs) {
      await deleteDoc(doc.ref);
      totalDeleted++;
    }

    // Delete old unread notifications  
    const unreadQuery = query(
      collection(db, 'notifications'),
      where('read', '==', false),
      where('createdAt', '<', unreadCutoff)
    );

    const unreadSnapshot = await getDocs(unreadQuery);
    console.log(`[NotificationCleanup] Found ${unreadSnapshot.size} old unread notifications`);

    for (const doc of unreadSnapshot.docs) {
      await deleteDoc(doc.ref);
      totalDeleted++;
    }

    console.log(`[NotificationCleanup] Cleanup complete. Deleted ${totalDeleted} notifications`);
    return totalDeleted;
  } catch (error) {
    console.error('[NotificationCleanup] Error during cleanup:', error);
    throw error;
  }
}

/**
 * Delete notifications with expiry date in the past
 * (For notifications that have explicit expiresAt field)
 * 
 * @returns Number of notifications deleted
 */
export async function cleanupExpiredByDate(): Promise<number> {
  console.log('[NotificationCleanup] Cleaning up notifications with expiresAt...');
  
  const now = Timestamp.now();
  let totalDeleted = 0;

  try {
    const expiredQuery = query(
      collection(db, 'notifications'),
      where('expiresAt', '<', now)
    );

    const snapshot = await getDocs(expiredQuery);
    console.log(`[NotificationCleanup] Found ${snapshot.size} expired notifications`);

    for (const doc of snapshot.docs) {
      await deleteDoc(doc.ref);
      totalDeleted++;
    }

    console.log(`[NotificationCleanup] Expired cleanup complete. Deleted ${totalDeleted} notifications`);
    return totalDeleted;
  } catch (error) {
    console.error('[NotificationCleanup] Error during expired cleanup:', error);
    throw error;
  }
}

/**
 * Run full cleanup (both types)
 * 
 * @returns Total number of notifications deleted
 */
export async function runFullCleanup(): Promise<number> {
  console.log('[NotificationCleanup] Running full cleanup...');
  
  const expiredCount = await cleanupExpiredByDate();
  const ageBasedCount = await cleanupExpiredNotifications();
  
  const total = expiredCount + ageBasedCount;
  console.log(`[NotificationCleanup] Full cleanup complete. Total deleted: ${total}`);
  
  return total;
}

/**
 * Delete all notifications for a specific user
 * (Useful for GDPR compliance / account deletion)
 * 
 * @param userId - User ID
 * @returns Number of notifications deleted
 */
export async function deleteAllUserNotifications(userId: string): Promise<number> {
  console.log(`[NotificationCleanup] Deleting all notifications for user ${userId}`);
  
  let totalDeleted = 0;

  try {
    const userQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', userId)
    );

    const snapshot = await getDocs(userQuery);
    console.log(`[NotificationCleanup] Found ${snapshot.size} notifications for user`);

    for (const doc of snapshot.docs) {
      await deleteDoc(doc.ref);
      totalDeleted++;
    }

    console.log(`[NotificationCleanup] User cleanup complete. Deleted ${totalDeleted} notifications`);
    return totalDeleted;
  } catch (error) {
    console.error('[NotificationCleanup] Error during user cleanup:', error);
    throw error;
  }
}

/**
 * Get cleanup statistics (for monitoring)
 * 
 * @returns Cleanup stats
 */
export async function getCleanupStats(): Promise<{
  totalNotifications: number;
  readNotifications: number;
  unreadNotifications: number;
  expiredNotifications: number;
  oldReadNotifications: number;
  oldUnreadNotifications: number;
}> {
  const now = Timestamp.now();
  const readCutoff = Timestamp.fromMillis(
    now.toMillis() - (CLEANUP_CONFIG.READ_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  );
  const unreadCutoff = Timestamp.fromMillis(
    now.toMillis() - (CLEANUP_CONFIG.UNREAD_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  );

  try {
    const allSnapshot = await getDocs(collection(db, 'notifications'));
    const readSnapshot = await getDocs(query(collection(db, 'notifications'), where('read', '==', true)));
    const unreadSnapshot = await getDocs(query(collection(db, 'notifications'), where('read', '==', false)));
    
    const expiredSnapshot = await getDocs(
      query(collection(db, 'notifications'), where('expiresAt', '<', now))
    );
    
    const oldReadSnapshot = await getDocs(
      query(
        collection(db, 'notifications'),
        where('read', '==', true),
        where('createdAt', '<', readCutoff)
      )
    );
    
    const oldUnreadSnapshot = await getDocs(
      query(
        collection(db, 'notifications'),
        where('read', '==', false),
        where('createdAt', '<', unreadCutoff)
      )
    );

    return {
      totalNotifications: allSnapshot.size,
      readNotifications: readSnapshot.size,
      unreadNotifications: unreadSnapshot.size,
      expiredNotifications: expiredSnapshot.size,
      oldReadNotifications: oldReadSnapshot.size,
      oldUnreadNotifications: oldUnreadSnapshot.size,
    };
  } catch (error) {
    console.error('[NotificationCleanup] Error getting stats:', error);
    throw error;
  }
}

