import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_controller.dart';
import '../../core/auth/role_access.dart';

class AdminShell extends ConsumerWidget {
  final String title;
  final int currentIndex;
  final Widget body;
  final List<Widget>? actions;

  const AdminShell(
      {super.key,
      required this.title,
      required this.currentIndex,
      required this.body,
      this.actions});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final role = auth.role;
    final canSeeSettings = canAccessAdminPath('/admin/settings', role);
    final canSeeAccounts = canAccessAdminPath('/admin/accounts', role);
    const routes = [
      '/admin/dashboard',
      '/admin/members',
      '/admin/cases',
      '/admin/transactions',
      '/admin/suspense-queue',
      '/admin/reports',
      '/admin/users',
    ];
    const navItems = [
      BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: 'Dashboard'),
      BottomNavigationBarItem(icon: Icon(Icons.group), label: 'Members'),
      BottomNavigationBarItem(icon: Icon(Icons.assignment), label: 'Cases'),
      BottomNavigationBarItem(icon: Icon(Icons.receipt_long), label: 'Txns'),
      BottomNavigationBarItem(icon: Icon(Icons.pending_actions), label: 'Suspense'),
      BottomNavigationBarItem(icon: Icon(Icons.bar_chart), label: 'Reports'),
      BottomNavigationBarItem(icon: Icon(Icons.manage_accounts), label: 'Users'),
    ];

    final visiblePairs = <MapEntry<String, BottomNavigationBarItem>>[];
    for (var i = 0; i < routes.length; i++) {
      if (canAccessAdminPath(routes[i], role)) {
        visiblePairs.add(MapEntry(routes[i], navItems[i]));
      }
    }

    final selectedRoute = (currentIndex >= 0 && currentIndex < routes.length)
        ? routes[currentIndex]
        : routes.first;
    final visibleCurrentIndex = visiblePairs.indexWhere((p) => p.key == selectedRoute);
    final resolvedCurrentIndex = visibleCurrentIndex >= 0 ? visibleCurrentIndex : 0;

    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FB),
      appBar: AppBar(
        title: Text(title),
        backgroundColor: const Color(0xFF1F3556),
        foregroundColor: Colors.white,
        actions: [
          ...?actions,
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert),
            onSelected: (v) {
              if (v == 'settings' && canSeeSettings) context.go('/admin/settings');
              if (v == 'accounts' && canSeeAccounts) context.go('/admin/accounts');
              if (v == 'logout') {
                ref.read(authControllerProvider.notifier).logout();
                context.go('/login');
              }
            },
            itemBuilder: (_) => [
              if (canSeeSettings)
                const PopupMenuItem(value: 'settings', child: Text('Settings')),
              if (canSeeAccounts)
                const PopupMenuItem(value: 'accounts', child: Text('Accounts')),
              const PopupMenuItem(value: 'logout', child: Text('Logout')),
            ],
          ),
        ],
      ),
      body: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 980),
          child: body,
        ),
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: resolvedCurrentIndex,
        type: BottomNavigationBarType.fixed,
        backgroundColor: const Color(0xFF1F3556),
        selectedItemColor: const Color(0xFF9FD3FF),
        unselectedItemColor: const Color(0xFFA9B6C8),
        onTap: (i) {
          if (i < 0 || i >= visiblePairs.length) return;
          context.go(visiblePairs[i].key);
        },
        items: visiblePairs.map((p) => p.value).toList(),
      ),
    );
  }
}
