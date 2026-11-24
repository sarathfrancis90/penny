import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/core/theme/app_theme.dart';

void main() {
  testWidgets('dark date range dialog has a visible surface and accepts '
      'typed mm/dd/yyyy', (tester) async {
    DateTimeRange? picked;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              picked = await showDateRangePicker(
                context: context,
                keyboardType: TextInputType.text,
                initialEntryMode: DatePickerEntryMode.input,
                firstDate: DateTime(2020),
                lastDate: DateTime(2026, 11, 21),
              );
            },
            child: const Text('open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    final dialog = tester.widget<Dialog>(find.byType(Dialog));
    final dialogColor =
        dialog.backgroundColor ??
        DatePickerTheme.of(tester.element(find.byType(Dialog))).backgroundColor;
    expect(dialogColor, AppColors.darkSurface);

    final fields = find.byType(TextField);
    expect(
      tester.widget<TextField>(fields.first).keyboardType,
      TextInputType.text,
    );
    await tester.enterText(fields.at(0), '01/01/2025');
    await tester.enterText(fields.at(1), '11/21/2026');
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    expect(picked?.start, DateTime(2025, 1, 1));
    expect(picked?.end, DateTime(2026, 11, 21));
  });

  test('dark popup menus are not the same black as the page', () {
    expect(AppTheme.dark.popupMenuTheme.color, isNot(AppColors.darkBackground));
    expect(AppTheme.dark.popupMenuTheme.color, isNotNull);
  });
}
