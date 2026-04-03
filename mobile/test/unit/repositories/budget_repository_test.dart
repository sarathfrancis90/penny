import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/budget_model.dart';
import 'package:penny_mobile/data/models/expense_model.dart';
import 'package:penny_mobile/data/repositories/budget_repository.dart';

void main() {
  group('BudgetRepository', () {
    late FakeFirebaseFirestore firestore;
    late BudgetRepository repo;

    setUp(() {
      firestore = FakeFirebaseFirestore();
      repo = BudgetRepository(firestore: firestore);
    });

    test('createBudget stores all fields', () async {
      final period = const BudgetPeriod(month: 4, year: 2026);
      final id = await repo.createBudget(
        userId: 'user-1',
        category: 'Meals and entertainment',
        monthlyLimit: 300,
        period: period,
      );

      final doc = await firestore.collection('budgets_personal').doc(id).get();
      expect(doc.exists, isTrue);
      expect(doc.data()!['category'], 'Meals and entertainment');
      expect(doc.data()!['monthlyLimit'], 300);
      expect(doc.data()!['period']['month'], 4);
    });

    test('updateBudget modifies fields', () async {
      final id = await repo.createBudget(
        userId: 'user-1',
        category: 'Office expenses',
        monthlyLimit: 200,
        period: const BudgetPeriod(month: 4, year: 2026),
      );

      await repo.updateBudget(id, {'monthlyLimit': 350});

      final doc = await firestore.collection('budgets_personal').doc(id).get();
      expect(doc.data()!['monthlyLimit'], 350);
    });

    test('deleteBudget removes document', () async {
      final id = await repo.createBudget(
        userId: 'user-1',
        category: 'Telephone',
        monthlyLimit: 100,
        period: const BudgetPeriod(month: 4, year: 2026),
      );

      await repo.deleteBudget(id);

      final doc = await firestore.collection('budgets_personal').doc(id).get();
      expect(doc.exists, isFalse);
    });

    test('calculateUsage computes correct amounts and status', () {
      final now = Timestamp.now();

      final budgets = [
        BudgetModel(
          id: 'b1', userId: 'user-1',
          category: 'Meals and entertainment', monthlyLimit: 300,
          period: const BudgetPeriod(month: 4, year: 2026),
          settings: const BudgetSettings(),
          createdAt: now, updatedAt: now,
        ),
        BudgetModel(
          id: 'b2', userId: 'user-1',
          category: 'Office expenses', monthlyLimit: 200,
          period: const BudgetPeriod(month: 4, year: 2026),
          settings: const BudgetSettings(),
          createdAt: now, updatedAt: now,
        ),
      ];

      final expenses = [
        ExpenseModel(id: 'e1', userId: 'user-1', vendor: 'Tim Hortons',
            amount: 247, category: 'Meals and entertainment',
            date: now, expenseType: 'personal', createdAt: now, updatedAt: now),
        ExpenseModel(id: 'e2', userId: 'user-1', vendor: 'Staples',
            amount: 120, category: 'Office expenses',
            date: now, expenseType: 'personal', createdAt: now, updatedAt: now),
      ];

      final usage = repo.calculateUsage(budgets, expenses);

      expect(usage.length, 2);

      // Sorted by percentage descending — Meals is 82.3%
      final meals = usage.firstWhere((u) => u.category == 'Meals and entertainment');
      expect(meals.totalSpent, 247);
      expect(meals.budgetLimit, 300);
      expect(meals.status, BudgetStatus.warning); // 82.3%

      final office = usage.firstWhere((u) => u.category == 'Office expenses');
      expect(office.totalSpent, 120);
      expect(office.status, BudgetStatus.safe); // 60%
    });

    test('calculateUsage handles zero-limit budget', () {
      final now = Timestamp.now();
      final budgets = [
        BudgetModel(
          id: 'b1', userId: 'user-1',
          category: 'Test', monthlyLimit: 0,
          period: const BudgetPeriod(month: 4, year: 2026),
          settings: const BudgetSettings(),
          createdAt: now, updatedAt: now,
        ),
      ];

      final usage = repo.calculateUsage(budgets, []);
      expect(usage.first.percentageUsed, 0.0);
      expect(usage.first.status, BudgetStatus.safe);
    });
  });
}
