import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/utils/validators.dart';

void main() {
  group('Validators', () {
    group('required', () {
      test('returns error for null', () {
        expect(Validators.required(null), isNotNull);
      });

      test('returns error for empty string', () {
        expect(Validators.required(''), isNotNull);
      });

      test('returns error for whitespace only', () {
        expect(Validators.required('   '), isNotNull);
      });

      test('returns null for valid input', () {
        expect(Validators.required('hello'), isNull);
      });

      test('uses custom field name', () {
        expect(Validators.required('', 'Name'), 'Name is required');
      });
    });

    group('email', () {
      test('returns error for empty', () {
        expect(Validators.email(''), isNotNull);
      });

      test('returns error for no @', () {
        expect(Validators.email('test'), isNotNull);
      });

      test('returns error for no dot', () {
        expect(Validators.email('test@test'), isNotNull);
      });

      test('returns null for valid email', () {
        expect(Validators.email('test@penny.app'), isNull);
      });
    });

    group('password', () {
      test('returns error for empty', () {
        expect(Validators.password(''), isNotNull);
      });

      test('returns error for too short', () {
        expect(Validators.password('abc'), isNotNull);
      });

      test('returns null for valid password', () {
        expect(Validators.password('test1234'), isNull);
      });

      test('respects custom min length', () {
        expect(Validators.password('abc', minLength: 3), isNull);
        expect(Validators.password('ab', minLength: 3), isNotNull);
      });
    });

    group('positiveNumber', () {
      test('returns error for empty', () {
        expect(Validators.positiveNumber(''), isNotNull);
      });

      test('returns error for non-number', () {
        expect(Validators.positiveNumber('abc'), isNotNull);
      });

      test('returns error for zero', () {
        expect(Validators.positiveNumber('0'), isNotNull);
      });

      test('returns error for negative', () {
        expect(Validators.positiveNumber('-5'), isNotNull);
      });

      test('returns null for positive number', () {
        expect(Validators.positiveNumber('14.50'), isNull);
      });

      test('returns null for integer', () {
        expect(Validators.positiveNumber('100'), isNull);
      });
    });

    group('nonNegativeNumber', () {
      test('returns null for empty (optional)', () {
        expect(Validators.nonNegativeNumber(''), isNull);
      });

      test('returns error for negative', () {
        expect(Validators.nonNegativeNumber('-1'), isNotNull);
      });

      test('returns null for zero', () {
        expect(Validators.nonNegativeNumber('0'), isNull);
      });

      test('returns null for positive', () {
        expect(Validators.nonNegativeNumber('50'), isNull);
      });
    });
  });
}
