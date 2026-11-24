import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/api_timestamp.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/models/group_member_model.dart';
import 'package:penny_mobile/data/models/group_model.dart';
import 'package:penny_mobile/data/models/notification_model.dart';
import 'package:penny_mobile/data/repositories/api_response_helpers.dart';
import 'package:penny_mobile/data/repositories/expense_repository.dart';
import 'package:penny_mobile/data/repositories/notification_repository.dart';

import '../../helpers/fake_api_client.dart';

void main() {
  group('tolerant model parsing', () {
    test('Timestamp.tryParse returns null for an unparseable date string', () {
      expect(Timestamp.tryParse('not-a-date'), isNull);
      expect(Timestamp.tryParse('2026-04-03T12:00:00.000Z'), isNotNull);
    });

    test('notification without title/body/userId and a double count', () {
      final n = NotificationModel.fromFirestore(
        apiDocument({
          'id': 'n1',
          'type': 'group_invitation',
          'groupCount': 3.0,
          'createdAt': 'garbage',
        }),
      );
      expect(n.title, '');
      expect(n.body, '');
      expect(n.userId, '');
      expect(n.groupCount, 3);
    });

    test('group member without userEmail/invitedBy', () {
      final m = GroupMemberModel.fromFirestore(
        apiDocument({'id': 'g1_u1', 'groupId': 'g1', 'userId': 'u1'}),
      );
      expect(m.userEmail, '');
      expect(m.invitedBy, '');
      expect(m.role, 'viewer');
      expect(m.permissions.canAddExpenses, isFalse);
    });

    test('expense without a vendor and with a bad createdAt', () {
      final e = ExpenseModel.fromFirestore(
        apiDocument({
          'id': 'e1',
          'userId': 'u1',
          'amount': 10,
          'category': 'Office expenses',
          'date': '2026-04-03T12:00:00.000Z',
          'createdAt': 'garbage',
        }),
      );
      expect(e.vendor, '');
      expect(e.amount, 10);
    });

    test('group stats counts sent as doubles', () {
      final stats = GroupStats.fromMap({
        'memberCount': 2.0,
        'expenseCount': 7.0,
      });
      expect(stats.memberCount, 2);
      expect(stats.expenseCount, 7);
    });
  });

  group('list endpoints skip an item that cannot be parsed', () {
    test('expenses', () async {
      final api = FakeApiClient();
      api.queueResponse({
        'expenses': [
          {'id': 'bad', 'vendor': 'No amount'},
          {
            'id': 'good',
            'userId': 'u1',
            'vendor': 'Store',
            'amount': 10,
            'category': 'Office expenses',
            'date': '2026-04-03T12:00:00.000Z',
          },
        ],
      });
      final expenses = await ExpenseRepository(
        apiClient: api,
      ).watchAllExpenses('u1').first;
      expect(expenses.map((e) => e.id), ['good']);
    });

    test('notifications', () async {
      final api = FakeApiClient();
      api.queueResponse({
        'notifications': [
          {'id': 'bad', 'metadata': 'not-a-map', 'actions': 'nope'},
          {'id': 'good', 'userId': 'u1', 'type': 'system', 'title': 'Hi'},
        ],
      });
      final list = await NotificationRepository(
        apiClient: api,
      ).watchNotifications('u1').first;
      expect(list.map((n) => n.id), ['good']);
    });
  });
}
