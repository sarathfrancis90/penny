import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';

/// Animated splash screen with coin flip reveal.
///
/// Sequence:
/// 1. Penny coin fades in + scales up with a 3D flip rotation (0-600ms)
/// 2. Coin settles with a bounce (600-900ms)
/// 3. "Penny" text slides up + fades in (800-1200ms)
/// 4. "AI Expense Tracker" subtitle fades in (1000-1400ms)
/// 5. Holds for a moment, then the app loads underneath
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _flipAnimation;
  late final Animation<double> _scaleAnimation;
  late final Animation<double> _bounceAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1200),
      vsync: this,
    );

    // Coin flip: 0 to pi (half rotation showing the face)
    _flipAnimation = Tween<double>(begin: math.pi / 2, end: 0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0, 0.5, curve: Curves.easeOutBack),
      ),
    );

    // Scale: start small, grow to full size
    _scaleAnimation = Tween<double>(begin: 0.3, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0, 0.6, curve: Curves.easeOutCubic),
      ),
    );

    // Bounce settle at the end
    _bounceAnimation = Tween<double>(begin: 0.95, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.6, 1.0, curve: Curves.elasticOut),
      ),
    );

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Animated coin
            AnimatedBuilder(
              animation: _controller,
              builder: (context, child) {
                return Transform(
                  alignment: Alignment.center,
                  transform: Matrix4.identity()
                    ..setEntry(3, 2, 0.001) // perspective
                    ..rotateY(_flipAnimation.value)
                    ..scale(
                      _scaleAnimation.value * _bounceAnimation.value,
                    ),
                  child: child,
                );
              },
              child: Image.asset(
                'assets/icon/penny_icon.png',
                width: 120,
                height: 120,
              ),
            ),

            const SizedBox(height: 24),

            // "Penny" text — slides up + fades in
            const Text(
              'Penny',
              style: TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
                letterSpacing: -0.5,
              ),
            )
                .animate(delay: 600.ms)
                .fadeIn(duration: 400.ms)
                .slideY(begin: 0.3, end: 0, duration: 400.ms, curve: Curves.easeOut),

            const SizedBox(height: 6),

            // Subtitle — fades in
            const Text(
              'AI Expense Tracker',
              style: TextStyle(
                fontSize: 15,
                color: AppColors.textSecondary,
              ),
            )
                .animate(delay: 900.ms)
                .fadeIn(duration: 400.ms),

            const SizedBox(height: 40),

            // Loading pulse — the coin icon as a tiny pulsing loader
            const _PennyLoader()
                .animate(delay: 1200.ms)
                .fadeIn(duration: 300.ms),
          ],
        ),
      ),
    );
  }
}

/// Branded loading spinner — the Penny coin with a gentle pulse.
/// Use this anywhere in the app as a replacement for CircularProgressIndicator.
class PennyLoader extends StatelessWidget {
  const PennyLoader({super.key, this.size = 32});

  final double size;

  @override
  Widget build(BuildContext context) {
    return _PennyLoader(size: size);
  }
}

class _PennyLoader extends StatefulWidget {
  const _PennyLoader({this.size = 24});

  final double size;

  @override
  State<_PennyLoader> createState() => _PennyLoaderState();
}

class _PennyLoaderState extends State<_PennyLoader>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        // Gentle breathing scale + slow rotation
        final scale = 0.85 + 0.15 * math.sin(_controller.value * 2 * math.pi);
        final rotation = _controller.value * 2 * math.pi;
        return Transform.scale(
          scale: scale,
          child: Transform.rotate(
            angle: rotation * 0.1, // very subtle rotation
            child: Opacity(
              opacity: 0.5 + 0.5 * math.sin(_controller.value * 2 * math.pi),
              child: child,
            ),
          ),
        );
      },
      child: Image.asset(
        'assets/icon/penny_icon.png',
        width: widget.size,
        height: widget.size,
      ),
    );
  }
}
