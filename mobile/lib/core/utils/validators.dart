/// Form validation utilities.
abstract final class Validators {
  static String? required(String? value, [String fieldName = 'This field']) {
    if (value == null || value.trim().isEmpty) {
      return '$fieldName is required';
    }
    return null;
  }

  static String? email(String? value) {
    if (value == null || value.trim().isEmpty) return 'Email is required';
    if (!value.contains('@') || !value.contains('.')) return 'Invalid email';
    return null;
  }

  static String? password(String? value, {int minLength = 6}) {
    if (value == null || value.isEmpty) return 'Password is required';
    if (value.length < minLength) return 'At least $minLength characters';
    return null;
  }

  static String? positiveNumber(String? value, [String fieldName = 'Amount']) {
    if (value == null || value.trim().isEmpty) return '$fieldName is required';
    final number = double.tryParse(value.trim());
    if (number == null) return 'Enter a valid number';
    if (number <= 0) return '$fieldName must be greater than 0';
    return null;
  }

  static String? nonNegativeNumber(String? value, [String fieldName = 'Amount']) {
    if (value == null || value.trim().isEmpty) return null; // optional
    final number = double.tryParse(value.trim());
    if (number == null) return 'Enter a valid number';
    if (number < 0) return '$fieldName cannot be negative';
    return null;
  }
}
