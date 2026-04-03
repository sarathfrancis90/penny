import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/repositories/income_repository.dart';

void main() {
  group('IncomeRepository', () {
    late FakeFirebaseFirestore firestore;
    late IncomeRepository repo;

    setUp(() {
      firestore = FakeFirebaseFirestore();
      repo = IncomeRepository(firestore: firestore);
    });

    test('createIncomeSource stores all fields', () async {
      final id = await repo.createIncomeSource(
        userId: 'user-1',
        name: 'Software Consulting',
        category: 'salary',
        amount: 6000,
        frequency: 'monthly',
        isRecurring: true,
        taxable: true,
      );

      final doc = await firestore.collection('income_sources_personal').doc(id).get();
      expect(doc.exists, isTrue);
      expect(doc.data()!['name'], 'Software Consulting');
      expect(doc.data()!['amount'], 6000);
      expect(doc.data()!['frequency'], 'monthly');
      expect(doc.data()!['isActive'], true);
      expect(doc.data()!['taxable'], true);
    });

    test('deleteIncomeSource removes document', () async {
      final id = await repo.createIncomeSource(
        userId: 'user-1',
        name: 'Temp',
        category: 'other',
        amount: 100,
        frequency: 'once',
        isRecurring: false,
        taxable: false,
      );

      await repo.deleteIncomeSource(id);

      final doc = await firestore.collection('income_sources_personal').doc(id).get();
      expect(doc.exists, isFalse);
    });

    test('watchIncomeSources streams user sources', () async {
      await repo.createIncomeSource(
        userId: 'user-1', name: 'A', category: 'salary',
        amount: 1000, frequency: 'monthly', isRecurring: true, taxable: true,
      );
      await repo.createIncomeSource(
        userId: 'user-1', name: 'B', category: 'freelance',
        amount: 2000, frequency: 'monthly', isRecurring: true, taxable: true,
      );
      await repo.createIncomeSource(
        userId: 'user-2', name: 'C', category: 'salary',
        amount: 3000, frequency: 'monthly', isRecurring: true, taxable: true,
      );

      final sources = await repo.watchIncomeSources('user-1').first;
      expect(sources.length, 2);
      expect(sources.every((s) => s.userId == 'user-1'), isTrue);
    });
  });
}
