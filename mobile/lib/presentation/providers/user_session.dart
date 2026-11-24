import 'package:flutter/painting.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';

/// The signed-in user's id, `null` when signed out. Unlike
/// [currentUserProvider] it only changes when a different user (or nobody)
/// is signed in.
final currentUserIdProvider = Provider<String?>((ref) {
  return ref.watch(currentUserProvider)?.uid;
});

/// Whose data the app is showing: the signed-in user's id, a fixed id in
/// guest mode, or `null` when nobody is signed in.
final sessionOwnerProvider = Provider<String?>((ref) {
  final uid = ref.watch(currentUserIdProvider);
  if (uid != null) return uid;
  return ref.watch(guestModeProvider) ? _guestOwner : null;
});

const _guestOwner = '\u0000guest';

/// Call first in every `autoDispose` provider that holds one user's data.
///
/// While the same user stays signed in, the data stays cached even when no
/// screen shows it (like a provider that is never disposed). As soon as a
/// different user — or nobody — is signed in, the cache is released, so the
/// provider is thrown away once no screen shows it and the next user starts
/// from "loading" instead of seeing the previous user's data. (Riverpod keeps
/// the previous value while an async provider reloads, so rebuilding the
/// provider for the new user would not be enough.)
///
/// Returns the current [sessionOwnerProvider] value; the provider rebuilds
/// when it changes.
String? keepForCurrentSession(Ref ref) {
  final owner = ref.watch(sessionOwnerProvider);
  if (owner == null) return null;
  final link = ref.keepAlive();
  ref.listen<String?>(sessionOwnerProvider, (_, next) {
    if (next != owner) link.close();
  });
  return owner;
}

/// Empties the in-memory image cache (avatars, receipt photos) so nothing
/// decoded for one user stays in memory for the next. Overridden in tests.
final clearImageCacheProvider = Provider<void Function()>((ref) {
  return () {
    try {
      final cache = PaintingBinding.instance.imageCache;
      cache.clear();
      cache.clearLiveImages();
    } catch (_) {
      // No Flutter binding (plain Dart tests): nothing is cached.
    }
  };
});
