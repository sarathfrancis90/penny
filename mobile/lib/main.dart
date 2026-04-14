import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:penny_mobile/app.dart';
import 'package:penny_mobile/firebase_options.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
}

void main() async {
  // Run in a guarded zone to catch ALL uncaught async errors
  runZonedGuarded<Future<void>>(() async {
    debugPrint('[PENNY] main() starting...');
    WidgetsFlutterBinding.ensureInitialized();
    debugPrint('[PENNY] WidgetsBinding initialized');

    // Initialize Hive first (needed by router for onboarding check)
    await Hive.initFlutter();
    await Hive.openBox('app_preferences');
    debugPrint('[PENNY] Hive initialized');

    // Initialize Firebase
    // On Android, google-services.json handles config natively
    if (defaultTargetPlatform == TargetPlatform.android) {
      await Firebase.initializeApp();
    } else {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
    }
    debugPrint('[PENNY] Firebase initialized');

    // Register FCM background message handler
    FirebaseMessaging.onBackgroundMessage(
        _firebaseMessagingBackgroundHandler);

    // Crashlytics: capture Flutter framework errors
    if (!kDebugMode) {
      FlutterError.onError = (details) {
        FirebaseCrashlytics.instance.recordFlutterFatalError(details);
      };
    }

    debugPrint('[PENNY] About to runApp...');
    runApp(const ProviderScope(child: PennyApp()));
    debugPrint('[PENNY] runApp called');
  }, (error, stack) {
    // Crashlytics: capture async errors (outside Flutter framework)
    if (!kDebugMode) {
      FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    }
  });
}
