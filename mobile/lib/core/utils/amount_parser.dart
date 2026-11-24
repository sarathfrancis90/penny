/// Parses a money amount the way people type it: "1,234.50", "$45", "12,50".
///
/// - `$` and spaces are ignored.
/// - A single comma followed by one or two digits at the end is a decimal
///   separator ("12,50" → 12.5); any other comma is a thousands separator.
///
/// Returns `null` unless the result is a finite number greater than zero.
double? parseAmount(String input) {
  var text = input.replaceAll(RegExp(r'[\s $]'), '');
  if (text.isEmpty) return null;

  final commaIsDecimal =
      ','.allMatches(text).length == 1 && RegExp(r',\d{1,2}$').hasMatch(text);
  if (commaIsDecimal) {
    text = text.replaceAll('.', '').replaceFirst(',', '.');
  } else {
    text = text.replaceAll(',', '');
  }

  if (!RegExp(r'^(\d+\.?\d*|\.\d+)$').hasMatch(text)) return null;
  final value = double.tryParse(text);
  if (value == null || !value.isFinite || value <= 0) return null;
  return value;
}
