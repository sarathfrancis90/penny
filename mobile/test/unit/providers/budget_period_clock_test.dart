import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/data/models/budget_model.dart';
import 'package:penny_mobile/presentation/providers/budget_providers.dart';

void main() {
  // testWidgets runs in a fake-async zone, so pump() advances the timer.
  testWidgets('the default budget period follows a month change while the '
      'app stays open', (tester) async {
    var now = DateTime(2026, 10, 31, 23, 59);
    final container = ProviderContainer(
      overrides: [budgetClockProvider.overrideWithValue(() => now)],
    );
    final sub = container.listen(budgetPeriodProvider, (_, _) {});

    expect(sub.read(), const BudgetPeriod(month: 10, year: 2026));

    now = DateTime(2026, 11, 1, 0, 1);
    await tester.pump(const Duration(minutes: 2));
    expect(sub.read(), const BudgetPeriod(month: 11, year: 2026));
    // Dispose inside the test: the provider's timer must be gone before the
    // test binding checks for pending timers.
    container.dispose();
  });

  testWidgets('an explicitly selected period is not replaced', (tester) async {
    var now = DateTime(2026, 10, 31, 23, 59);
    final container = ProviderContainer(
      overrides: [budgetClockProvider.overrideWithValue(() => now)],
    );
    final sub = container.listen(budgetPeriodProvider, (_, _) {});

    container.read(budgetPeriodProvider.notifier).state = const BudgetPeriod(
      month: 3,
      year: 2026,
    );
    now = DateTime(2026, 11, 1, 0, 1);
    await tester.pump(const Duration(minutes: 2));
    expect(sub.read(), const BudgetPeriod(month: 3, year: 2026));
    container.dispose();
  });
}
