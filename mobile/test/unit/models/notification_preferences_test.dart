import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/constants/notification_types.dart';
import 'package:penny_mobile/data/models/notification_model.dart';
import 'package:penny_mobile/data/models/notification_preferences_model.dart';

void main() {
  group('NotificationTypePreference', () {
    test('fromMap parses all fields', () {
      final pref = NotificationTypePreference.fromMap({
        'inApp': false,
        'push': true,
        'frequency': 'daily',
      });

      expect(pref.inApp, false);
      expect(pref.push, true);
      expect(pref.frequency, 'daily');
    });

    test('fromMap uses defaults for missing fields', () {
      final pref = NotificationTypePreference.fromMap({});

      expect(pref.inApp, true);
      expect(pref.push, true);
      expect(pref.frequency, 'realtime');
    });

    test('fromMap handles partial fields', () {
      final pref = NotificationTypePreference.fromMap({
        'inApp': false,
      });

      expect(pref.inApp, false);
      expect(pref.push, true);
      expect(pref.frequency, 'realtime');
    });

    test('toMap produces correct map', () {
      const pref = NotificationTypePreference(
        inApp: false,
        push: true,
        frequency: 'weekly',
      );

      final map = pref.toMap();

      expect(map['inApp'], false);
      expect(map['push'], true);
      expect(map['frequency'], 'weekly');
    });

    test('default constructor has correct defaults', () {
      const pref = NotificationTypePreference();

      expect(pref.inApp, true);
      expect(pref.push, true);
      expect(pref.frequency, 'realtime');
    });

    test('copyWith overrides specified fields only', () {
      const pref = NotificationTypePreference(
        inApp: true,
        push: true,
        frequency: 'realtime',
      );

      final updated = pref.copyWith(push: false);

      expect(updated.inApp, true);
      expect(updated.push, false);
      expect(updated.frequency, 'realtime');
    });

    test('copyWith with all fields', () {
      const pref = NotificationTypePreference();

      final updated = pref.copyWith(
        inApp: false,
        push: false,
        frequency: 'never',
      );

      expect(updated.inApp, false);
      expect(updated.push, false);
      expect(updated.frequency, 'never');
    });

    test('roundtrip: fromMap(toMap()) preserves values', () {
      const original = NotificationTypePreference(
        inApp: false,
        push: true,
        frequency: 'hourly',
      );

      final roundtripped =
          NotificationTypePreference.fromMap(original.toMap());

      expect(roundtripped.inApp, original.inApp);
      expect(roundtripped.push, original.push);
      expect(roundtripped.frequency, original.frequency);
    });
  });

  group('NotificationPreferencesModel', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    test('fromFirestore parses notification type preferences', () async {
      final doc = await firestore
          .collection('users')
          .doc('user-1')
          .collection('preferences')
          .doc('notifications')
          .get();

      // Set data manually since we need a specific structure
      await firestore
          .collection('users')
          .doc('user-1')
          .collection('preferences')
          .doc('notifications')
          .set({
        'budget_warning': {
          'inApp': true,
          'push': false,
          'frequency': 'daily',
        },
        'group_expense_added': {
          'inApp': true,
          'push': true,
          'frequency': 'realtime',
        },
        'updatedAt': Timestamp.now(), // Should be skipped
      });

      final snapshot = await firestore
          .collection('users')
          .doc('user-1')
          .collection('preferences')
          .doc('notifications')
          .get();

      final model = NotificationPreferencesModel.fromFirestore(snapshot);

      expect(model.types.length, 2);
      expect(model.types['budget_warning'], isNotNull);
      expect(model.types['budget_warning']!.push, false);
      expect(model.types['budget_warning']!.frequency, 'daily');
      expect(model.types['group_expense_added'], isNotNull);
      expect(model.types['group_expense_added']!.push, true);
    });

    test('fromFirestore handles empty document', () async {
      await firestore.collection('prefs').doc('empty').set({});
      final snapshot = await firestore.collection('prefs').doc('empty').get();

      final model = NotificationPreferencesModel.fromFirestore(snapshot);

      expect(model.types, isEmpty);
    });

    test('fromFirestore skips updatedAt field', () async {
      await firestore.collection('prefs').doc('test').set({
        'updatedAt': Timestamp.now(),
        'budget_warning': {
          'inApp': true,
          'push': true,
          'frequency': 'realtime',
        },
      });

      final snapshot = await firestore.collection('prefs').doc('test').get();
      final model = NotificationPreferencesModel.fromFirestore(snapshot);

      expect(model.types.containsKey('updatedAt'), false);
      expect(model.types.length, 1);
    });

    test('defaults() creates preferences for all NotificationType values',
        () {
      final model = NotificationPreferencesModel.defaults();

      expect(model.types.length, NotificationType.values.length);

      for (final type in NotificationType.values) {
        expect(model.types.containsKey(type.value), true,
            reason: 'Missing key: ${type.value}');
        expect(model.types[type.value]!.inApp, true);
        expect(model.types[type.value]!.push, true);
        expect(model.types[type.value]!.frequency, 'realtime');
      }
    });

    test('forType returns stored preference', () {
      final model = NotificationPreferencesModel(types: {
        'budget_warning': const NotificationTypePreference(
          inApp: true,
          push: false,
          frequency: 'daily',
        ),
      });

      final pref = model.forType(NotificationType.budgetWarning);

      expect(pref.inApp, true);
      expect(pref.push, false);
      expect(pref.frequency, 'daily');
    });

    test('forType returns default when type not found', () {
      final model = NotificationPreferencesModel(types: {});

      final pref = model.forType(NotificationType.budgetWarning);

      expect(pref.inApp, true);
      expect(pref.push, true);
      expect(pref.frequency, 'realtime');
    });

    test('toMap produces correct nested map', () {
      final model = NotificationPreferencesModel(types: {
        'budget_warning': const NotificationTypePreference(
          inApp: false,
          push: true,
          frequency: 'hourly',
        ),
      });

      final map = model.toMap();

      expect(map['budget_warning'], isA<Map<String, dynamic>>());
      expect(map['budget_warning']['inApp'], false);
      expect(map['budget_warning']['push'], true);
      expect(map['budget_warning']['frequency'], 'hourly');
    });
  });

  group('NotificationSettingsModel', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    test('fromFirestore parses all fields', () async {
      final now = Timestamp.now();
      await firestore.collection('settings').doc('test').set({
        'globalMute': true,
        'quietHoursStart': '23:00',
        'quietHoursEnd': '07:00',
        'updatedAt': now,
      });

      final snapshot =
          await firestore.collection('settings').doc('test').get();
      final settings = NotificationSettingsModel.fromFirestore(snapshot);

      expect(settings.globalMute, true);
      expect(settings.quietHoursStart, '23:00');
      expect(settings.quietHoursEnd, '07:00');
      expect(settings.updatedAt, now);
    });

    test('fromFirestore uses defaults for missing fields', () async {
      await firestore.collection('settings').doc('empty').set({});

      final snapshot =
          await firestore.collection('settings').doc('empty').get();
      final settings = NotificationSettingsModel.fromFirestore(snapshot);

      expect(settings.globalMute, false);
      expect(settings.quietHoursStart, '22:00');
      expect(settings.quietHoursEnd, '08:00');
      expect(settings.updatedAt, isNull);
    });

    test('default constructor has correct defaults', () {
      const settings = NotificationSettingsModel();

      expect(settings.globalMute, false);
      expect(settings.quietHoursStart, '22:00');
      expect(settings.quietHoursEnd, '08:00');
      expect(settings.updatedAt, isNull);
    });

    test('toMap produces correct map with FieldValue.serverTimestamp', () {
      const settings = NotificationSettingsModel(
        globalMute: true,
        quietHoursStart: '21:00',
        quietHoursEnd: '09:00',
      );

      final map = settings.toMap();

      expect(map['globalMute'], true);
      expect(map['quietHoursStart'], '21:00');
      expect(map['quietHoursEnd'], '09:00');
      expect(map.containsKey('updatedAt'), true);
    });

    test('copyWith overrides specified fields only', () {
      const settings = NotificationSettingsModel(
        globalMute: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
      );

      final updated = settings.copyWith(globalMute: true);

      expect(updated.globalMute, true);
      expect(updated.quietHoursStart, '22:00');
      expect(updated.quietHoursEnd, '08:00');
    });

    test('copyWith with all fields', () {
      const settings = NotificationSettingsModel();

      final updated = settings.copyWith(
        globalMute: true,
        quietHoursStart: '23:30',
        quietHoursEnd: '06:30',
      );

      expect(updated.globalMute, true);
      expect(updated.quietHoursStart, '23:30');
      expect(updated.quietHoursEnd, '06:30');
    });
  });

  group('NotificationType enum', () {
    test('all values have non-empty value strings', () {
      for (final type in NotificationType.values) {
        expect(type.value, isNotEmpty,
            reason: '${type.name} has empty value');
      }
    });

    test('all values have non-empty labels', () {
      for (final type in NotificationType.values) {
        expect(type.label, isNotEmpty,
            reason: '${type.name} has empty label');
      }
    });

    test('all values have valid category', () {
      final validCategories = {'group', 'budget', 'system'};
      for (final type in NotificationType.values) {
        expect(validCategories.contains(type.category), true,
            reason:
                '${type.name} has invalid category: ${type.category}');
      }
    });

    test('value strings match expected Firestore values', () {
      expect(NotificationType.groupExpenseAdded.value, 'group_expense_added');
      expect(NotificationType.groupInvitation.value, 'group_invitation');
      expect(NotificationType.groupMemberJoined.value, 'group_member_joined');
      expect(NotificationType.groupMemberLeft.value, 'group_member_left');
      expect(NotificationType.groupRoleChanged.value, 'group_role_changed');
      expect(NotificationType.groupSettingsChanged.value, 'group_settings_changed');
      expect(NotificationType.budgetWarning.value, 'budget_warning');
      expect(NotificationType.budgetCritical.value, 'budget_critical');
      expect(NotificationType.budgetExceeded.value, 'budget_exceeded');
      expect(NotificationType.budgetReset.value, 'budget_reset');
      expect(NotificationType.milestone.value, 'milestone');
      expect(NotificationType.weeklySummary.value, 'weekly_summary');
      expect(NotificationType.monthlySummary.value, 'monthly_summary');
    });

    test('has 13 total notification types', () {
      expect(NotificationType.values.length, 13);
    });
  });

  group('notificationCategories grouping', () {
    test('has 3 categories', () {
      expect(notificationCategories.length, 3);
    });

    test('group category has 6 types', () {
      final groupCat =
          notificationCategories.firstWhere((c) => c.key == 'group');
      expect(groupCat.types.length, 6);
      expect(groupCat.title, 'Group Activity');
    });

    test('budget category has 4 types', () {
      final budgetCat =
          notificationCategories.firstWhere((c) => c.key == 'budget');
      expect(budgetCat.types.length, 4);
      expect(budgetCat.title, 'Budget Alerts');
    });

    test('system category has 3 types', () {
      final systemCat =
          notificationCategories.firstWhere((c) => c.key == 'system');
      expect(systemCat.types.length, 3);
      expect(systemCat.title, 'System');
    });

    test('all notification types are covered by categories', () {
      final allTypesInCategories = notificationCategories
          .expand((c) => c.types)
          .toSet();
      expect(allTypesInCategories.length, NotificationType.values.length);
      for (final type in NotificationType.values) {
        expect(allTypesInCategories.contains(type), true,
            reason: '${type.name} not covered by any category');
      }
    });
  });

  group('NotificationAction', () {
    test('fromMap parses all fields', () {
      final action = NotificationAction.fromMap({
        'id': 'approve',
        'label': 'Approve',
        'action': 'approve_expense',
        'variant': 'primary',
      });

      expect(action.id, 'approve');
      expect(action.label, 'Approve');
      expect(action.action, 'approve_expense');
      expect(action.variant, 'primary');
    });

    test('fromMap handles missing optional fields', () {
      final action = NotificationAction.fromMap({
        'id': 'view',
        'label': 'View',
      });

      expect(action.id, 'view');
      expect(action.label, 'View');
      expect(action.action, isNull);
      expect(action.variant, isNull);
    });

    test('fromMap uses empty string defaults for missing id and label', () {
      final action = NotificationAction.fromMap({});

      expect(action.id, '');
      expect(action.label, '');
      expect(action.action, isNull);
      expect(action.variant, isNull);
    });
  });

  group('NotificationModel with actions', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    test('fromFirestore parses actions list', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('notifications').add({
        'userId': 'user-1',
        'type': 'group_expense_added',
        'title': 'New Expense',
        'body': 'Alice added \$50.00 at Costco',
        'priority': 'medium',
        'category': 'group',
        'read': false,
        'delivered': true,
        'isGrouped': false,
        'createdAt': now,
        'actions': [
          {
            'id': 'approve',
            'label': 'Approve',
            'action': 'approve_expense',
            'variant': 'primary',
          },
          {
            'id': 'reject',
            'label': 'Reject',
            'action': 'reject_expense',
            'variant': 'destructive',
          },
        ],
      });

      final model = NotificationModel.fromFirestore(await doc.get());

      expect(model.actions, isNotNull);
      expect(model.actions!.length, 2);
      expect(model.actions![0].id, 'approve');
      expect(model.actions![0].label, 'Approve');
      expect(model.actions![0].action, 'approve_expense');
      expect(model.actions![0].variant, 'primary');
      expect(model.actions![1].id, 'reject');
      expect(model.actions![1].label, 'Reject');
    });

    test('fromFirestore handles null actions', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('notifications').add({
        'userId': 'user-1',
        'type': 'budget_warning',
        'title': 'Budget Warning',
        'body': 'Over budget',
        'priority': 'high',
        'category': 'budget',
        'read': false,
        'delivered': false,
        'isGrouped': false,
        'createdAt': now,
      });

      final model = NotificationModel.fromFirestore(await doc.get());

      expect(model.actions, isNull);
    });

    test('fromFirestore handles empty actions list', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('notifications').add({
        'userId': 'user-1',
        'type': 'milestone',
        'title': 'Milestone',
        'body': 'Congrats!',
        'priority': 'low',
        'category': 'system',
        'read': false,
        'delivered': false,
        'isGrouped': false,
        'createdAt': now,
        'actions': [],
      });

      final model = NotificationModel.fromFirestore(await doc.get());

      expect(model.actions, isNotNull);
      expect(model.actions, isEmpty);
    });

    test('fromFirestore parses metadata map', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('notifications').add({
        'userId': 'user-1',
        'type': 'group_expense_added',
        'title': 'New Expense',
        'body': 'Expense added',
        'priority': 'medium',
        'category': 'group',
        'read': false,
        'delivered': true,
        'isGrouped': false,
        'createdAt': now,
        'metadata': {
          'expenseId': 'exp-123',
          'amount': 45.00,
          'groupId': 'group-1',
        },
      });

      final model = NotificationModel.fromFirestore(await doc.get());

      expect(model.metadata, isNotNull);
      expect(model.metadata!['expenseId'], 'exp-123');
      expect(model.metadata!['amount'], 45.00);
    });
  });
}
