import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/data/services/auth_service.dart';
import 'package:penny_mobile/data/services/oauth_service.dart';

final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService();
});

final oauthServiceProvider = Provider<OAuthService>((ref) {
  return OAuthService();
});

final authStateProvider = StreamProvider<User?>((ref) {
  return ref.watch(authServiceProvider).authStateChanges;
});

final currentUserProvider = Provider<User?>((ref) {
  return ref.watch(authStateProvider).value;
});
