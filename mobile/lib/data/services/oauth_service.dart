import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

class OAuthService {
  OAuthService({FirebaseAuth? auth}) : _auth = auth ?? FirebaseAuth.instance;

  final FirebaseAuth _auth;

  // ====== Google Sign-In ======

  Future<UserCredential> signInWithGoogle() async {
    try {
      await GoogleSignIn.instance.initialize();
      final googleUser = await GoogleSignIn.instance.authenticate(
        scopeHint: ['email'],
      );

      final idToken = googleUser.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        // This happens when iOS uses a passkey instead of the OAuth flow.
        // The passkey authenticates the user locally but doesn't produce
        // an OAuth ID token that Firebase can verify.
        throw Exception(
          'Google Sign-In did not return an ID token. '
          'If you were prompted to use a passkey, please try again '
          'and choose "Use password" instead.',
        );
      }

      final credential = GoogleAuthProvider.credential(idToken: idToken);
      return _auth.signInWithCredential(credential);
    } on PlatformException catch (e) {
      // Handle platform-specific errors gracefully
      if (e.code == 'sign_in_failed') {
        throw Exception(
          'Google Sign-In failed. If prompted for a passkey, '
          'try choosing "Use password" instead.',
        );
      }
      rethrow;
    } catch (e) {
      // Catch any other errors (null pointer, type cast, etc.)
      if (e is TypeError || e.toString().contains('Null')) {
        throw Exception(
          'Google Sign-In returned incomplete data. '
          'Please try again using your Google password.',
        );
      }
      rethrow;
    }
  }

  // ====== Apple Sign-In ======

  Future<UserCredential> signInWithApple() async {
    // Generate nonce for security
    final rawNonce = _generateNonce();
    final nonce = _sha256ofString(rawNonce);

    final appleCredential = await SignInWithApple.getAppleIDCredential(
      scopes: [
        AppleIDAuthorizationScopes.email,
        AppleIDAuthorizationScopes.fullName,
      ],
      nonce: nonce,
    );

    final idToken = appleCredential.identityToken;
    if (idToken == null || idToken.isEmpty) {
      throw Exception(
        'Apple Sign-In did not return an identity token. '
        'Please try again.',
      );
    }

    final oauthCredential = OAuthProvider('apple.com').credential(
      idToken: idToken,
      rawNonce: rawNonce,
      accessToken: appleCredential.authorizationCode,
    );

    final userCredential = await _auth.signInWithCredential(oauthCredential);

    // Apple only provides name on first sign-in — save it
    if (appleCredential.givenName != null) {
      final displayName =
          '${appleCredential.givenName ?? ''} ${appleCredential.familyName ?? ''}'
              .trim();
      if (displayName.isNotEmpty) {
        await userCredential.user?.updateDisplayName(displayName);
      }
    }

    return userCredential;
  }

  // ====== Check availability ======

  Future<bool> isAppleSignInAvailable() async {
    return await SignInWithApple.isAvailable();
  }

  // ====== Helpers ======

  String _generateNonce([int length = 32]) {
    const charset =
        '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
    final random = Random.secure();
    return List.generate(length, (_) => charset[random.nextInt(charset.length)])
        .join();
  }

  String _sha256ofString(String input) {
    final bytes = utf8.encode(input);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }
}
