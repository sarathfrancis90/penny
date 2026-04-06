import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/group_activity_model.dart';

void main() {
  group('GroupActivityModel', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    test('fromFirestore parses all fields correctly', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('groupActivities').add({
        'groupId': 'group-1',
        'userId': 'user-1',
        'action': 'expense_added',
        'createdAt': now,
        'userName': 'Alice',
        'details': 'Alice added an expense of \$25.00',
        'metadata': {'expenseId': 'exp-1', 'amount': 25.00},
      });

      final snapshot = await doc.get();
      final activity = GroupActivityModel.fromFirestore(snapshot);

      expect(activity.id, doc.id);
      expect(activity.groupId, 'group-1');
      expect(activity.userId, 'user-1');
      expect(activity.action, 'expense_added');
      expect(activity.createdAt, now);
      expect(activity.userName, 'Alice');
      expect(activity.details, 'Alice added an expense of \$25.00');
      expect(activity.metadata, isNotNull);
      expect(activity.metadata!['expenseId'], 'exp-1');
      expect(activity.metadata!['amount'], 25.00);
    });

    test('fromFirestore handles missing optional fields', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('groupActivities').add({
        'groupId': 'group-1',
        'userId': 'user-1',
        'action': 'group_created',
        'createdAt': now,
      });

      final snapshot = await doc.get();
      final activity = GroupActivityModel.fromFirestore(snapshot);

      expect(activity.groupId, 'group-1');
      expect(activity.userName, isNull);
      expect(activity.details, isNull);
      expect(activity.metadata, isNull);
    });

    test('fromFirestore uses defaults for missing required fields', () async {
      final doc = await firestore.collection('groupActivities').add({
        // all required fields missing
      });

      final snapshot = await doc.get();
      final activity = GroupActivityModel.fromFirestore(snapshot);

      expect(activity.groupId, '');
      expect(activity.userId, '');
      expect(activity.action, '');
    });

    group('icon getter', () {
      GroupActivityModel _makeActivity(String action) {
        return GroupActivityModel(
          id: 'test',
          groupId: 'g-1',
          userId: 'u-1',
          action: action,
          createdAt: Timestamp.now(),
        );
      }

      test('returns correct emoji for group_created', () {
        expect(_makeActivity('group_created').icon, '🎉');
      });

      test('returns correct emoji for member_invited', () {
        expect(_makeActivity('member_invited').icon, '📨');
      });

      test('returns correct emoji for member_joined', () {
        expect(_makeActivity('member_joined').icon, '👋');
      });

      test('returns correct emoji for member_left', () {
        expect(_makeActivity('member_left').icon, '👤');
      });

      test('returns correct emoji for member_removed', () {
        expect(_makeActivity('member_removed').icon, '❌');
      });

      test('returns correct emoji for member_role_changed', () {
        expect(_makeActivity('member_role_changed').icon, '🔄');
      });

      test('returns correct emoji for expense_added', () {
        expect(_makeActivity('expense_added').icon, '💵');
      });

      test('returns correct emoji for expense_updated', () {
        expect(_makeActivity('expense_updated').icon, '✏️');
      });

      test('returns correct emoji for expense_deleted', () {
        expect(_makeActivity('expense_deleted').icon, '🗑️');
      });

      test('returns correct emoji for expense_approved', () {
        expect(_makeActivity('expense_approved').icon, '✅');
      });

      test('returns correct emoji for expense_rejected', () {
        expect(_makeActivity('expense_rejected').icon, '❌');
      });

      test('returns correct emoji for settings_updated', () {
        expect(_makeActivity('settings_updated').icon, '⚙️');
      });

      test('returns default emoji for unknown action', () {
        expect(_makeActivity('unknown_action').icon, '📝');
      });
    });

    group('displayText getter', () {
      test('returns details when provided', () {
        final activity = GroupActivityModel(
          id: 'test',
          groupId: 'g-1',
          userId: 'u-1',
          action: 'expense_added',
          createdAt: Timestamp.now(),
          userName: 'Alice',
          details: 'Alice added \$50.00 at Costco',
        );
        expect(activity.displayText, 'Alice added \$50.00 at Costco');
      });

      test('returns fallback text with userName when details is null', () {
        final activity = GroupActivityModel(
          id: 'test',
          groupId: 'g-1',
          userId: 'u-1',
          action: 'expense_added',
          createdAt: Timestamp.now(),
          userName: 'Bob',
        );
        expect(activity.displayText, 'Bob performed expense_added');
      });

      test('returns fallback text with "Someone" when both are null', () {
        final activity = GroupActivityModel(
          id: 'test',
          groupId: 'g-1',
          userId: 'u-1',
          action: 'group_created',
          createdAt: Timestamp.now(),
        );
        expect(activity.displayText, 'Someone performed group_created');
      });
    });

    group('timeAgo getter', () {
      test('returns "just now" for less than 1 minute ago', () {
        final activity = GroupActivityModel(
          id: 'test',
          groupId: 'g-1',
          userId: 'u-1',
          action: 'expense_added',
          createdAt: Timestamp.fromDate(
            DateTime.now().subtract(const Duration(seconds: 30)),
          ),
        );
        expect(activity.timeAgo, 'just now');
      });

      test('returns minutes ago for less than 1 hour', () {
        final activity = GroupActivityModel(
          id: 'test',
          groupId: 'g-1',
          userId: 'u-1',
          action: 'expense_added',
          createdAt: Timestamp.fromDate(
            DateTime.now().subtract(const Duration(minutes: 15)),
          ),
        );
        expect(activity.timeAgo, '15m ago');
      });

      test('returns hours ago for less than 1 day', () {
        final activity = GroupActivityModel(
          id: 'test',
          groupId: 'g-1',
          userId: 'u-1',
          action: 'expense_added',
          createdAt: Timestamp.fromDate(
            DateTime.now().subtract(const Duration(hours: 5)),
          ),
        );
        expect(activity.timeAgo, '5h ago');
      });

      test('returns days ago for less than 1 week', () {
        final activity = GroupActivityModel(
          id: 'test',
          groupId: 'g-1',
          userId: 'u-1',
          action: 'expense_added',
          createdAt: Timestamp.fromDate(
            DateTime.now().subtract(const Duration(days: 3)),
          ),
        );
        expect(activity.timeAgo, '3d ago');
      });

      test('returns weeks ago for 7+ days', () {
        final activity = GroupActivityModel(
          id: 'test',
          groupId: 'g-1',
          userId: 'u-1',
          action: 'expense_added',
          createdAt: Timestamp.fromDate(
            DateTime.now().subtract(const Duration(days: 14)),
          ),
        );
        expect(activity.timeAgo, '2w ago');
      });
    });
  });
}
