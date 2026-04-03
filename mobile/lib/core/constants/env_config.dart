/// Environment configuration.
///
/// Usage:
///   flutter run --dart-define=ENV=dev
///   flutter run --dart-define=ENV=staging
///   flutter run --dart-define=ENV=prod  (default)
///   flutter build ios --dart-define=ENV=prod
abstract final class EnvConfig {
  static const _env = String.fromEnvironment('ENV', defaultValue: 'prod');

  static String get environment => _env;

  static String get apiBaseUrl => switch (_env) {
        'dev' => 'http://localhost:3000',
        'staging' => 'https://penny-staging.vercel.app',
        _ => 'https://penny-amber.vercel.app',
      };

  static bool get isDev => _env == 'dev';
  static bool get isStaging => _env == 'staging';
  static bool get isProd => _env == 'prod' || _env.isEmpty;
}
