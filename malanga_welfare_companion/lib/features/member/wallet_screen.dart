import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/live_data_service.dart';
import '../../core/theme/app_colors.dart';
import '../auth/auth_controller.dart';

class WalletScreen extends ConsumerStatefulWidget {
  const WalletScreen({super.key});

  @override
  ConsumerState<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends ConsumerState<WalletScreen> {
  final _service = LiveDataService();
  late Future<MemberWalletSnapshot> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<MemberWalletSnapshot> _load() {
    final auth = ref.read(authControllerProvider);
    if ((auth.memberId ?? '').isEmpty || (auth.appToken ?? '').isEmpty) {
      throw Exception('Session missing member identity. Please log in again.');
    }
    return _service.fetchMemberWalletData(
      memberId: auth.memberId!,
      appToken: auth.appToken!,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final money = NumberFormat.currency(
        locale: 'en_KE', symbol: 'KES ', decimalDigits: 2);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _buildTopAppBar(theme),
            Expanded(
              child: FutureBuilder<MemberWalletSnapshot>(
                future: _future,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (snapshot.hasError) {
                    return Center(child: Text(snapshot.error.toString()));
                  }

                  final data = snapshot.data!;
                  return RefreshIndicator(
                    onRefresh: () async {
                      setState(() => _future = _load());
                      await _future;
                    },
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(
                        AppConstants.marginEdge,
                        16,
                        AppConstants.marginEdge,
                        110,
                      ),
                      children: [
                        _MetricCard(
                            title: 'Wallet Balance',
                            value: money.format(data.walletBalance)),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                                child: _MetricCard(
                                    title: 'Total Credits',
                                    value: money.format(data.totalCredit))),
                            const SizedBox(width: 12),
                            Expanded(
                                child: _MetricCard(
                                    title: 'Total Debits',
                                    value: money.format(data.totalDebit))),
                          ],
                        ),
                        const SizedBox(height: 24),
                        Text('Recent Transactions',
                            style: theme.textTheme.titleLarge
                                ?.copyWith(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 12),
                        ...data.recentTransactions.map((tx) {
                          final amount = (tx['amount'] as num?)?.toDouble() ??
                              double.tryParse('${tx['amount']}') ??
                              0;
                          final createdAt =
                              DateTime.tryParse('${tx['created_at']}');
                          final type =
                              '${tx['transaction_type'] ?? 'transaction'}';
                          return Card(
                            child: ListTile(
                              title: Text(type.replaceAll('_', ' ')),
                              subtitle: Text(createdAt == null
                                  ? '-'
                                  : DateFormat('MMM d, yyyy • h:mm a')
                                      .format(createdAt.toLocal())),
                              trailing: Text(money.format(amount.abs())),
                            ),
                          );
                        }),
                      ],
                    ),
                  );
                },
              ),
            ),
            _buildBottomNavBar(context),
          ],
        ),
      ),
    );
  }

  Widget _buildTopAppBar(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      color: AppColors.primary,
      child: Row(
        children: [
          Text('Wallet',
              style: theme.textTheme.titleLarge
                  ?.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
          const Spacer(),
          IconButton(
            onPressed: () => setState(() => _future = _load()),
            icon: const Icon(Icons.refresh, color: Colors.white),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomNavBar(BuildContext context) {
    return BottomNavigationBar(
      currentIndex: 0,
      onTap: (index) {
        if (index == 0) context.go('/member/wallet');
        if (index == 1) context.go('/member/cases');
        if (index == 2) context.go('/member/payments');
      },
      items: const [
        BottomNavigationBarItem(
            icon: Icon(Icons.account_balance_wallet), label: 'Wallet'),
        BottomNavigationBarItem(icon: Icon(Icons.assignment), label: 'Cases'),
        BottomNavigationBarItem(icon: Icon(Icons.payments), label: 'Payments'),
      ],
    );
  }
}

class _MetricCard extends StatelessWidget {
  final String title;
  final String value;

  const _MetricCard({required this.title, required this.value});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 8),
            Text(value,
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}
