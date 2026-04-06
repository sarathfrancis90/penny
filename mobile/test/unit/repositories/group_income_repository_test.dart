import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/repositories/group_income_repository.dart';

void main() {
  group('GroupIncomeRepository', () {
    late FakeFirebaseFirestore firestore;
    late GroupIncomeRepository repo;

    setUp(() {
      firestore = FakeFirebaseFirestore();
      repo = GroupIncomeRepository(firestore: firestore);
    });

    group('createGroupIncomeSource', () {
      test('stores all required fields', () async {
        final id = await repo.createGroupIncomeSource(
          groupId: 'group-1',
          addedBy: 'user-1',
          name: 'Consulting Revenue',
          category: 'freelance',
          amount: 5000,
          frequency: 'monthly',
          isRecurring: true,
          taxable: true,
        );

        expect(id, isNotEmpty);

        final doc =
            await firestore.collection('income_sources_group').doc(id).get();
        final data = doc.data()!;

        expect(data['groupId'], 'group-1');
        expect(data['addedBy'], 'user-1');
        expect(data['name'], 'Consulting Revenue');
        expect(data['category'], 'freelance');
        expect(data['amount'], 5000);
        expect(data['frequency'], 'monthly');
        expect(data['isRecurring'], true);
        expect(data['isActive'], true);
        expect(data['taxable'], true);
        expect(data['currency'], 'CAD');
        expect(data['splitType'], 'equal');
        expect(data['startDate'], isA<Timestamp>());
        expect(data['createdAt'], isA<Timestamp>());
        expect(data['updatedAt'], isA<Timestamp>());
      });

      test('stores optional fields when provided', () async {
        final id = await repo.createGroupIncomeSource(
          groupId: 'group-1',
          addedBy: 'user-1',
          name: 'Side project',
          category: 'other',
          amount: 2000,
          frequency: 'monthly',
          isRecurring: true,
          taxable: false,
          currency: 'USD',
          description: 'Monthly side project income',
          contributedBy: 'user-2',
          splitType: 'proportional',
          recurringDate: 15,
        );

        final doc =
            await firestore.collection('income_sources_group').doc(id).get();
        final data = doc.data()!;

        expect(data['currency'], 'USD');
        expect(data['description'], 'Monthly side project income');
        expect(data['contributedBy'], 'user-2');
        expect(data['splitType'], 'proportional');
        expect(data['recurringDate'], 15);
      });

      test('omits optional fields when not provided', () async {
        final id = await repo.createGroupIncomeSource(
          groupId: 'group-1',
          addedBy: 'user-1',
          name: 'Minimal',
          category: 'other',
          amount: 100,
          frequency: 'once',
          isRecurring: false,
          taxable: false,
        );

        final doc =
            await firestore.collection('income_sources_group').doc(id).get();
        final data = doc.data()!;

        expect(data.containsKey('description'), isFalse);
        expect(data.containsKey('contributedBy'), isFalse);
        expect(data.containsKey('recurringDate'), isFalse);
      });
    });

    group('updateGroupIncomeSource', () {
      test('modifies specified fields', () async {
        final id = await repo.createGroupIncomeSource(
          groupId: 'group-1',
          addedBy: 'user-1',
          name: 'Original',
          category: 'salary',
          amount: 3000,
          frequency: 'monthly',
          isRecurring: true,
          taxable: true,
        );

        await repo.updateGroupIncomeSource(id, {
          'name': 'Updated Name',
          'amount': 4000,
        });

        final doc =
            await firestore.collection('income_sources_group').doc(id).get();
        expect(doc.data()!['name'], 'Updated Name');
        expect(doc.data()!['amount'], 4000);
      });

      test('updates updatedAt timestamp', () async {
        final id = await repo.createGroupIncomeSource(
          groupId: 'group-1',
          addedBy: 'user-1',
          name: 'Test',
          category: 'salary',
          amount: 1000,
          frequency: 'monthly',
          isRecurring: true,
          taxable: true,
        );

        await repo.updateGroupIncomeSource(id, {'name': 'Changed'});

        final doc =
            await firestore.collection('income_sources_group').doc(id).get();
        expect(doc.data()!['updatedAt'], isA<Timestamp>());
      });

      test('can deactivate income source', () async {
        final id = await repo.createGroupIncomeSource(
          groupId: 'group-1',
          addedBy: 'user-1',
          name: 'To Deactivate',
          category: 'salary',
          amount: 5000,
          frequency: 'monthly',
          isRecurring: true,
          taxable: true,
        );

        await repo.updateGroupIncomeSource(id, {'isActive': false});

        final doc =
            await firestore.collection('income_sources_group').doc(id).get();
        expect(doc.data()!['isActive'], false);
      });
    });

    group('deleteGroupIncomeSource', () {
      test('removes document from Firestore', () async {
        final id = await repo.createGroupIncomeSource(
          groupId: 'group-1',
          addedBy: 'user-1',
          name: 'To Delete',
          category: 'other',
          amount: 500,
          frequency: 'once',
          isRecurring: false,
          taxable: false,
        );

        await repo.deleteGroupIncomeSource(id);

        final doc =
            await firestore.collection('income_sources_group').doc(id).get();
        expect(doc.exists, isFalse);
      });
    });

    group('watchGroupIncomeSources', () {
      test('streams active income sources for a group', () async {
        // Active source for group-1
        await repo.createGroupIncomeSource(
          groupId: 'group-1',
          addedBy: 'user-1',
          name: 'Source A',
          category: 'salary',
          amount: 5000,
          frequency: 'monthly',
          isRecurring: true,
          taxable: true,
        );

        // Active source for group-2 (excluded)
        await repo.createGroupIncomeSource(
          groupId: 'group-2',
          addedBy: 'user-1',
          name: 'Source B',
          category: 'salary',
          amount: 3000,
          frequency: 'monthly',
          isRecurring: true,
          taxable: true,
        );

        final sources =
            await repo.watchGroupIncomeSources('group-1').first;
        expect(sources.length, 1);
        expect(sources.first.name, 'Source A');
        expect(sources.first.groupId, 'group-1');
      });

      test('excludes deactivated income sources', () async {
        final id = await repo.createGroupIncomeSource(
          groupId: 'group-1',
          addedBy: 'user-1',
          name: 'Will Deactivate',
          category: 'salary',
          amount: 1000,
          frequency: 'monthly',
          isRecurring: true,
          taxable: true,
        );

        await repo.updateGroupIncomeSource(id, {'isActive': false});

        final sources =
            await repo.watchGroupIncomeSources('group-1').first;
        expect(sources.length, 0);
      });

      test('returns empty list for group with no income sources', () async {
        final sources =
            await repo.watchGroupIncomeSources('empty-group').first;
        expect(sources, isEmpty);
      });
    });
  });
}
