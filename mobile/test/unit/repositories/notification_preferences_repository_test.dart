import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/constants/notification_types.dart';
import 'package:penny_mobile/data/models/notification_preferences_model.dart';
import 'package:penny_mobile/data/repositories/notification_preferences_repository.dart';

void main() {
  group('NotificationPreferencesRepository', () {
    late FakeFirebaseFirestore firestore;
    late NotificationPreferencesRepository repo;

    setUp(() {
      firestore = FakeFirebaseFirestore();
      repo = NotificationPreferencesRepository(firestore: firestore);
    });

    group('watchSettings', () {
      test('returns defaults when doc does not exist', () async {
        final settings = await repo.watchSettings('user-1').first;

        expect(settings.globalMute, false);
        expect(settings.quietHoursStart, '22:00');
        expect(settings.quietHoursEnd, '08:00');
      });

      test('returns stored settings when doc exists', () async {
        await firestore
            .collection('userNotificationSettings')
            .doc('user-1')
            .set({
          'globalMute': true,
          'quietHoursStart': '23:00',
          'quietHoursEnd': '07:00',
        });

        final settings = await repo.watchSettings('user-1').first;

        expect(settings.globalMute, true);
        expect(settings.quietHoursStart, '23:00');
        expect(settings.quietHoursEnd, '07:00');
      });
    });

    group('watchPreferences', () {
      test('returns defaults when doc does not exist', () async {
        final prefs = await repo.watchPreferences('user-1').first;

        expect(prefs.types.length, NotificationType.values.length);
        for (final type in NotificationType.values) {
          final p = prefs.types[type.value];
          expect(p, isNotNull, reason: 'Missing type: ${type.value}');
          expect(p!.inApp, true);
          expect(p.push, true);
          expect(p.frequency, 'realtime');
        }
      });

      test('returns stored preferences when doc exists', () async {
        await firestore
            .collection('users')
            .doc('user-1')
            .collection('notificationPreferences')
            .doc('default')
            .set({
          'budget_warning': {
            'inApp': true,
            'push': false,
            'frequency': 'daily',
          },
        });

        final prefs = await repo.watchPreferences('user-1').first;

        expect(prefs.types['budget_warning'], isNotNull);
        expect(prefs.types['budget_warning']!.push, false);
        expect(prefs.types['budget_warning']!.frequency, 'daily');
      });
    });

    group('updateSettings', () {
      test('creates doc when it does not exist', () async {
        await repo.updateSettings('user-1', {'globalMute': true});

        final doc = await firestore
            .collection('userNotificationSettings')
            .doc('user-1')
            .get();
        expect(doc.exists, isTrue);
        expect(doc.data()!['globalMute'], true);
      });

      test('merges updates with existing data', () async {
        await firestore
            .collection('userNotificationSettings')
            .doc('user-1')
            .set({
          'globalMute': false,
          'quietHoursStart': '22:00',
          'quietHoursEnd': '08:00',
        });

        await repo.updateSettings('user-1', {'globalMute': true});

        final doc = await firestore
            .collection('userNotificationSettings')
            .doc('user-1')
            .get();
        expect(doc.data()!['globalMute'], true);
        expect(doc.data()!['quietHoursStart'], '22:00'); // preserved
      });

      test('can update quiet hours', () async {
        await repo.updateSettings('user-1', {
          'quietHoursStart': '23:30',
          'quietHoursEnd': '06:30',
        });

        final doc = await firestore
            .collection('userNotificationSettings')
            .doc('user-1')
            .get();
        expect(doc.data()!['quietHoursStart'], '23:30');
        expect(doc.data()!['quietHoursEnd'], '06:30');
      });
    });

    group('updateTypePreference', () {
      test('stores preference for a specific notification type', () async {
        const pref = NotificationTypePreference(
          inApp: true,
          push: false,
          frequency: 'daily',
        );

        await repo.updateTypePreference(
          'user-1',
          NotificationType.budgetWarning,
          pref,
        );

        final doc = await firestore
            .collection('users')
            .doc('user-1')
            .collection('notificationPreferences')
            .doc('default')
            .get();

        expect(doc.exists, isTrue);
        final budgetWarning =
            doc.data()!['budget_warning'] as Map<String, dynamic>;
        expect(budgetWarning['inApp'], true);
        expect(budgetWarning['push'], false);
        expect(budgetWarning['frequency'], 'daily');
      });

      test('merges without overwriting other types', () async {
        // First, set a preference
        await repo.updateTypePreference(
          'user-1',
          NotificationType.budgetWarning,
          const NotificationTypePreference(
              inApp: true, push: true, frequency: 'realtime'),
        );

        // Then set a different type
        await repo.updateTypePreference(
          'user-1',
          NotificationType.groupExpenseAdded,
          const NotificationTypePreference(
              inApp: false, push: true, frequency: 'hourly'),
        );

        final doc = await firestore
            .collection('users')
            .doc('user-1')
            .collection('notificationPreferences')
            .doc('default')
            .get();

        // Both should be present
        expect(doc.data()!.containsKey('budget_warning'), true);
        expect(doc.data()!.containsKey('group_expense_added'), true);
        expect(
          (doc.data()!['group_expense_added']
              as Map<String, dynamic>)['inApp'],
          false,
        );
      });
    });

    group('initializeDefaults', () {
      test('creates settings doc when it does not exist', () async {
        await repo.initializeDefaults('new-user');

        final doc = await firestore
            .collection('userNotificationSettings')
            .doc('new-user')
            .get();
        expect(doc.exists, isTrue);
        expect(doc.data()!['globalMute'], false);
        expect(doc.data()!['quietHoursStart'], '22:00');
        expect(doc.data()!['quietHoursEnd'], '08:00');
      });

      test('creates preferences doc when it does not exist', () async {
        await repo.initializeDefaults('new-user');

        final doc = await firestore
            .collection('users')
            .doc('new-user')
            .collection('notificationPreferences')
            .doc('default')
            .get();
        expect(doc.exists, isTrue);

        // Should have all notification types
        for (final type in NotificationType.values) {
          expect(doc.data()!.containsKey(type.value), true,
              reason: 'Missing key for: ${type.value}');
        }
      });

      test('does not overwrite existing settings doc', () async {
        // Pre-populate with custom settings
        await firestore
            .collection('userNotificationSettings')
            .doc('existing-user')
            .set({
          'globalMute': true,
          'quietHoursStart': '20:00',
          'quietHoursEnd': '10:00',
        });

        await repo.initializeDefaults('existing-user');

        final doc = await firestore
            .collection('userNotificationSettings')
            .doc('existing-user')
            .get();
        // Should keep existing values
        expect(doc.data()!['globalMute'], true);
        expect(doc.data()!['quietHoursStart'], '20:00');
      });

      test('does not overwrite existing preferences doc', () async {
        // Pre-populate with custom prefs
        await firestore
            .collection('users')
            .doc('existing-user')
            .collection('notificationPreferences')
            .doc('default')
            .set({
          'budget_warning': {
            'inApp': false,
            'push': false,
            'frequency': 'never',
          },
        });

        await repo.initializeDefaults('existing-user');

        final doc = await firestore
            .collection('users')
            .doc('existing-user')
            .collection('notificationPreferences')
            .doc('default')
            .get();
        // Should keep existing custom preference
        final bw = doc.data()!['budget_warning'] as Map<String, dynamic>;
        expect(bw['inApp'], false);
        expect(bw['frequency'], 'never');
      });
    });
  });
}
