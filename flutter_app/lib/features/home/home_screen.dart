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
      await ref.read(syncEngineProvider).flushOutbox();
      await ref.read(pushServiceProvider).registerDeviceToken();
    });
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionControllerProvider);
    final isAdmin = (session.role ?? "").toLowerCase() != "member";

    final tabs = <Widget>[
      const WalletScreen(),
      const CasesScreen(),
      const StkPushScreen(),
      if (isAdmin) const SuspenseScreen(),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text("Malanga Companion (${session.role ?? "unknown"})"),
        actions: [
          IconButton(
            onPressed: () => ref.read(authControllerProvider).logout(),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: tabs[idx],
      bottomNavigationBar: NavigationBar(
        selectedIndex: idx,
        onDestinationSelected: (v) => setState(() => idx = v),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.account_balance_wallet), label: "Wallet"),
          const NavigationDestination(icon: Icon(Icons.cases_outlined), label: "Cases"),
          const NavigationDestination(icon: Icon(Icons.payment), label: "Pay"),
          if (isAdmin)
            const NavigationDestination(icon: Icon(Icons.manage_search), label: "Suspense"),
        ],
      ),
    );
  }
}
