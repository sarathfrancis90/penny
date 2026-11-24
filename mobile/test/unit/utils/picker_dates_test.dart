import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/utils/picker_dates.dart';

void main() {
  final first = DateTime(2020);
  final last = DateTime(2026, 11, 22, 15, 30);

  test('keeps a date that is inside the range', () {
    expect(
      clampPickerDate(DateTime(2026, 11, 9), first, last),
      DateTime(2026, 11, 9),
    );
  });

  test('moves a date before the range to the first day', () {
    expect(clampPickerDate(DateTime(2019, 3, 4), first, last), first);
  });

  test('moves a future date to the last day', () {
    expect(
      clampPickerDate(DateTime(2031, 1, 1), first, last),
      DateTime(2026, 11, 22),
    );
  });

  test('today later in the day than lastDate is still in range', () {
    expect(
      clampPickerDate(DateTime(2026, 11, 22, 23, 59), first, last),
      DateTime(2026, 11, 22, 23, 59),
    );
  });
}
