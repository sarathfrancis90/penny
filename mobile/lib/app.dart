import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/core/router/app_router.dart';
import 'package:penny_mobile/core/theme/app_theme.dart';

class PennyApp extends ConsumerWidget {
  const PennyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'Penny',
      theme: AppTheme.light,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
      builder: (context, child) {
        // Global error boundary — catches widget errors and shows
        // a user-friendly message instead of red error screen
        ErrorWidget.builder = (FlutterErrorDetails details) {
          return Scaffold(
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, size: 48,
                        color: Color(0xFFFF3B30)),
                    const SizedBox(height: 12),
                    const Text('Something went wrong',
                        style: TextStyle(fontSize: 18,
                            fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    Text(
                      details.exception.toString().length > 200
                          ? '${details.exception.toString().substring(0, 200)}...'
                          : details.exception.toString(),
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 13,
                          color: Color(0xFF8E8E93)),
                    ),
                  ],
                ),
              ),
            ),
          );
        };
        return child ?? const SizedBox.shrink();
      },
    );
  }
}
