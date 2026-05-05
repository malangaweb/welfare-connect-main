import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_controller.dart';

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
              if (v == 'settings') context.go('/admin/settings');
              if (v == 'logout') {
                ref.read(authControllerProvider.notifier).logout();
                context.go('/login');
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'settings', child: Text('Settings')),
              PopupMenuItem(value: 'logout', child: Text('Logout')),
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
        currentIndex: currentIndex,
        type: BottomNavigationBarType.fixed,
        backgroundColor: const Color(0xFF1F3556),
        selectedItemColor: const Color(0xFF9FD3FF),
        unselectedItemColor: const Color(0xFFA9B6C8),
        onTap: (i) {
          if (i == 0) context.go('/admin/dashboard');
          if (i == 1) context.go('/admin/members');
          if (i == 2) context.go('/admin/cases');
          if (i == 3) context.go('/admin/transactions');
          if (i == 4) context.go('/admin/suspense-queue');
        },
        items: const [
          BottomNavigationBarItem(
              icon: Icon(Icons.dashboard), label: 'Dashboard'),
          BottomNavigationBarItem(icon: Icon(Icons.group), label: 'Members'),
          BottomNavigationBarItem(icon: Icon(Icons.assignment), label: 'Cases'),
          BottomNavigationBarItem(
              icon: Icon(Icons.receipt_long), label: 'Txns'),
          BottomNavigationBarItem(
              icon: Icon(Icons.pending_actions), label: 'Suspense'),
        ],
      ),
    );
  }
}
