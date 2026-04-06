import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:penny_mobile/presentation/providers/theme_provider.dart';

void main() {
  group('ThemeModeNotifier', () {
    late Box box;

    setUpAll(() async {
      // Initialize Hive for testing with an in-memory backend.
      Hive.init('/tmp/hive_test_theme_${DateTime.now().millisecondsSinceEpoch}');
      box = await Hive.openBox('app_preferences');
    });

    setUp(() async {
      await box.clear();
    });

    tearDownAll(() async {
      await box.close();
      await Hive.close();
    });

    test('defaults to system when no theme_mode is stored', () {
      final notifier = ThemeModeNotifier();
      expect(notifier.state, ThemeMode.system);
    });

    test('loads light theme from Hive', () async {
      await box.put('theme_mode', 'light');
      final notifier = ThemeModeNotifier();
      expect(notifier.state, ThemeMode.light);
    });

    test('loads dark theme from Hive', () async {
      await box.put('theme_mode', 'dark');
      final notifier = ThemeModeNotifier();
      expect(notifier.state, ThemeMode.dark);
    });

    test('loads system theme from Hive', () async {
      await box.put('theme_mode', 'system');
      final notifier = ThemeModeNotifier();
      expect(notifier.state, ThemeMode.system);
    });

    test('treats unknown string as system theme', () async {
      await box.put('theme_mode', 'unknown_value');
      final notifier = ThemeModeNotifier();
      expect(notifier.state, ThemeMode.system);
    });

    test('setThemeMode to dark updates state and Hive', () async {
      final notifier = ThemeModeNotifier();
      expect(notifier.state, ThemeMode.system);

      await notifier.setThemeMode(ThemeMode.dark);

      expect(notifier.state, ThemeMode.dark);
      expect(box.get('theme_mode'), 'dark');
    });

    test('setThemeMode to light updates state and Hive', () async {
      final notifier = ThemeModeNotifier();

      await notifier.setThemeMode(ThemeMode.light);

      expect(notifier.state, ThemeMode.light);
      expect(box.get('theme_mode'), 'light');
    });

    test('setThemeMode to system updates state and Hive', () async {
      final notifier = ThemeModeNotifier();
      await notifier.setThemeMode(ThemeMode.dark);

      await notifier.setThemeMode(ThemeMode.system);

      expect(notifier.state, ThemeMode.system);
      expect(box.get('theme_mode'), 'system');
    });

    test('multiple theme changes persist the last value', () async {
      final notifier = ThemeModeNotifier();

      await notifier.setThemeMode(ThemeMode.dark);
      await notifier.setThemeMode(ThemeMode.light);
      await notifier.setThemeMode(ThemeMode.dark);

      expect(notifier.state, ThemeMode.dark);
      expect(box.get('theme_mode'), 'dark');
    });

    test('new notifier reads persisted value from Hive', () async {
      final first = ThemeModeNotifier();
      await first.setThemeMode(ThemeMode.dark);

      // Create a second notifier — should read from Hive
      final second = ThemeModeNotifier();
      expect(second.state, ThemeMode.dark);
    });
  });
}
