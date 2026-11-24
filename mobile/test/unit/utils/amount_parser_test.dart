import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/utils/amount_parser.dart';

void main() {
  group('parseAmount', () {
    test('plain numbers', () {
      expect(parseAmount('45'), 45);
      expect(parseAmount(' 14.50 '), 14.5);
      expect(parseAmount('.5'), 0.5);
    });

    test('strips a dollar sign and spaces', () {
      expect(parseAmount(r'$45'), 45);
      expect(parseAmount(r'$ 1 234.50'), 1234.5);
    });

    test('strips thousands separators', () {
      expect(parseAmount('1,234.50'), 1234.5);
      expect(parseAmount('1,234,567.89'), 1234567.89);
      expect(parseAmount('1,234'), 1234);
    });

    test('a single comma followed by 1-2 digits is the decimal point', () {
      expect(parseAmount('12,50'), 12.5);
      expect(parseAmount('12,5'), 12.5);
      expect(parseAmount('1.234,50'), 1234.5);
      expect(parseAmount('1 234,50'), 1234.5);
    });

    test('rejects anything that is not a finite amount above zero', () {
      expect(parseAmount(''), isNull);
      expect(parseAmount('   '), isNull);
      expect(parseAmount('abc'), isNull);
      expect(parseAmount('0'), isNull);
      expect(parseAmount('0.00'), isNull);
      expect(parseAmount('-5'), isNull);
      expect(parseAmount('1e5'), isNull);
      expect(parseAmount('Infinity'), isNull);
      expect(parseAmount('NaN'), isNull);
      expect(parseAmount('1.2.3'), isNull);
      expect(parseAmount('9' * 400), isNull);
    });
  });
}
