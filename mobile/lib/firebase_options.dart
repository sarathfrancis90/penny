import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyD_ReaEZIZ_r07LjNB1QN0GuAjipDD5ddc',
    appId: '1:537615138155:ios:ea2d69ff2d159f231be02e',
    messagingSenderId: '537615138155',
    projectId: 'penny-f4acd',
    storageBucket: 'penny-f4acd.firebasestorage.app',
    iosClientId: '537615138155-2jvto0f3lj0gj8kn2tuv64fpshqhulet.apps.googleusercontent.com',
    iosBundleId: 'com.penny.pennyMobile',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyBvcpvU5xsP_YMu7OXYcNc3SG-ETojD_gM',
    appId: '1:537615138155:android:5a7a4f45ada530851be02e',
    messagingSenderId: '537615138155',
    projectId: 'penny-f4acd',
    storageBucket: 'penny-f4acd.firebasestorage.app',
  );

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyBvcpvU5xsP_YMu7OXYcNc3SG-ETojD_gM',
    appId: '1:537615138155:web:46df3ea6489f75851be02e',
    messagingSenderId: '537615138155',
    projectId: 'penny-f4acd',
    storageBucket: 'penny-f4acd.firebasestorage.app',
    authDomain: 'penny-f4acd.firebaseapp.com',
    measurementId: 'G-E3BH8P3FQB',
  );
}
