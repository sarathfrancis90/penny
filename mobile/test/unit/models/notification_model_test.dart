import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/notification_model.dart';

void main() {
  group('NotificationModel', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    test('fromFirestore parses all fields', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('notifications').add({
        'userId': 'user-1',
        'type': 'budget_warning',
        'title': 'Budget Warning',
        'body': 'Meals and entertainment is at 85%',
        'icon': '⚠️',
        'priority': 'high',
        'category': 'budget',
        'read': false,
        'delivered': true,
        'isGrouped': false,
        'actorName': 'System',
        'createdAt': now,
      });

      final model = NotificationModel.fromFirestore(await doc.get());

      expect(model.type, 'budget_warning');
      expect(model.title, 'Budget Warning');
      expect(model.body, 'Meals and entertainment is at 85%');
      expect(model.icon, '⚠️');
      expect(model.priority, 'high');
      expect(model.category, 'budget');
      expect(model.read, false);
      expect(model.delivered, true);
      expect(model.actorName, 'System');
    });

    test('fromFirestore handles missing optional fields', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('notifications').add({
        'userId': 'user-1',
        'type': 'weekly_summary',
        'title': 'Weekly Summary',
        'body': 'You spent \$500 this week',
        'priority': 'low',
        'category': 'system',
        'read': true,
        'delivered': true,
        'isGrouped': false,
        'createdAt': now,
      });

      final model = NotificationModel.fromFirestore(await doc.get());

      expect(model.icon, isNull);
      expect(model.actorName, isNull);
      expect(model.actionUrl, isNull);
      expect(model.groupId, isNull);
      expect(model.metadata, isNull);
    });

    test('defaultIcon returns correct emoji per category', () async {
      final now = Timestamp.now();
      final base = {
        'userId': 'u', 'type': 't', 'title': 'T', 'body': 'B',
        'priority': 'low', 'read': false, 'delivered': false,
        'isGrouped': false, 'createdAt': now,
      };

      Future<NotificationModel> create(String cat) async {
        final doc = await firestore.collection('notifications')
            .add({...base, 'category': cat});
        return NotificationModel.fromFirestore(await doc.get());
      }

      expect((await create('budget')).defaultIcon, '📊');
      expect((await create('group')).defaultIcon, '👥');
      expect((await create('income')).defaultIcon, '💰');
      expect((await create('savings')).defaultIcon, '🎯');
      expect((await create('system')).defaultIcon, '🔔');
    });

    test('timeAgo returns correct relative time', () {
      final now = DateTime.now();

      final justNow = NotificationModel(
        id: '1', userId: 'u', type: 't', title: 'T', body: 'B',
        priority: 'low', category: 'system', read: false,
        delivered: false, isGrouped: false,
        createdAt: Timestamp.fromDate(now.subtract(const Duration(seconds: 30))),
      );
      expect(justNow.timeAgo, 'just now');

      final fiveMin = NotificationModel(
        id: '2', userId: 'u', type: 't', title: 'T', body: 'B',
        priority: 'low', category: 'system', read: false,
        delivered: false, isGrouped: false,
        createdAt: Timestamp.fromDate(now.subtract(const Duration(minutes: 5))),
      );
      expect(fiveMin.timeAgo, '5m ago');

      final threeHours = NotificationModel(
        id: '3', userId: 'u', type: 't', title: 'T', body: 'B',
        priority: 'low', category: 'system', read: false,
        delivered: false, isGrouped: false,
        createdAt: Timestamp.fromDate(now.subtract(const Duration(hours: 3))),
      );
      expect(threeHours.timeAgo, '3h ago');

      final twoDays = NotificationModel(
        id: '4', userId: 'u', type: 't', title: 'T', body: 'B',
        priority: 'low', category: 'system', read: false,
        delivered: false, isGrouped: false,
        createdAt: Timestamp.fromDate(now.subtract(const Duration(days: 2))),
      );
      expect(twoDays.timeAgo, '2d ago');
    });
  });
}
