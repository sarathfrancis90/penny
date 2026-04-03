import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/income_model.dart';

void main() {
  group('IncomeSourceModel', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    test('fromFirestore parses all fields', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('income_sources_personal').add({
        'userId': 'user-1',
        'name': 'Software Consulting',
        'category': 'salary',
        'amount': 6000,
        'frequency': 'monthly',
        'isRecurring': true,
        'isActive': true,
        'taxable': true,
        'currency': 'CAD',
        'startDate': now,
        'createdAt': now,
        'updatedAt': now,
        'recurringDate': 15,
        'description': 'Main income',
      });

      final snapshot = await doc.get();
      final model = IncomeSourceModel.fromFirestore(snapshot);

      expect(model.name, 'Software Consulting');
      expect(model.category, 'salary');
      expect(model.amount, 6000.0);
      expect(model.frequency, 'monthly');
      expect(model.isRecurring, true);
      expect(model.isActive, true);
      expect(model.taxable, true);
      expect(model.currency, 'CAD');
      expect(model.recurringDate, 15);
      expect(model.description, 'Main income');
    });

    test('fromFirestore handles missing optional fields', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('income_sources_personal').add({
        'userId': 'user-1',
        'name': 'Bonus',
        'category': 'bonus',
        'amount': 1000,
        'frequency': 'once',
        'isRecurring': false,
        'isActive': true,
        'taxable': false,
        'currency': 'CAD',
        'startDate': now,
        'createdAt': now,
        'updatedAt': now,
      });

      final snapshot = await doc.get();
      final model = IncomeSourceModel.fromFirestore(snapshot);

      expect(model.recurringDate, isNull);
      expect(model.endDate, isNull);
      expect(model.description, isNull);
      expect(model.netAmount, isNull);
    });

    test('frequencyLabel returns correct strings', () async {
      final now = Timestamp.now();
      final base = {
        'userId': 'u', 'name': 'X', 'category': 'salary',
        'amount': 100, 'isRecurring': true, 'isActive': true,
        'taxable': true, 'currency': 'CAD', 'startDate': now,
        'createdAt': now, 'updatedAt': now,
      };

      Future<IncomeSourceModel> create(String freq) async {
        final doc = await firestore.collection('income_sources_personal')
            .add({...base, 'frequency': freq});
        return IncomeSourceModel.fromFirestore(await doc.get());
      }

      expect((await create('monthly')).frequencyLabel, '/mo');
      expect((await create('biweekly')).frequencyLabel, '/2wk');
      expect((await create('weekly')).frequencyLabel, '/wk');
      expect((await create('yearly')).frequencyLabel, '/yr');
      expect((await create('once')).frequencyLabel, 'one-time');
    });

    test('toFirestore produces correct map', () async {
      final now = Timestamp.now();
      final model = IncomeSourceModel(
        id: 'test', userId: 'user-1', name: 'Freelance',
        category: 'freelance', amount: 2000, frequency: 'monthly',
        isRecurring: true, isActive: true, taxable: true,
        currency: 'CAD', startDate: now, createdAt: now, updatedAt: now,
      );

      final map = model.toFirestore();
      expect(map['name'], 'Freelance');
      expect(map['amount'], 2000);
      expect(map['frequency'], 'monthly');
      expect(map.containsKey('id'), isFalse);
      expect(map.containsKey('recurringDate'), isFalse); // null excluded
    });

    test('amount handles int from Firestore', () async {
      final now = Timestamp.now();
      final doc = await firestore.collection('income_sources_personal').add({
        'userId': 'u', 'name': 'X', 'category': 'salary',
        'amount': 5000, // int not double
        'frequency': 'monthly', 'isRecurring': true, 'isActive': true,
        'taxable': true, 'currency': 'CAD', 'startDate': now,
        'createdAt': now, 'updatedAt': now,
      });

      final model = IncomeSourceModel.fromFirestore(await doc.get());
      expect(model.amount, 5000.0);
      expect(model.amount, isA<double>());
    });
  });
}
