/// Keeps a date picker's `initialDate` inside `[first, last]` (by calendar
/// day). `showDatePicker` asserts on an out-of-range initial date, which an
/// AI-read receipt date (before 2020, or in the future) can otherwise trigger.
DateTime clampPickerDate(DateTime date, DateTime first, DateTime last) {
  final day = DateTime(date.year, date.month, date.day);
  final firstDay = DateTime(first.year, first.month, first.day);
  final lastDay = DateTime(last.year, last.month, last.day);
  if (day.isBefore(firstDay)) return firstDay;
  if (day.isAfter(lastDay)) return lastDay;
  return date;
}
