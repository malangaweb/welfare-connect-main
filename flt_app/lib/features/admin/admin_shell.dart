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
    final canSeeApplications = canAccessAdminPath('/admin/applications', role);

    const routes = <String>[
      '/admin/dashboard',
      '/admin/members',
      '/admin/cases',
      '/admin/transactions',
    ];
    const labels = <String>['Home', 'Members', 'Cases', 'Transactions'];
    const icons = <IconData>[
      Icons.dashboard_outlined,
      Icons.group_outlined,
      Icons.assignment_outlined,
      Icons.receipt_long_outlined,
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
    final expanded = MediaQuery.sizeOf(context).width >= 840;
    final resolvedIndex = currentIndex >= 0 ? currentIndex : null;

    final router = GoRouter.of(context);
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FB),
      appBar: AppBar(
        title: Text(title),
        backgroundColor: const Color(0xFF1F3556),
        foregroundColor: Colors.white,
        actions: [
          NotificationBell(
            key: ValueKey(
              'admin:${auth.user?.id ?? auth.memberId ?? 'unknown'}',
            ),
          ),
          ...?actions,
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert),
            onSelected: (v) {
              if (v == 'settings' && canSeeSettings) {
                context.go('/admin/settings');
              }
              if (v == 'accounts' && canSeeAccounts) {
                context.go('/admin/accounts');
              }
              if (v == 'applications' && canSeeApplications) {
                context.go('/admin/applications');
              }
              if (v == 'suspense' &&
                  canAccessAdminPath('/admin/suspense-queue', role)) {
                context.go('/admin/suspense-queue');
              }
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
              if (canSeeApplications)
                const PopupMenuItem(
                    value: 'applications',
                    child: Text('Membership applications')),
              if (canAccessAdminPath('/admin/suspense-queue', role))
                const PopupMenuItem(
                    value: 'suspense', child: Text('Suspense queue')),
              const PopupMenuItem(value: 'logout', child: Text('Logout')),
            ],
          ),
        ],
      ),
      body: PopScope<Object?>(
        canPop: router.canPop(),
        onPopInvokedWithResult: (didPop, result) {
          if (!didPop && !router.canPop()) {
            router.go('/admin/dashboard');
          }
        },
        child: Row(children: [
          if (expanded)
            NavigationRail(
              selectedIndex: resolvedIndex,
              labelType: NavigationRailLabelType.all,
              onDestinationSelected: (i) => context.go(visibleRoutes[i]),
              destinations: List.generate(
                  visibleRoutes.length,
                  (i) => NavigationRailDestination(
                        icon: Icon(visibleIcons[i]),
                        label: Text(visibleLabels[i]),
                      )),
            ),
          Expanded(
            child: Align(
              alignment: Alignment.topCenter,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1120),
                child: DataTableTheme(
                  data: DataTableThemeData(
                    headingRowHeight: 40,
                    dataRowMinHeight: 36,
                    dataRowMaxHeight: 48,
                    horizontalMargin: 12,
                    columnSpacing: 16,
                    headingTextStyle: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                    dataTextStyle: const TextStyle(fontSize: 13),
                  ),
                  child: ListTileTheme(
                    dense: true,
                    minVerticalPadding: 4,
                    horizontalTitleGap: 10,
                    minLeadingWidth: 32,
                    child: body,
                  ),
                ),
              ),
            ),
          ),
        ]),
      ),
      bottomNavigationBar: expanded
          ? null
          : NavigationBar(
              selectedIndex: resolvedIndex ?? 0,
              onDestinationSelected: (i) => context.go(visibleRoutes[i]),
              destinations: List.generate(
                  visibleRoutes.length,
                  (i) => NavigationDestination(
                        icon: Icon(visibleIcons[i]),
                        label: visibleLabels[i],
                      )),
            ),
    );
  }
}
