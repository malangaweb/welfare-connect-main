import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:posthog_flutter/posthog_flutter.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/live_data_service.dart';
import '../../core/widgets/async_error_view.dart';
import '../auth/auth_controller.dart';
import 'member_shell.dart';

class WalletScreen extends ConsumerStatefulWidget {
  const WalletScreen({super.key});

  @override
  ConsumerState<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends ConsumerState<WalletScreen> {
  final _service = LiveDataService();
  late Future<MemberWalletSnapshot> _future;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<MemberWalletSnapshot> _load({bool forceRefresh = false}) {
    final auth = ref.read(authControllerProvider);
    if ((auth.memberId ?? '').isEmpty || (auth.appToken ?? '').isEmpty) {
      throw Exception('Session missing member identity. Please log in again.');
    }
    return _service.fetchMemberWalletData(
      memberId: auth.memberId!,
      appToken: auth.appToken!,
      forceRefresh: forceRefresh,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final money = NumberFormat.currency(
      locale: 'en_KE',
      symbol: 'KES ',
      decimalDigits: 2,
    );

    return MemberShell(
      title: 'Wallet',
      subtitle: 'Balance and recent activity',
      currentIndex: 0,
      actions: [
        IconButton(
          onPressed: () => setState(() => _future = _load(forceRefresh: true)),
          icon: const Icon(Icons.refresh),
        ),
      ],
      body: FutureBuilder<MemberWalletSnapshot>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return AsyncErrorView(
                error: snapshot.error,
                onRetry: () =>
                    setState(() => _future = _load(forceRefresh: true)));
          }

          final data = snapshot.data!;
          return RefreshIndicator(
            onRefresh: () async {
              setState(() => _future = _load(forceRefresh: true));
              await _future;
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(
                AppConstants.marginEdge,
                18,
                AppConstants.marginEdge,
                18,
              ),
              children: [
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF143F1E), Color(0xFF246133)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x36000000),
                        blurRadius: 18,
                        offset: Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Wallet Balance',
                        style: theme.textTheme.labelLarge
                            ?.copyWith(color: Colors.white70),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        money.format(data.walletBalance),
                        style: theme.textTheme.headlineLarge?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: _InfoCard(
                        title: 'Total Credits',
                        value: money.format(data.totalCredit),
                        valueColor: const Color(0xFF0A7C2F),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _InfoCard(
                        title: 'Total Debits',
                        value: money.format(data.totalDebit),
                        valueColor: const Color(0xFFB34700),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: data.isDefaulting
                        ? const Color(0xFFFFF1EA)
                        : const Color(0xFFEAF5EE),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: data.isDefaulting
                          ? const Color(0xFFFFD4BE)
                          : const Color(0xFFCDE8D6),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        data.isDefaulting
                            ? 'Defaulting Risk Detected'
                            : 'Compliance Status: Good',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Unpaid cases: ${data.unpaidCasesCount} • Arrears: ${money.format(data.arrearsTotal)} • Penalties: ${money.format(data.penaltyTotal)}',
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton.icon(
                      onPressed: _busy ? null : _openTransferDialog,
                      icon: const Icon(Icons.swap_horiz),
                      label: const Text('Transfer Funds'),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Recent Transactions',
                        style: theme.textTheme.titleLarge
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                    TextButton(
                      onPressed: () => context.push('/member/transactions'),
                      child: const Text('View all'),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ...data.recentTransactions.map((tx) {
                  final amount = (tx['amount'] as num?)?.toDouble() ??
                      double.tryParse('${tx['amount']}') ??
                      0;
                  final createdAt = DateTime.tryParse('${tx['created_at']}');
                  final type = '${tx['transaction_type'] ?? 'transaction'}';

                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(18),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x14000000),
                          blurRadius: 8,
                          offset: Offset(0, 3),
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: const Color(0xFFEAF2EC),
                            borderRadius: BorderRadius.circular(11),
                          ),
                          child: const Icon(Icons.receipt_long_rounded),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                type.replaceAll('_', ' '),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                createdAt == null
                                    ? '-'
                                    : DateFormat('MMM d, yyyy • h:mm a')
                                        .format(createdAt.toLocal()),
                                style: theme.textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerRight,
                            child: Text(
                              money.format(amount.abs()),
                              maxLines: 1,
                              style: theme.textTheme.titleSmall?.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _openTransferDialog() async {
    final auth = ref.read(authControllerProvider);
    final amountCtrl = TextEditingController();
    final searchCtrl = TextEditingController();
    List<Map<String, dynamic>> results = [];
    Map<String, dynamic>? selected;

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocalState) => AlertDialog(
          title: const Text('Transfer Funds'),
          content: SizedBox(
            width: 420,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: searchCtrl,
                  decoration: const InputDecoration(labelText: 'Search member'),
                  onChanged: (q) async {
                    results = await _service.searchMembers(
                      query: q,
                      excludeMemberId: auth.memberId ?? '',
                    );
                    if (mounted) setLocalState(() {});
                  },
                ),
                const SizedBox(height: 8),
                if (results.isNotEmpty)
                  DropdownButtonFormField<String>(
                    initialValue: selected?['id'] as String?,
                    items: results
                        .map((m) => DropdownMenuItem<String>(
                              value: '${m['id']}',
                              child:
                                  Text('${m['name']} (${m['member_number']})'),
                            ))
                        .toList(),
                    onChanged: (v) {
                      selected = results.firstWhere((m) => '${m['id']}' == v);
                      setLocalState(() {});
                    },
                  ),
                const SizedBox(height: 8),
                TextField(
                  controller: amountCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Amount'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () async {
                try {
                  final amount = double.tryParse(amountCtrl.text.trim()) ?? 0;
                  if (selected == null ||
                      amount <= 0 ||
                      (auth.memberId ?? '').isEmpty) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content:
                            Text('Choose a member and enter a valid amount.'),
                        backgroundColor: Colors.red,
                      ),
                    );
                    return;
                  }
                  final currentWallet = (await _future).walletBalance;
                  if (amount > currentWallet) {
                    if (!mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          'Insufficient funds. Wallet balance is KES ${currentWallet.toStringAsFixed(2)}.',
                        ),
                        backgroundColor: Colors.red,
                      ),
                    );
                    return;
                  }
                  setState(() => _busy = true);
                  await _service.transferFunds(
                    fromMemberId: auth.memberId!,
                    toMemberId: '${selected!['id']}',
                    amount: amount,
                    toMemberNumber: '${selected!['member_number'] ?? ''}',
                  );
                  if (!mounted) return;
                  Posthog().capture(
                    eventName: 'wallet_transfer_completed',
                    properties: {'amount': amount},
                  );
                  Navigator.of(context).pop();
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                        content: Text('Transfer successful.'),
                        backgroundColor: Colors.green),
                  );
                  setState(() => _future = _load(forceRefresh: true));
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                          content: Text('Transfer failed: $e'),
                          backgroundColor: Colors.red),
                    );
                  }
                } finally {
                  if (mounted) setState(() => _busy = false);
                }
              },
              child: const Text('Transfer'),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final String title;
  final String value;
  final Color valueColor;

  const _InfoCard({
    required this.title,
    required this.value,
    required this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 8,
            offset: Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.labelMedium),
          const SizedBox(height: 6),
          Text(
            value,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: valueColor,
                  fontWeight: FontWeight.w700,
                ),
          ),
        ],
      ),
    );
  }
}
