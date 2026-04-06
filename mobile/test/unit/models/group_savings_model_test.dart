import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/group_savings_model.dart';

void main() {
  group('GroupSavingsGoalModel', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    test('fromFirestore parses all fields correctly', () async {
      final now = Timestamp.now();
      final targetDate = Timestamp.fromDate(DateTime(2026, 12, 31));
      final startDate = Timestamp.fromDate(DateTime(2025, 1, 1));
      final doc = await firestore.collection('savings_goals_group').add({
        'groupId': 'group-1',
        'createdBy': 'user-1',
        'name': 'Emergency Fund',
        'category': 'emergency_fund',
        'targetAmount': 10000.00,
        'currentAmount': 3500.00,
        'monthlyContribution': 500.00,
        'status': 'active',
        'isActive': true,
        'priority': 'high',
        'currency': 'CAD',
        'createdAt': now,
        'updatedAt': now,
        'contributionType': 'proportional',
        'targetDate': targetDate,
        'startDate': startDate,
        'achievedDate': null,
        'progressPercentage': 35.0,
        'description': 'Building our emergency fund',
        'emoji': '🛡️',
        'lastContributionAt': now,
      });

      final snapshot = await doc.get();
      final goal = GroupSavingsGoalModel.fromFirestore(snapshot);

      expect(goal.id, doc.id);
      expect(goal.groupId, 'group-1');
      expect(goal.createdBy, 'user-1');
      expect(goal.name, 'Emergency Fund');
      expect(goal.category, 'emergency_fund');
      expect(goal.targetAmount, 10000.00);
      expect(goal.currentAmount, 3500.00);
      expect(goal.monthlyContribution, 500.00);
      expect(goal.status, 'active');
      expect(goal.isActive, true);
      expect(goal.priority, 'high');
      expect(goal.currency, 'CAD');
      expect(goal.contributionType, 'proportional');
      expect(goal.targetDate, targetDate);
      expect(goal.startDate, startDate);
      expect(goal.achievedDate, isNull);
      expect(goal.progressPercentage, 35.0);
      expect(goal.description, 'Building our emergency fund');
      expect(goal.emoji, '🛡️');
      expect(goal.lastContributionAt, now);
    });

    test('fromFirestore handles missing optional fields with defaults',
        () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('savings_goals_group').add({
        'groupId': 'group-1',
        'createdBy': 'user-1',
        'name': 'Vacation',
        'category': 'travel',
        'targetAmount': 5000,
        'currentAmount': 0,
        'monthlyContribution': 250,
        'createdAt': now,
        'updatedAt': now,
      });

      final snapshot = await doc.get();
      final goal = GroupSavingsGoalModel.fromFirestore(snapshot);

      expect(goal.status, 'active');
      expect(goal.isActive, true);
      expect(goal.priority, 'medium');
      expect(goal.currency, 'CAD');
      expect(goal.contributionType, 'equal');
      expect(goal.targetDate, isNull);
      expect(goal.startDate, isNull);
      expect(goal.achievedDate, isNull);
      expect(goal.progressPercentage, 0);
      expect(goal.description, isNull);
      expect(goal.emoji, isNull);
      expect(goal.lastContributionAt, isNull);
    });

    test('handles int values for numeric fields', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('savings_goals_group').add({
        'groupId': 'group-1',
        'createdBy': 'user-1',
        'name': 'House',
        'category': 'house_down_payment',
        'targetAmount': 50000, // int
        'currentAmount': 10000, // int
        'monthlyContribution': 1000, // int
        'createdAt': now,
        'updatedAt': now,
      });

      final snapshot = await doc.get();
      final goal = GroupSavingsGoalModel.fromFirestore(snapshot);

      expect(goal.targetAmount, 50000.0);
      expect(goal.targetAmount, isA<double>());
      expect(goal.currentAmount, 10000.0);
      expect(goal.currentAmount, isA<double>());
      expect(goal.monthlyContribution, 1000.0);
      expect(goal.monthlyContribution, isA<double>());
    });

    test('toFirestore produces correct map', () {
      final now = Timestamp.now();
      final goal = GroupSavingsGoalModel(
        id: 'test-id',
        groupId: 'group-1',
        createdBy: 'user-1',
        name: 'Vacation',
        category: 'travel',
        targetAmount: 5000,
        currentAmount: 2000,
        monthlyContribution: 300,
        status: 'active',
        isActive: true,
        priority: 'medium',
        currency: 'CAD',
        createdAt: now,
        updatedAt: now,
      );

      final map = goal.toFirestore();

      expect(map['groupId'], 'group-1');
      expect(map['createdBy'], 'user-1');
      expect(map['name'], 'Vacation');
      expect(map['targetAmount'], 5000);
      expect(map['currentAmount'], 2000);
      expect(map['status'], 'active');
      expect(map['progressPercentage'], 0);
      expect(map.containsKey('targetDate'), isFalse);
      expect(map.containsKey('startDate'), isFalse);
      expect(map.containsKey('achievedDate'), isFalse);
      expect(map.containsKey('description'), isFalse);
      expect(map.containsKey('emoji'), isFalse);
      expect(map.containsKey('lastContributionAt'), isFalse);
    });

    test('toFirestore includes optional fields when set', () {
      final now = Timestamp.now();
      final targetDate = Timestamp.fromDate(DateTime(2026, 6, 1));
      final goal = GroupSavingsGoalModel(
        id: 'test-id',
        groupId: 'group-1',
        createdBy: 'user-1',
        name: 'Wedding',
        category: 'wedding',
        targetAmount: 30000,
        currentAmount: 15000,
        monthlyContribution: 2000,
        status: 'active',
        isActive: true,
        priority: 'high',
        currency: 'CAD',
        createdAt: now,
        updatedAt: now,
        targetDate: targetDate,
        startDate: now,
        description: 'Wedding savings',
        emoji: '💍',
        lastContributionAt: now,
      );

      final map = goal.toFirestore();

      expect(map['targetDate'], targetDate);
      expect(map['startDate'], now);
      expect(map['description'], 'Wedding savings');
      expect(map['emoji'], '💍');
      expect(map['lastContributionAt'], now);
    });

    group('computedProgress getter', () {
      GroupSavingsGoalModel _makeGoal(double target, double current) {
        final now = Timestamp.now();
        return GroupSavingsGoalModel(
          id: 'test',
          groupId: 'g-1',
          createdBy: 'u-1',
          name: 'Test',
          category: 'custom',
          targetAmount: target,
          currentAmount: current,
          monthlyContribution: 100,
          status: 'active',
          isActive: true,
          priority: 'medium',
          currency: 'CAD',
          createdAt: now,
          updatedAt: now,
        );
      }

      test('calculates correct percentage', () {
        expect(_makeGoal(10000, 3500).computedProgress, closeTo(35.0, 0.01));
      });

      test('returns 0 when target is 0', () {
        expect(_makeGoal(0, 500).computedProgress, 0);
      });

      test('clamps at 100 when current exceeds target', () {
        expect(_makeGoal(1000, 1500).computedProgress, 100);
      });

      test('returns 0 when current is 0', () {
        expect(_makeGoal(5000, 0).computedProgress, 0);
      });

      test('returns 100 when exactly at target', () {
        expect(_makeGoal(5000, 5000).computedProgress, 100);
      });

      test('handles fractional amounts', () {
        expect(
            _makeGoal(3000, 1234.56).computedProgress, closeTo(41.15, 0.01));
      });
    });

    group('defaultEmoji getter', () {
      GroupSavingsGoalModel _makeGoal(String category) {
        final now = Timestamp.now();
        return GroupSavingsGoalModel(
          id: 'test',
          groupId: 'g-1',
          createdBy: 'u-1',
          name: 'Test',
          category: category,
          targetAmount: 1000,
          currentAmount: 0,
          monthlyContribution: 100,
          status: 'active',
          isActive: true,
          priority: 'medium',
          currency: 'CAD',
          createdAt: now,
          updatedAt: now,
        );
      }

      test('emergency_fund returns shield emoji', () {
        expect(_makeGoal('emergency_fund').defaultEmoji, '\u{1F6E1}\u{FE0F}');
      });

      test('travel returns airplane emoji', () {
        expect(_makeGoal('travel').defaultEmoji, '\u{2708}\u{FE0F}');
      });

      test('education returns books emoji', () {
        expect(_makeGoal('education').defaultEmoji, '\u{1F4DA}');
      });

      test('health returns hospital emoji', () {
        expect(_makeGoal('health').defaultEmoji, '\u{1F3E5}');
      });

      test('house_down_payment returns house emoji', () {
        expect(_makeGoal('house_down_payment').defaultEmoji, '\u{1F3E0}');
      });

      test('car returns car emoji', () {
        expect(_makeGoal('car').defaultEmoji, '\u{1F697}');
      });

      test('wedding returns ring emoji', () {
        expect(_makeGoal('wedding').defaultEmoji, '\u{1F48D}');
      });

      test('retirement returns beach emoji', () {
        expect(_makeGoal('retirement').defaultEmoji, '\u{1F3D6}\u{FE0F}');
      });

      test('investment returns chart emoji', () {
        expect(_makeGoal('investment').defaultEmoji, '\u{1F4C8}');
      });

      test('unknown category returns target emoji', () {
        expect(_makeGoal('custom').defaultEmoji, '\u{1F3AF}');
      });

      test('empty category returns target emoji', () {
        expect(_makeGoal('').defaultEmoji, '\u{1F3AF}');
      });
    });
  });
}
