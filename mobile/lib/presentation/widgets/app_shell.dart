import 'package:badges/badges.dart' as badges;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';
import 'package:penny_mobile/presentation/providers/notification_providers.dart';
import 'package:penny_mobile/presentation/providers/providers.dart';
import 'package:penny_mobile/presentation/widgets/connectivity_banner.dart';

class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  bool _initialized = false;

  int _currentIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    if (location.startsWith('/dashboard')) return 1;
    if (location.startsWith('/finances')) return 2;
    if (location.startsWith('/groups')) return 3;
    if (location.startsWith('/profile')) return 4;
    return 0;
  }

  void _onTap(int index) {
    HapticFeedback.selectionClick();
    switch (index) {
      case 0:
        context.go('/');
      case 1:
        context.go('/dashboard');
      case 2:
        context.go('/finances');
      case 3:
        context.go('/groups');
      case 4:
        context.go('/profile');
    }
  }

  @override
  void initState() {
    super.initState();
    // Defer push notification setup to avoid build-phase side effects
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_initialized) {
        _initialized = true;
        if (!ref.read(guestModeProvider)) {
          ref.read(pushNotificationInitProvider);
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final idx = _currentIndex(context);
    debugPrint('[PENNY] AppShell build: location=$location, index=$idx');

    // Handle push notification deep link navigation
    ref.listen(pushNavigationStreamProvider, (_, next) {
      final url = next.valueOrNull;
      if (url != null && context.mounted) {
        context.push(url);
      }
    });

    final unreadCount = ref.watch(unreadCountProvider);

    return Scaffold(
      body: ConnectivityBanner(child: widget.child),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex(context),
        onDestinationSelected: _onTap,
        destinations: [
          NavigationDestination(
            icon: _buildBadgedIcon(Icons.chat_bubble_outline, unreadCount),
            selectedIcon: _buildBadgedIcon(Icons.chat_bubble, unreadCount),
            label: 'Home',
          ),
          const NavigationDestination(
            icon: Icon(Icons.bar_chart_outlined),
            selectedIcon: Icon(Icons.bar_chart),
            label: 'Dashboard',
          ),
          const NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: Icon(Icons.account_balance_wallet),
            label: 'Finances',
          ),
          const NavigationDestination(
            icon: Icon(Icons.group_outlined),
            selectedIcon: Icon(Icons.group),
            label: 'Groups',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }

  Widget _buildBadgedIcon(IconData iconData, int count) {
    if (count == 0) return Icon(iconData);
    return badges.Badge(
      badgeContent: Text(
        count > 9 ? '9+' : '$count',
        style: const TextStyle(
          color: Colors.white,
          fontSize: 10,
          fontWeight: FontWeight.w600,
        ),
      ),
      badgeStyle: const badges.BadgeStyle(
        badgeColor: Color(0xFFFF3B30),
        padding: EdgeInsets.all(4),
      ),
      position: badges.BadgePosition.topEnd(top: -8, end: -6),
      child: Icon(iconData),
    );
  }
}
