import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:penny_mobile/data/services/biometric_service.dart';

/// Provides a singleton BiometricService instance.
final biometricServiceProvider = Provider<BiometricService>((ref) {
  return BiometricService();
});

/// Whether biometric authentication is available on this device.
final biometricAvailableProvider = FutureProvider<bool>((ref) async {
  final service = ref.watch(biometricServiceProvider);
  return service.isAvailable();
});

/// Hive box name for biometric preferences.
const _biometricBoxName = 'biometric_prefs';

/// Key used to store whether the user has previously logged in successfully.
const _hasLoggedInKey = 'has_logged_in';

/// Whether the user has previously logged in (so biometric login can be offered).
final hasLoggedInBeforeProvider = FutureProvider<bool>((ref) async {
  final box = await Hive.openBox<bool>(_biometricBoxName);
  return box.get(_hasLoggedInKey, defaultValue: false) ?? false;
});

/// Marks that the user has logged in at least once.
/// Call this after a successful email/password sign-in.
Future<void> markUserLoggedIn() async {
  final box = await Hive.openBox<bool>(_biometricBoxName);
  await box.put(_hasLoggedInKey, true);
}

/// Clears the logged-in flag (e.g. on sign-out or account deletion).
Future<void> clearUserLoggedIn() async {
  final box = await Hive.openBox<bool>(_biometricBoxName);
  await box.delete(_hasLoggedInKey);
}
