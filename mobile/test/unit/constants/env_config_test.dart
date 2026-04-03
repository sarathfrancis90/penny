import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/core/constants/env_config.dart';

void main() {
  group('EnvConfig', () {
    // Note: These tests run with default ENV (prod) since we can't
    // set --dart-define in unit tests.

    test('default environment is prod', () {
      // When no ENV is set, defaults to 'prod'
      expect(EnvConfig.apiBaseUrl, 'https://penny-amber.vercel.app');
    });

    test('isProd returns true by default', () {
      expect(EnvConfig.isProd, isTrue);
    });
  });
}
