import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:penny_mobile/data/models/notification_model.dart';

class NotificationRepository {
  NotificationRepository({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  /// Stream notifications for a user, ordered by newest first.
  Stream<List<NotificationModel>> watchNotifications(String userId) {
    return _db
        .collection('notifications')
        .where('userId', isEqualTo: userId)
        .orderBy('createdAt', descending: true)
        .limit(50)
        .snapshots()
        .map((snap) =>
            snap.docs.map(NotificationModel.fromFirestore).toList());
  }

  /// Mark a single notification as read.
  Future<void> markAsRead(String notificationId) {
    return _db.collection('notifications').doc(notificationId).update({
      'read': true,
      'readAt': Timestamp.now(),
    });
  }

  /// Mark all notifications as read for a user.
  Future<void> markAllAsRead(String userId) async {
    final snap = await _db
        .collection('notifications')
        .where('userId', isEqualTo: userId)
        .where('read', isEqualTo: false)
        .get();

    final batch = _db.batch();
    final now = Timestamp.now();
    for (final doc in snap.docs) {
      batch.update(doc.reference, {'read': true, 'readAt': now});
    }
    await batch.commit();
  }

  /// Delete a notification.
  Future<void> deleteNotification(String notificationId) {
    return _db.collection('notifications').doc(notificationId).delete();
  }
}
