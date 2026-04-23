import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/session_controller.dart';
import '../../core/providers.dart';
import '../auth/auth_controller.dart';
import '../cases/cases_screen.dart';
import '../payments/stk_push_screen.dart';
import '../push/push_service.dart';
import '../suspense/suspense_screen.dart';
import '../wallet/wallet_screen.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int idx = 0;

  @override
  void initState() {
    super.initState();
    Future.microtask(() async {
      try {
        await ref.read(syncEngineProvider).flushOutbox();
      } catch (_) {}
      try {
        await ref.read(pushServiceProvider).registerDeviceToken();
      } catch (_) {}
    });
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionControllerProvider);
    final isAdmin = (session.role ?? '').toLowerCase() != 'member';

    final tabs = <Widget>[
      const WalletScreen(),
      const CasesScreen(),
      const StkPushScreen(),
      if (isAdmin) const SuspenseScreen(),
    ];

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFECE8E1), Color(0xFFF5F4F1)],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Row(
                  children: [
                    Container(
                      height: 42,
                      width: 42,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(999),
                        gradient: const LinearGradient(
                          colors: [Color(0xFF6E9551), Color(0xFFC59049)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        (session.role ?? 'U').substring(0, 1).toUpperCase(),
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Welcome back', style: TextStyle(color: Colors.black54)),
                          Text(
                            'Role: ${session.role ?? 'unknown'}',
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => ref.read(authControllerProvider).logout(),
                      icon: const Icon(Icons.logout_rounded),
                    ),
                  ],
                ),
              ),
              Expanded(child: tabs[idx]),
            ],
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(18, 0, 18, 10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
          decoration: BoxDecoration(
            color: const Color(0xFF12100F),
            borderRadius: BorderRadius.circular(999),
          ),
          child: NavigationBarTheme(
            data: NavigationBarThemeData(
              height: 58,
              backgroundColor: Colors.transparent,
              indicatorColor: Colors.white,
              labelTextStyle: WidgetStateProperty.resolveWith(
                (states) => TextStyle(
                  color: states.contains(WidgetState.selected) ? Colors.black : Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            child: NavigationBar(
              selectedIndex: idx,
              onDestinationSelected: (v) => setState(() => idx = v),
              destinations: [
                const NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), label: 'Wallet'),
                const NavigationDestination(icon: Icon(Icons.folder_outlined), label: 'Cases'),
                const NavigationDestination(icon: Icon(Icons.north_east_rounded), label: 'Pay'),
                if (isAdmin) const NavigationDestination(icon: Icon(Icons.manage_search), label: 'Suspense'),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
