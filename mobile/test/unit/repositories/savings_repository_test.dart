import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/repositories/savings_repository.dart';

void main() {
  group('SavingsRepository', () {
    late FakeFirebaseFirestore firestore;
    late SavingsRepository repo;

    setUp(() {
      firestore = FakeFirebaseFirestore();
      repo = SavingsRepository(firestore: firestore);
    });

    test('createSavingsGoal stores all fields', () async {
      final id = await repo.createSavingsGoal(
        userId: 'user-1',
        name: 'Japan Trip',
        category: 'travel',
        targetAmount: 5000,
        monthlyContribution: 500,
        priority: 'high',
        emoji: '✈️',
      );

      final doc = await firestore.collection('savings_goals_personal').doc(id).get();
      expect(doc.exists, isTrue);
      expect(doc.data()!['name'], 'Japan Trip');
      expect(doc.data()!['targetAmount'], 5000);
      expect(doc.data()!['currentAmount'], 0);
      expect(doc.data()!['monthlyContribution'], 500);
      expect(doc.data()!['priority'], 'high');
      expect(doc.data()!['status'], 'active');
      expect(doc.data()!['progressPercentage'], 0);
    });

    test('addContribution updates currentAmount and progress', () async {
      final id = await repo.createSavingsGoal(
        userId: 'user-1',
        name: 'Test Goal',
        category: 'emergency_fund',
        targetAmount: 1000,
        monthlyContribution: 100,
        priority: 'medium',
      );

      await repo.addContribution(id, 250);

      final doc = await firestore.collection('savings_goals_personal').doc(id).get();
      expect(doc.data()!['currentAmount'], 250);
      expect(doc.data()!['progressPercentage'], 25.0);
      expect(doc.data()!['status'], 'active');
    });

    test('addContribution marks goal achieved at 100%', () async {
      final id = await repo.createSavingsGoal(
        userId: 'user-1',
        name: 'Quick Goal',
        category: 'custom',
        targetAmount: 100,
        monthlyContribution: 50,
        priority: 'low',
      );

      await repo.addContribution(id, 100);

      final doc = await firestore.collection('savings_goals_personal').doc(id).get();
      expect(doc.data()!['currentAmount'], 100);
      expect(doc.data()!['progressPercentage'], 100.0);
      expect(doc.data()!['status'], 'achieved');
    });

    test('deleteSavingsGoal removes document', () async {
      final id = await repo.createSavingsGoal(
        userId: 'user-1',
        name: 'To Delete',
        category: 'car',
        targetAmount: 20000,
        monthlyContribution: 300,
        priority: 'medium',
      );

      await repo.deleteSavingsGoal(id);

      final doc = await firestore.collection('savings_goals_personal').doc(id).get();
      expect(doc.exists, isFalse);
    });
  });
}
