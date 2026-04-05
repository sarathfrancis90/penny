import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:penny_mobile/app.dart';
import 'package:penny_mobile/firebase_options.dart';

void main() async {
  // Run in a guarded zone to catch ALL uncaught async errors
  runZonedGuarded<Future<void>>(() async {
    WidgetsFlutterBinding.ensureInitialized();

    // Initialize Hive first (needed by router for onboarding check)
    await Hive.initFlutter();
    await Hive.openBox('app_preferences');

    // Initialize Firebase
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );

    // Crashlytics: capture Flutter framework errors
    if (!kDebugMode) {
      FlutterError.onError = (details) {
        FirebaseCrashlytics.instance.recordFlutterFatalError(details);
      };
    }

    runApp(const ProviderScope(child: PennyApp()));
  }, (error, stack) {
    // Crashlytics: capture async errors (outside Flutter framework)
    if (!kDebugMode) {
      FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    }
  });
}
