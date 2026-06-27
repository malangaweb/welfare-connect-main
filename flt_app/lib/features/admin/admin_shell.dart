import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_controller.dart';
import '../../core/auth/role_access.dart';
import '../../core/widgets/notification_bell.dart';

class AdminShell extends ConsumerWidget {
  final String title;
  final String route;
  final Widget body;
  final List<Widget>? actions;

  const AdminShell({
    super.key,
    required this.title,
    required this.route,
    required this.body,
    this.actions,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final role = auth.role;
    final canSeeSettings = canAccessAdminPath('/admin/settings', role);
    final canSeeAccounts = canAccessAdminPath('/admin/accounts', role);

    const routes = <String>[
      '/admin/dashboard',
      '/admin/members',
      '/admin/cases',
      '/admin/transactions',
      '/admin/suspense-queue',
      '/admin/reports',
      '/admin/users',
    ];
    const labels = <String>[
      'Dashboard',
      'Members',
      'Cases',
      'Txns',
      'Suspense',
      'Reports',
      'Users',
    ];
    const icons = <IconData>[
      Icons.dashboard,
      Icons.group,
      Icons.assignment,
      Icons.receipt_long,
      Icons.pending_actions,
      Icons.bar_chart,
      Icons.manage_accounts,
    ];

    final visibleRoutes = <String>[];
    final visibleLabels = <String>[];
    final visibleIcons = <IconData>[];
    for (var i = 0; i < routes.length; i++) {
      if (canAccessAdminPath(routes[i], role)) {
        visibleRoutes.add(routes[i]);
        visibleLabels.add(labels[i]);
        visibleIcons.add(icons[i]);
      }
    }

    final currentIndex = visibleRoutes.indexOf(route);
    final resolvedIndex = currentIndex >= 0 ? currentIndex : 0;

    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FB),
      appBar: AppBar(
        title: Text(title),
        backgroundColor: const Color(0xFF1F3556),
        foregroundColor: Colors.white,
        actions: [
          const NotificationBell(),
          ...?actions,
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert),
            onSelected: (v) {
              if (v == 'settings' && canSeeSettings) context.go('/admin/settings');
              if (v == 'accounts' && canSeeAccounts) context.go('/admin/accounts');
              if (v == 'fiscal') context.go('/admin/fiscal-reports');
              if (v == 'compliance') context.go('/admin/compliance-reports');
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
              const PopupMenuItem(value: 'fiscal', child: Text('Fiscal Reports')),
              const PopupMenuItem(value: 'compliance', child: Text('Compliance Reports')),
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
        currentIndex: resolvedIndex,
        type: BottomNavigationBarType.fixed,
        backgroundColor: const Color(0xFF1F3556),
        selectedItemColor: const Color(0xFF9FD3FF),
        unselectedItemColor: const Color(0xFFA9B6C8),
        onTap: (i) {
          if (i < 0 || i >= visibleRoutes.length) return;
          context.go(visibleRoutes[i]);
        },
        items: List.generate(visibleRoutes.length, (i) {
          return BottomNavigationBarItem(
            icon: Icon(visibleIcons[i]),
            label: visibleLabels[i],
          );
        }),
      ),
    );
  }
}
