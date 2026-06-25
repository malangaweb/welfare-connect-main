import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_controller.dart';
import '../../core/widgets/notification_bell.dart';

class MemberShell extends ConsumerWidget {
  final String title;
  final String? subtitle;
  final int currentIndex;
  final Widget body;
  final List<Widget>? actions;

  const MemberShell({
    super.key,
    required this.title,
    this.subtitle,
    required this.currentIndex,
    required this.body,
    this.actions,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FB),
      appBar: AppBar(
        toolbarHeight: 72,
        titleSpacing: 18,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 24),
            ),
            if (subtitle != null)
              Text(
                subtitle!,
                style: const TextStyle(
                  color: Color(0xFFCAD6E6),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
          ],
        ),
        flexibleSpace: Container(color: const Color(0xFF1F3556)),
        foregroundColor: Colors.white,
        actions: [
          const NotificationBell(),
          ...?actions,
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert, color: Colors.white),
            onSelected: (v) {
              if (v == 'dashboard') context.go('/member/dashboard');
              if (v == 'summary') context.go('/member/summary');
              if (v == 'dependants') context.go('/member/dependants');
              if (v == 'report') context.go('/member/report');
              if (v == 'logout') {
                ref.read(authControllerProvider.notifier).logout();
                context.go('/login');
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'dashboard', child: Text('Dashboard')),
              PopupMenuItem(value: 'summary', child: Text('My Profile')),
              PopupMenuItem(value: 'dependants', child: Text('Dependants')),
              PopupMenuItem(value: 'report', child: Text('My Report')),
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
        selectedLabelStyle: const TextStyle(fontWeight: FontWeight.w700),
        onTap: (index) {
          if (index == 0) context.go('/member/wallet');
          if (index == 1) context.go('/member/cases');
          if (index == 2) context.go('/member/transactions');
          if (index == 3) context.go('/member/payments');
        },
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.account_balance_wallet_rounded),
            label: 'Wallet',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.assignment_rounded),
            label: 'Cases',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.receipt_long_rounded),
            label: 'Transactions',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.payments_rounded),
            label: 'Payments',
          ),
        ],
      ),
    );
  }
}
