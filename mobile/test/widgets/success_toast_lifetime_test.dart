import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/presentation/widgets/success_overlay.dart';

void main() {
  Future<BuildContext> pumpHome(WidgetTester tester) async {
    late BuildContext home;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            home = context;
            return const Scaffold(body: Text('home'));
          },
        ),
      ),
    );
    return home;
  }

  testWidgets(
    'the saved confirmation goes away on time even while a page covers it',
    (tester) async {
      final home = await pumpHome(tester);
      SuccessOverlay.show(home, title: 'Balzacs Roastery', subtitle: r'$3.25');
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Balzacs Roastery'), findsOneWidget);

      // Open a full-screen page right after saving, as the app does.
      Navigator.of(home).push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('details')),
        ),
      );
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 3));

      Navigator.of(home).pop();
      await tester.pumpAndSettle();
      await tester.pump(const Duration(milliseconds: 300));
      expect(
        find.text('Balzacs Roastery', skipOffstage: false),
        findsNothing,
        reason: 'a stale confirmation must not come back later',
      );
    },
  );

  testWidgets('dismissAll removes a confirmation that is still showing', (
    tester,
  ) async {
    final home = await pumpHome(tester);
    SuccessOverlay.show(home, title: 'Balzacs Roastery', subtitle: r'$3.25');
    await tester.pump(const Duration(milliseconds: 100));
    SuccessOverlay.dismissAll();
    await tester.pump();
    expect(find.text('Balzacs Roastery', skipOffstage: false), findsNothing);
  });
}
