import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/repositories/group_savings_repository.dart';

void main() {
  group('GroupSavingsRepository', () {
    late FakeFirebaseFirestore firestore;
    late GroupSavingsRepository repo;

    setUp(() {
      firestore = FakeFirebaseFirestore();
      repo = GroupSavingsRepository(firestore: firestore);
    });

    group('createGroupSavingsGoal', () {
      test('stores all required fields with correct defaults', () async {
        final id = await repo.createGroupSavingsGoal(
          groupId: 'group-1',
          createdBy: 'user-1',
          name: 'Emergency Fund',
          category: 'emergency_fund',
          targetAmount: 10000,
          monthlyContribution: 500,
          priority: 'high',
        );

        expect(id, isNotEmpty);

        final doc =
            await firestore.collection('savings_goals_group').doc(id).get();
        final data = doc.data()!;

        expect(data['groupId'], 'group-1');
        expect(data['createdBy'], 'user-1');
        expect(data['name'], 'Emergency Fund');
        expect(data['category'], 'emergency_fund');
        expect(data['targetAmount'], 10000);
        expect(data['currentAmount'], 0);
        expect(data['monthlyContribution'], 500);
        expect(data['status'], 'active');
        expect(data['isActive'], true);
        expect(data['priority'], 'high');
        expect(data['currency'], 'CAD');
        expect(data['contributionType'], 'equal');
        expect(data['progressPercentage'], 0);
        expect(data['startDate'], isA<Timestamp>());
        expect(data['createdAt'], isA<Timestamp>());
        expect(data['updatedAt'], isA<Timestamp>());
      });

      test('stores optional fields when provided', () async {
        final targetDate = DateTime(2027, 12, 31);
        final id = await repo.createGroupSavingsGoal(
          groupId: 'group-1',
          createdBy: 'user-1',
          name: 'Vacation',
          category: 'travel',
          targetAmount: 5000,
          monthlyContribution: 300,
          priority: 'medium',
          currency: 'USD',
          contributionType: 'proportional',
          description: 'Group vacation to Japan',
          emoji: '\u{2708}\u{FE0F}',
          targetDate: targetDate,
        );

        final doc =
            await firestore.collection('savings_goals_group').doc(id).get();
        final data = doc.data()!;

        expect(data['currency'], 'USD');
        expect(data['contributionType'], 'proportional');
        expect(data['description'], 'Group vacation to Japan');
        expect(data['emoji'], '\u{2708}\u{FE0F}');
        expect(data['targetDate'], isA<Timestamp>());
      });

      test('omits optional fields when not provided', () async {
        final id = await repo.createGroupSavingsGoal(
          groupId: 'group-1',
          createdBy: 'user-1',
          name: 'Minimal Goal',
          category: 'custom',
          targetAmount: 1000,
          monthlyContribution: 100,
          priority: 'low',
        );

        final doc =
            await firestore.collection('savings_goals_group').doc(id).get();
        final data = doc.data()!;

        expect(data.containsKey('description'), isFalse);
        expect(data.containsKey('emoji'), isFalse);
        expect(data.containsKey('targetDate'), isFalse);
      });
    });

    group('updateGroupSavingsGoal', () {
      test('modifies specified fields', () async {
        final id = await repo.createGroupSavingsGoal(
          groupId: 'group-1',
          createdBy: 'user-1',
          name: 'Original',
          category: 'custom',
          targetAmount: 5000,
          monthlyContribution: 250,
          priority: 'medium',
        );

        await repo.updateGroupSavingsGoal(id, {
          'name': 'Renamed Goal',
          'targetAmount': 8000,
          'priority': 'high',
        });

        final doc =
            await firestore.collection('savings_goals_group').doc(id).get();
        expect(doc.data()!['name'], 'Renamed Goal');
        expect(doc.data()!['targetAmount'], 8000);
        expect(doc.data()!['priority'], 'high');
      });

      test('updates updatedAt timestamp', () async {
        final id = await repo.createGroupSavingsGoal(
          groupId: 'group-1',
          createdBy: 'user-1',
          name: 'Test',
          category: 'custom',
          targetAmount: 1000,
          monthlyContribution: 100,
          priority: 'low',
        );

        await repo.updateGroupSavingsGoal(id, {'name': 'Changed'});

        final doc =
            await firestore.collection('savings_goals_group').doc(id).get();
        expect(doc.data()!['updatedAt'], isA<Timestamp>());
      });
    });

    group('addGroupContribution', () {
      test('increases currentAmount by contribution', () async {
        final id = await repo.createGroupSavingsGoal(
          groupId: 'group-1',
          createdBy: 'user-1',
          name: 'Test Goal',
          category: 'emergency_fund',
          targetAmount: 1000,
          monthlyContribution: 100,
          priority: 'medium',
        );

        await repo.addGroupContribution(id, 250, 'user-1');

        final doc =
            await firestore.collection('savings_goals_group').doc(id).get();
        expect(doc.data()!['currentAmount'], 250);
      });

      test('calculates correct progress percentage', () async {
        final id = await repo.createGroupSavingsGoal(
          groupId: 'group-1',
          createdBy: 'user-1',
          name: 'Test Goal',
          category: 'emergency_fund',
          targetAmount: 1000,
          monthlyContribution: 100,
          priority: 'medium',
        );

        await repo.addGroupContribution(id, 350, 'user-1');

        final doc =
            await firestore.collection('savings_goals_group').doc(id).get();
        expect(doc.data()!['progressPercentage'], closeTo(35.0, 0.01));
      });

      test('marks goal as achieved when reaching 100%', () async {
        final id = await repo.createGroupSavingsGoal(
          groupId: 'group-1',
          createdBy: 'user-1',
          name: 'Quick Goal',
          category: 'custom',
          targetAmount: 500,
          monthlyContribution: 100,
          priority: 'low',
        );

        await repo.addGroupContribution(id, 500, 'user-1');

        final doc =
            await firestore.collection('savings_goals_group').doc(id).get();
        expect(doc.data()!['status'], 'achieved');
        expect(doc.data()!['progressPercentage'], closeTo(100.0, 0.01));
      });

      test('marks goal as achieved when exceeding 100%', () async {
        final id = await repo.createGroupSavingsGoal(
          groupId: 'group-1',
          createdBy: 'user-1',
          name: 'Overfunded',
          category: 'custom',
          targetAmount: 200,
          monthlyContribution: 100,
          priority: 'low',
        );

        await repo.addGroupContribution(id, 300, 'user-1');

        final doc =
            await firestore.collection('savings_goals_group').doc(id).get();
        expect(doc.data()!['status'], 'achieved');
        expect((doc.data()!['progressPercentage'] as num).toDouble(),
            greaterThan(100));
      });

      test('sets lastContributionAt timestamp', () async {
        final id = await repo.createGroupSavingsGoal(
          groupId: 'group-1',
          createdBy: 'user-1',
          name: 'Test',
          category: 'custom',
          targetAmount: 1000,
          monthlyContribution: 100,
          priority: 'low',
        );

        await repo.addGroupContribution(id, 100, 'user-1');

        final doc =
            await firestore.collection('savings_goals_group').doc(id).get();
        expect(doc.data()!['lastContributionAt'], isA<Timestamp>());
      });

      test('handles multiple contributions correctly', () async {
        final id = await repo.createGroupSavingsGoal(
          groupId: 'group-1',
          createdBy: 'user-1',
          name: 'Multi Contrib',
          category: 'emergency_fund',
          targetAmount: 1000,
          monthlyContribution: 100,
          priority: 'medium',
        );

        await repo.addGroupContribution(id, 200, 'user-1');
        await repo.addGroupContribution(id, 150, 'user-2');

        final doc =
            await firestore.collection('savings_goals_group').doc(id).get();
        expect(doc.data()!['currentAmount'], 350);
        expect(doc.data()!['progressPercentage'], closeTo(35.0, 0.01));
        expect(doc.data()!['status'], 'active');
      });

      test('does nothing for non-existent goal', () async {
        // Should not throw
        await repo.addGroupContribution(
            'non-existent-goal-id', 100, 'user-1');
        // Just verify it completes without error
      });
    });

    group('deleteGroupSavingsGoal', () {
      test('removes document from Firestore', () async {
        final id = await repo.createGroupSavingsGoal(
          groupId: 'group-1',
          createdBy: 'user-1',
          name: 'To Delete',
          category: 'car',
          targetAmount: 20000,
          monthlyContribution: 500,
          priority: 'high',
        );

        await repo.deleteGroupSavingsGoal(id);

        final doc =
            await firestore.collection('savings_goals_group').doc(id).get();
        expect(doc.exists, isFalse);
      });
    });

    group('watchGroupSavingsGoals', () {
      test('streams active goals for a group', () async {
        await repo.createGroupSavingsGoal(
          groupId: 'group-1',
          createdBy: 'user-1',
          name: 'Goal A',
          category: 'emergency_fund',
          targetAmount: 5000,
          monthlyContribution: 200,
          priority: 'high',
        );

        await repo.createGroupSavingsGoal(
          groupId: 'group-2',
          createdBy: 'user-2',
          name: 'Goal B',
          category: 'travel',
          targetAmount: 3000,
          monthlyContribution: 150,
          priority: 'medium',
        );

        final goals =
            await repo.watchGroupSavingsGoals('group-1').first;
        expect(goals.length, 1);
        expect(goals.first.name, 'Goal A');
      });

      test('excludes inactive goals', () async {
        final id = await repo.createGroupSavingsGoal(
          groupId: 'group-1',
          createdBy: 'user-1',
          name: 'Will Deactivate',
          category: 'custom',
          targetAmount: 1000,
          monthlyContribution: 50,
          priority: 'low',
        );

        await repo.updateGroupSavingsGoal(id, {'isActive': false});

        final goals =
            await repo.watchGroupSavingsGoals('group-1').first;
        expect(goals.length, 0);
      });

      test('returns empty list for group with no goals', () async {
        final goals =
            await repo.watchGroupSavingsGoals('empty-group').first;
        expect(goals, isEmpty);
      });
    });
  });
}
