import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

/// Whether the user is browsing as a guest (without an account).
/// Persisted in Hive so guest mode survives app restarts.
final guestModeProvider = StateProvider<bool>((ref) {
  return Hive.box('app_preferences').get('guest_mode', defaultValue: false) as bool;
});

/// Set guest mode state and persist to Hive.
/// Works with both Ref (providers/router) and WidgetRef (widgets).
void setGuestMode(dynamic ref, bool value) {
  ref.read(guestModeProvider.notifier).state = value;
  Hive.box('app_preferences').put('guest_mode', value);
}
