import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/repositories/notification_repository.dart';

void main() {
  group('NotificationRepository', () {
    late FakeFirebaseFirestore firestore;
    late NotificationRepository repo;

    setUp(() {
      firestore = FakeFirebaseFirestore();
      repo = NotificationRepository(firestore: firestore);
    });

    test('watchNotifications streams user notifications', () async {
      final now = Timestamp.now();
      await firestore.collection('notifications').add({
        'userId': 'user-1', 'type': 'budget_warning',
        'title': 'Warning', 'body': 'Budget alert',
        'priority': 'high', 'category': 'budget',
        'read': false, 'delivered': true, 'isGrouped': false,
        'createdAt': now,
      });
      await firestore.collection('notifications').add({
        'userId': 'user-2', 'type': 'system',
        'title': 'Other', 'body': 'Not mine',
        'priority': 'low', 'category': 'system',
        'read': false, 'delivered': true, 'isGrouped': false,
        'createdAt': now,
      });

      final notifications = await repo.watchNotifications('user-1').first;
      expect(notifications.length, 1);
      expect(notifications.first.title, 'Warning');
    });

    test('markAsRead updates read status', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('notifications').add({
        'userId': 'user-1', 'type': 'test',
        'title': 'Test', 'body': 'Test body',
        'priority': 'low', 'category': 'system',
        'read': false, 'delivered': true, 'isGrouped': false,
        'createdAt': now,
      });

      await repo.markAsRead(doc.id);

      final updated = await firestore.collection('notifications').doc(doc.id).get();
      expect(updated.data()!['read'], true);
      expect(updated.data()!['readAt'], isNotNull);
    });

    test('markAllAsRead batch updates', () async {
      final now = Timestamp.now();
      for (var i = 0; i < 3; i++) {
        await firestore.collection('notifications').add({
          'userId': 'user-1', 'type': 'test',
          'title': 'N$i', 'body': 'Body $i',
          'priority': 'low', 'category': 'system',
          'read': false, 'delivered': true, 'isGrouped': false,
          'createdAt': now,
        });
      }

      await repo.markAllAsRead('user-1');

      final snap = await firestore.collection('notifications')
          .where('userId', isEqualTo: 'user-1')
          .get();
      for (final doc in snap.docs) {
        expect(doc.data()['read'], true);
      }
    });

    test('deleteNotification removes doc', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('notifications').add({
        'userId': 'user-1', 'type': 'test',
        'title': 'Delete me', 'body': 'Body',
        'priority': 'low', 'category': 'system',
        'read': false, 'delivered': true, 'isGrouped': false,
        'createdAt': now,
      });

      await repo.deleteNotification(doc.id);

      final result = await firestore.collection('notifications').doc(doc.id).get();
      expect(result.exists, isFalse);
    });
  });
}
