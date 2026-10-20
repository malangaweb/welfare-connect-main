import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/live_data_service.dart';
import '../auth/auth_controller.dart';
import 'admin_shell.dart';

class AdminAccountsScreen extends ConsumerStatefulWidget {
  const AdminAccountsScreen({super.key});

  @override
  ConsumerState<AdminAccountsScreen> createState() =>
      _AdminAccountsScreenState();
}

class _AdminAccountsScreenState extends ConsumerState<AdminAccountsScreen>
    with SingleTickerProviderStateMixin {
  final _service = LiveDataService();
  late TabController _tabController;
  late Future<Map<String, dynamic>> _future;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _future = _load();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>> _load() async {
    final token = ref.read(authControllerProvider).appToken ?? '';
    if (token.isEmpty) throw Exception('Missing session token');
    final results = await Future.wait<dynamic>([
      _service.fetchAccountsSummary(appToken: token),
      _service.fetchRegistrationTransactions(),
      _service.fetchSuspenseQueue(limit: 300, appToken: token),
    ]);
    final data = Map<String, dynamic>.from(results[0] as Map);
    final registrationRows = (results[1] as List<Map<String, dynamic>>);
    final suspenseRows = (results[2] as List<Map<String, dynamic>>);
    data['registration_transactions'] = registrationRows;
    data['registration_fees_count'] = registrationRows.length;
    data['registration_fees_total'] = registrationRows.fold<double>(
      0,
      (sum, row) => sum + _asDouble(row['amount']).abs(),
    );
    data['suspense_transactions'] = suspenseRows;
    return data;
  }

  double _asDouble(dynamic value) =>
      value is num ? value.toDouble() : double.tryParse('$value') ?? 0;

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  Future<void> _openFeeCollectionDialog(String feeType) async {
    final memberCtrl = TextEditingController();
    final amountCtrl = TextEditingController();
    final refCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final token = ref.read(authControllerProvider).appToken ?? '';

    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('$feeType Collection'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
                controller: memberCtrl,
                decoration: const InputDecoration(labelText: 'Member ID')),
            TextField(
                controller: amountCtrl,
                decoration: const InputDecoration(labelText: 'Amount')),
            TextField(
                controller: refCtrl,
                decoration:
                    const InputDecoration(labelText: 'Reference (optional)')),
            TextField(
                controller: descCtrl,
                decoration:
                    const InputDecoration(labelText: 'Description (optional)')),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Collect')),
        ],
      ),
    );
    if (ok != true) return;
    final amount = double.tryParse(amountCtrl.text.trim()) ?? 0;
    if (memberCtrl.text.trim().isEmpty || amount <= 0) return;
    setState(() => _busy = true);
    try {
      await _service.collectMemberFee(
        appToken: token,
        memberId: memberCtrl.text.trim(),
        feeType: feeType.toLowerCase(),
        amount: amount,
        reference: refCtrl.text.trim().isEmpty ? null : refCtrl.text.trim(),
        description: descCtrl.text.trim().isEmpty ? null : descCtrl.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('$feeType collected.')));
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Collection failed: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(locale: 'en_KE', symbol: 'KES ');
    return AdminShell(
      title: 'Accounts',
      route: '/admin/accounts',
      actions: [
        IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh)),
      ],
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('${snapshot.error}'));
          }
          final data = snapshot.data ?? const {};
          return Column(
            children: [
              Container(
                color: const Color(0xFF1F3556),
                child: TabBar(
                  controller: _tabController,
                  isScrollable: true,
                  indicatorColor: const Color(0xFF9FD3FF),
                  labelColor: Colors.white,
                  unselectedLabelColor: const Color(0xFFA9B6C8),
                  tabs: const [
                    Tab(text: 'Registration'),
                    Tab(text: 'Suspense')
                  ],
                ),
              ),
              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [
                    _RegistrationFeesTab(
                        data: data,
                        money: money,
                        onCollect: () =>
                            _openFeeCollectionDialog('Registration'),
                        busy: _busy),
                    _SuspenseAccountTab(data: data, money: money),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;

  const _SummaryCard(
      {required this.title, required this.value, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFFEFF6FF),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 20, color: const Color(0xFF1F3556)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        color: Color(0xFF64748B), fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(value,
                    style: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 18)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RegistrationFeesTab extends StatelessWidget {
  final Map<String, dynamic> data;
  final NumberFormat money;
  final VoidCallback onCollect;
  final bool busy;

  const _RegistrationFeesTab(
      {required this.data,
      required this.money,
      required this.onCollect,
      required this.busy});

  @override
  Widget build(BuildContext context) {
    final registrationTotal =
        (data['registration_fees_total'] as num?)?.toDouble() ?? 0;
    final registrationCount =
        (data['registration_fees_count'] as num?)?.toInt() ?? 0;
    final transactions = (data['registration_transactions'] as List?)
            ?.whereType<Map>()
            .map((row) => row.cast<String, dynamic>())
            .toList() ??
        const <Map<String, dynamic>>[];

    return ListView(
      padding: const EdgeInsets.all(AppConstants.marginEdge),
      children: [
        _SummaryCard(
          title: 'Registration Fees',
          value: money.format(registrationTotal),
          icon: Icons.assignment_ind,
        ),
        const SizedBox(height: 8),
        Text('$registrationCount transactions',
            style: const TextStyle(color: Color(0xFF64748B))),
        const SizedBox(height: 16),
        if (registrationCount == 0)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Center(
                  child: Text('No registration fees transactions found.')),
            ),
          ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: busy ? null : onCollect,
          icon: const Icon(Icons.add),
          label: const Text('Collect Registration Fee'),
        ),
        const SizedBox(height: 20),
        const Text('Registration transactions',
            style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        if (transactions.isEmpty)
          const Text('No registration fee transactions found.')
        else
          ...transactions.map((transaction) {
            final member = (transaction['members'] as Map?) ?? const {};
            final amount = (transaction['amount'] as num?)?.toDouble() ?? 0;
            final date = DateTime.tryParse('${transaction['created_at']}');
            return Column(
              children: [
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    '${member['name'] ?? transaction['description'] ?? 'Registration fee'}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text([
                    if (member['member_number'] != null)
                      '#${member['member_number']}',
                    if (date != null) DateFormat('dd MMM yyyy').format(date),
                    '${transaction['status'] ?? ''}'.toUpperCase(),
                  ].where((value) => value.isNotEmpty).join(' • ')),
                  trailing: Text(money.format(amount.abs())),
                ),
                const Divider(height: 1),
              ],
            );
          }),
      ],
    );
  }
}

class _SuspenseAccountTab extends StatelessWidget {
  final Map<String, dynamic> data;
  final NumberFormat money;

  const _SuspenseAccountTab({required this.data, required this.money});

  @override
  Widget build(BuildContext context) {
    final suspenseCount =
        (data['suspense_pending_count'] as num?)?.toInt() ?? 0;
    final suspenseAmount =
        (data['suspense_pending_amount'] as num?)?.toDouble() ?? 0;
    final transactions = (data['suspense_transactions'] as List?)
            ?.whereType<Map>()
            .map((row) => row.cast<String, dynamic>())
            .toList() ??
        const <Map<String, dynamic>>[];

    return ListView(
      padding: const EdgeInsets.all(AppConstants.marginEdge),
      children: [
        _SummaryCard(
          title: 'Suspense Account',
          value: money.format(suspenseAmount),
          icon: Icons.pending_actions,
        ),
        const SizedBox(height: 8),
        Text('$suspenseCount items awaiting review',
            style: const TextStyle(color: Color(0xFF64748B))),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: () => context.go('/admin/suspense-queue'),
          icon: const Icon(Icons.open_in_new),
          label: const Text('Open Suspense Queue'),
        ),
        const SizedBox(height: 20),
        const Text('Pending transactions',
            style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        if (transactions.isEmpty)
          const Text('No pending suspense transactions.')
        else
          ...transactions.map((transaction) {
            final date = DateTime.tryParse(
              '${transaction['transaction_date'] ?? transaction['created_at']}',
            );
            return Column(
              children: [
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    '${transaction['sender_name'] ?? transaction['phone_number'] ?? 'Unknown sender'}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text([
                    '${transaction['mpesa_receipt_number'] ?? transaction['reference'] ?? '-'}',
                    if (date != null) DateFormat('dd MMM yyyy').format(date),
                  ].join(' • ')),
                  trailing: Text(
                    money.format(
                        (transaction['amount'] as num?)?.toDouble() ?? 0),
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                const Divider(height: 1),
              ],
            );
          }),
      ],
    );
  }
}
