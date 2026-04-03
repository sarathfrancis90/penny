import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/savings_model.dart';

void main() {
  group('SavingsGoalModel', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    test('fromFirestore parses all fields', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('savings_goals_personal').add({
        'userId': 'user-1',
        'name': 'Japan Trip',
        'category': 'travel',
        'targetAmount': 5000,
        'currentAmount': 3200,
        'monthlyContribution': 500,
        'status': 'active',
        'isActive': true,
        'priority': 'high',
        'currency': 'CAD',
        'progressPercentage': 64,
        'monthsToGoal': 4,
        'onTrack': true,
        'emoji': '✈️',
        'description': 'Tokyo + Osaka',
        'startDate': now,
        'createdAt': now,
        'updatedAt': now,
        'targetDate': now,
      });

      final model = SavingsGoalModel.fromFirestore(await doc.get());

      expect(model.name, 'Japan Trip');
      expect(model.category, 'travel');
      expect(model.targetAmount, 5000.0);
      expect(model.currentAmount, 3200.0);
      expect(model.monthlyContribution, 500.0);
      expect(model.status, 'active');
      expect(model.priority, 'high');
      expect(model.progressPercentage, 64.0);
      expect(model.monthsToGoal, 4);
      expect(model.onTrack, true);
      expect(model.emoji, '✈️');
      expect(model.description, 'Tokyo + Osaka');
      expect(model.targetDate, isNotNull);
    });

    test('fromFirestore handles missing optional fields', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('savings_goals_personal').add({
        'userId': 'user-1',
        'name': 'Emergency Fund',
        'category': 'emergency_fund',
        'targetAmount': 10000,
        'currentAmount': 0,
        'monthlyContribution': 200,
        'status': 'active',
        'isActive': true,
        'priority': 'critical',
        'currency': 'CAD',
        'startDate': now,
        'createdAt': now,
        'updatedAt': now,
      });

      final model = SavingsGoalModel.fromFirestore(await doc.get());

      expect(model.targetDate, isNull);
      expect(model.achievedDate, isNull);
      expect(model.description, isNull);
      expect(model.emoji, isNull);
      expect(model.monthsToGoal, isNull);
      expect(model.progressPercentage, 0);
      expect(model.onTrack, false);
    });

    test('defaultEmoji returns correct emoji per category', () async {
      final now = Timestamp.now();
      final base = {
        'userId': 'u', 'name': 'X', 'targetAmount': 100,
        'currentAmount': 0, 'monthlyContribution': 10,
        'status': 'active', 'isActive': true, 'priority': 'medium',
        'currency': 'CAD', 'startDate': now, 'createdAt': now, 'updatedAt': now,
      };

      Future<SavingsGoalModel> create(String cat) async {
        final doc = await firestore.collection('savings_goals_personal')
            .add({...base, 'category': cat});
        return SavingsGoalModel.fromFirestore(await doc.get());
      }

      expect((await create('emergency_fund')).defaultEmoji, '💰');
      expect((await create('travel')).defaultEmoji, '✈️');
      expect((await create('education')).defaultEmoji, '🎓');
      expect((await create('health')).defaultEmoji, '💊');
      expect((await create('house_down_payment')).defaultEmoji, '🏠');
      expect((await create('car')).defaultEmoji, '🚗');
      expect((await create('wedding')).defaultEmoji, '💍');
      expect((await create('retirement')).defaultEmoji, '🏖️');
      expect((await create('investment')).defaultEmoji, '📈');
      expect((await create('custom')).defaultEmoji, '🎯');
    });

    test('toFirestore excludes null optional fields', () async {
      final now = Timestamp.now();
      final model = SavingsGoalModel(
        id: 'test', userId: 'user-1', name: 'Test',
        category: 'custom', targetAmount: 1000, currentAmount: 0,
        monthlyContribution: 50, status: 'active', isActive: true,
        priority: 'low', currency: 'CAD', startDate: now,
        createdAt: now, updatedAt: now,
      );

      final map = model.toFirestore();
      expect(map.containsKey('id'), isFalse);
      expect(map.containsKey('targetDate'), isFalse);
      expect(map.containsKey('achievedDate'), isFalse);
      expect(map.containsKey('description'), isFalse);
      expect(map.containsKey('emoji'), isFalse);
      expect(map['progressPercentage'], 0);
      expect(map['onTrack'], false);
    });
  });
}
