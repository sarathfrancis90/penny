import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:smooth_page_indicator/smooth_page_indicator.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _controller = PageController();
  int _currentPage = 0;

  static const _pages = [
    _OnboardingPageData(
      icon: Icons.chat_bubble_outline,
      title: 'Track expenses with AI',
      subtitle: 'Just describe your expense or snap a receipt',
    ),
    _OnboardingPageData(
      icon: Icons.bar_chart_rounded,
      title: 'Smart budgets & insights',
      subtitle: 'Set category budgets and get real-time alerts',
    ),
    _OnboardingPageData(
      icon: Icons.group_outlined,
      title: 'Share with your team',
      subtitle: 'Create groups for family or business expenses',
    ),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _startFreeMode() {
    Hive.box('app_preferences').put('onboarding_complete', true);
    setGuestMode(ref, true);
    context.go('/');
  }

  void _goToLogin() {
    Hive.box('app_preferences').put('onboarding_complete', true);
    context.go('/auth/login');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // Skip button
            Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.only(top: 8, right: 16),
                child: _currentPage < _pages.length - 1
                    ? TextButton(
                        onPressed: _startFreeMode,
                        child: Text(
                          'Skip',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                        ),
                      )
                    : const SizedBox(height: 48),
              ),
            ),

            // Pages
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _pages.length,
                onPageChanged: (index) {
                  setState(() => _currentPage = index);
                },
                itemBuilder: (context, index) {
                  final page = _pages[index];
                  final isLast = index == _pages.length - 1;
                  return _OnboardingPage(
                    data: page,
                    isLast: isLast,
                    onStartFree: _startFreeMode,
                    onSignIn: _goToLogin,
                  );
                },
              ),
            ),

            // Page indicator dots
            Padding(
              padding: const EdgeInsets.only(bottom: 48),
              child: SmoothPageIndicator(
                controller: _controller,
                count: _pages.length,
                effect: ExpandingDotsEffect(
                  activeDotColor: AppColors.primary,
                  dotColor: Theme.of(context).dividerColor,
                  dotHeight: 8,
                  dotWidth: 8,
                  expansionFactor: 3,
                  spacing: 8,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OnboardingPageData {
  const _OnboardingPageData({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;
}

class _OnboardingPage extends StatelessWidget {
  const _OnboardingPage({
    required this.data,
    required this.isLast,
    required this.onStartFree,
    required this.onSignIn,
  });

  final _OnboardingPageData data;
  final bool isLast;
  final VoidCallback onStartFree;
  final VoidCallback onSignIn;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Spacer(),

          // Illustration area — Penny icon or feature icon in circle
          Container(
            width: 160,
            height: 160,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.08),
              shape: BoxShape.circle,
            ),
            child: data.icon == Icons.chat_bubble_outline
                ? Center(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(24),
                      child: Image.asset('assets/icon/penny_icon.png', width: 88, height: 88),
                    ),
                  )
                : Icon(
                    data.icon,
                    size: 72,
                    color: AppColors.primary,
                  ),
          ),
          const SizedBox(height: 48),

          // Title
          Text(
            data.title,
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              color: Theme.of(context).colorScheme.onSurface,
              letterSpacing: -0.5,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),

          // Subtitle
          Text(
            data.subtitle,
            style: TextStyle(
              fontSize: 16,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              height: 1.4,
            ),
            textAlign: TextAlign.center,
          ),

          const Spacer(),

          // CTAs on last page
          if (isLast) ...[
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: onStartFree,
                child: const Text('Start Tracking Free'),
              ),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: onSignIn,
              child: Text(
                'Already have an account? Sign In',
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.primary,
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }
}
