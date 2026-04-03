import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/constants/categories.dart';

void main() {
  group('CRA T2125 Categories', () {
    test('has correct total count (38 categories)', () {
      expect(expenseCategories.length, 38);
    });

    test('general business has 19 categories', () {
      expect(categoryGroups['General Business Expenses']!.length, 19);
    });

    test('home office has 9 categories', () {
      expect(categoryGroups['Home Office Expenses']!.length, 9);
    });

    test('vehicle has 10 categories', () {
      expect(categoryGroups['Automobile/Vehicle Expenses']!.length, 10);
    });

    test('all categories belong to a group', () {
      for (final category in expenseCategories) {
        expect(getCategoryGroup(category), isNotNull,
            reason: 'Category "$category" has no group');
      }
    });

    test('category strings match web app exactly', () {
      // Spot check critical categories that AI analysis depends on
      expect(expenseCategories.contains('Meals and entertainment'), isTrue);
      expect(expenseCategories.contains('Office expenses'), isTrue);
      expect(expenseCategories.contains('Vehicle - Fuel (gasoline, propane, oil)'), isTrue);
      expect(expenseCategories.contains('Home Office - Monitoring and internet'), isTrue);
      expect(expenseCategories.contains('Advertising (Promotion, gift cards etc.)'), isTrue);
    });
  });
}
