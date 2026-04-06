import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/core/router/app_router.dart';
import 'package:penny_mobile/core/theme/app_theme.dart';
import 'package:penny_mobile/presentation/providers/theme_provider.dart';

class PennyApp extends ConsumerWidget {
  const PennyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp.router(
      title: 'Penny',
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,
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
                    Icon(Icons.error_outline, size: 48,
                        color: Theme.of(context).colorScheme.error),
                    const SizedBox(height: 12),
                    Text('Something went wrong',
                        style: TextStyle(fontSize: 18,
                            fontWeight: FontWeight.w600,
                            color: Theme.of(context).colorScheme.onSurface)),
                    const SizedBox(height: 8),
                    Text(
                      details.exception.toString().length > 200
                          ? '${details.exception.toString().substring(0, 200)}...'
                          : details.exception.toString(),
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 13,
                          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6)),
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
