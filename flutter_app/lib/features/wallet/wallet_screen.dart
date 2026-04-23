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
        final balance = (data['wallet_balance'] as num?)?.toDouble() ?? 0;
        final txs = (data['recent_transactions'] as List?) ?? [];
        return RefreshIndicator(
          onRefresh: () => ref.refresh(walletControllerProvider.future),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
            children: [
              _BalanceHero(balance: balance),
              const SizedBox(height: 16),
              Row(
                children: [
                  _ActionPill(icon: Icons.add, label: 'Deposit'),
                  const SizedBox(width: 8),
                  _ActionPill(icon: Icons.north_east_rounded, label: 'Send'),
                  const SizedBox(width: 8),
                  _ActionPill(icon: Icons.more_horiz_rounded, label: 'More'),
                ],
              ),
              const SizedBox(height: 18),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'Transactions',
                              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                            ),
                          ),
                          TextButton(onPressed: () {}, child: const Text('Filter')),
                        ],
                      ),
                      const SizedBox(height: 8),
                      ...txs.take(8).map((e) {
                        final m = (e as Map).cast<String, dynamic>();
                        final amount = (m['amount'] as num?)?.toDouble() ?? 0;
                        final isOut = amount < 0;
                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF6F5F3),
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Row(
                            children: [
                              Container(
                                height: 38,
                                width: 38,
                                decoration: BoxDecoration(
                                  color: isOut ? const Color(0xFFFFE8D6) : const Color(0xFFE2F2DA),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Icon(
                                  isOut ? Icons.call_made_rounded : Icons.call_received_rounded,
                                  size: 19,
                                  color: isOut ? const Color(0xFFC8712D) : const Color(0xFF4D8A40),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '${m['transaction_type'] ?? 'transaction'}',
                                      style: const TextStyle(fontWeight: FontWeight.w600),
                                    ),
                                    Text(
                                      '${m['description'] ?? ''}',
                                      style: const TextStyle(color: Colors.black54),
                                    ),
                                  ],
                                ),
                              ),
                              Text(
                                'KES ${NumberFormat('#,##0.00').format(amount.abs())}',
                                style: TextStyle(
                                  color: isOut ? const Color(0xFF7D7A76) : const Color(0xFF4D8A40),
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                      if (txs.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 12),
                          child: Text('No recent transactions found.'),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Wallet error: $e')),
    );
  }
}

class _BalanceHero extends StatelessWidget {
  const _BalanceHero({required this.balance});

  final double balance;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(30),
        gradient: const LinearGradient(
          colors: [Color(0xFF31512E), Color(0xFF628A49), Color(0xFFC88F49)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: const [
          BoxShadow(color: Color(0x33000000), blurRadius: 26, offset: Offset(0, 12)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Wallet balance', style: TextStyle(color: Colors.white70)),
          const SizedBox(height: 8),
          Text(
            'KES ${NumberFormat('#,##0.00').format(balance)}',
            style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _TinyStat(label: 'Inflow', value: '+2,340'),
              const SizedBox(width: 10),
              _TinyStat(label: 'Outflow', value: '-1,645'),
            ],
          ),
        ],
      ),
    );
  }
}

class _TinyStat extends StatelessWidget {
  const _TinyStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text('$label $value', style: const TextStyle(color: Colors.white)),
    );
  }
}

class _ActionPill extends StatelessWidget {
  const _ActionPill({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFF161412),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 16, color: Colors.white),
            const SizedBox(width: 6),
            Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
