import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'wallet_controller.dart';

class WalletScreen extends ConsumerWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(walletControllerProvider);
    return state.when(
      data: (data) {
        final balance = (data["wallet_balance"] as num?)?.toDouble() ?? 0;
        final txs = (data["recent_transactions"] as List?) ?? [];
        return RefreshIndicator(
          onRefresh: () => ref.refresh(walletControllerProvider.future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: ListTile(
                  title: const Text("Wallet Balance"),
                  subtitle: Text("KES ${NumberFormat("#,##0.00").format(balance)}"),
                ),
              ),
              const SizedBox(height: 12),
              const Text("Recent Transactions", style: TextStyle(fontWeight: FontWeight.bold)),
              ...txs.map((e) {
                final m = (e as Map).cast<String, dynamic>();
                return ListTile(
                  title: Text("${m["transaction_type"] ?? "transaction"}"),
                  subtitle: Text("${m["description"] ?? ""}"),
                  trailing: Text("KES ${m["amount"] ?? 0}"),
                );
              }),
            ],
          ),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text("Wallet error: $e")),
    );
  }
}
