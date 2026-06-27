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
  ConsumerState<AdminAccountsScreen> createState() => _AdminAccountsScreenState();
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
    _tabController = TabController(length: 5, vsync: this);
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
    return _service.fetchAccountsSummary(appToken: token);
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  Future<void> _openTransferDialog() async {
    final fromCtrl = TextEditingController();
    final toCtrl = TextEditingController();
    final amountCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Admin Transfer'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: fromCtrl, decoration: const InputDecoration(labelText: 'From Member ID')),
            TextField(controller: toCtrl, decoration: const InputDecoration(labelText: 'To Member ID')),
            TextField(controller: amountCtrl, decoration: const InputDecoration(labelText: 'Amount')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(context, true), child: const Text('Transfer')),
        ],
      ),
    );
    if (ok != true) return;
    final amount = double.tryParse(amountCtrl.text.trim()) ?? 0;
    if (fromCtrl.text.trim().isEmpty || toCtrl.text.trim().isEmpty || amount <= 0) return;
    setState(() => _busy = true);
    try {
      await _service.transferFunds(
        fromMemberId: fromCtrl.text.trim(),
        toMemberId: toCtrl.text.trim(),
        amount: amount,
        toMemberNumber: toCtrl.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Transfer completed.')));
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Transfer failed: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openBulkDeductionDialog() async {
    final caseCtrl = TextEditingController();
    final membersCtrl = TextEditingController();
    final token = ref.read(authControllerProvider).appToken ?? '';
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Bulk Case Deduction'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: caseCtrl, decoration: const InputDecoration(labelText: 'Case ID')),
            TextField(
              controller: membersCtrl,
              decoration: const InputDecoration(labelText: 'Member IDs (comma-separated)'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(context, true), child: const Text('Run')),
        ],
      ),
    );
    if (ok != true) return;
    final memberIds = membersCtrl.text.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
    if (caseCtrl.text.trim().isEmpty || memberIds.isEmpty) return;
    setState(() => _busy = true);
    try {
      final result = await _service.bulkDeductCase(
        appToken: token,
        caseId: caseCtrl.text.trim(),
        memberIds: memberIds,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Bulk deduction response: $result')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Bulk deduction failed: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
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
            TextField(controller: memberCtrl, decoration: const InputDecoration(labelText: 'Member ID')),
            TextField(controller: amountCtrl, decoration: const InputDecoration(labelText: 'Amount')),
            TextField(controller: refCtrl, decoration: const InputDecoration(labelText: 'Reference (optional)')),
            TextField(controller: descCtrl, decoration: const InputDecoration(labelText: 'Description (optional)')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(context, true), child: const Text('Collect')),
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
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$feeType collected.')));
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Collection failed: $e')));
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
        PopupMenuButton<String>(
          icon: const Icon(Icons.more_vert),
          onSelected: (v) {
            if (v == 'transfer') _openTransferDialog();
            if (v == 'bulk_deduction') _openBulkDeductionDialog();
          },
          itemBuilder: (_) => [
            const PopupMenuItem(value: 'transfer', child: ListTile(
              leading: Icon(Icons.swap_horiz),
              title: Text('Admin Transfer'),
            )),
            const PopupMenuItem(value: 'bulk_deduction', child: ListTile(
              leading: Icon(Icons.playlist_add_check),
              title: Text('Bulk Case Deduction'),
            )),
          ],
        ),
      ],
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) return Center(child: Text('${snapshot.error}'));
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
                    Tab(text: 'Registration Fees'),
                    Tab(text: 'Renewal Fees'),
                    Tab(text: 'Penalty Fees'),
                    Tab(text: 'Arrears Account'),
                    Tab(text: 'Suspense Account'),
                  ],
                ),
              ),
              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [
                    _RegistrationFeesTab(data: data, money: money, onCollect: () => _openFeeCollectionDialog('Registration'), busy: _busy),
                    _RenewalFeesTab(data: data, money: money, onCollect: () => _openFeeCollectionDialog('Renewal'), busy: _busy),
                    _PenaltyFeesTab(data: data, money: money, onCollect: () => _openFeeCollectionDialog('Penalty'), busy: _busy),
                    _ArrearsAccountTab(data: data, money: money, busy: _busy),
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

  const _SummaryCard({required this.title, required this.value, required this.icon});

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
                Text(title, style: const TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
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

  const _RegistrationFeesTab({required this.data, required this.money, required this.onCollect, required this.busy});

  @override
  Widget build(BuildContext context) {
    final registrationTotal = (data['registration_fees_total'] as num?)?.toDouble() ?? 0;
    final registrationCount = (data['registration_fees_count'] as num?)?.toInt() ?? 0;

    return ListView(
      padding: const EdgeInsets.all(AppConstants.marginEdge),
      children: [
        _SummaryCard(
          title: 'Registration Fees',
          value: money.format(registrationTotal),
          icon: Icons.assignment_ind,
        ),
        const SizedBox(height: 8),
        Text('$registrationCount transactions', style: const TextStyle(color: Color(0xFF64748B))),
        const SizedBox(height: 16),
        if (registrationCount == 0)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Center(child: Text('No registration fees transactions found.')),
            ),
          ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: busy ? null : onCollect,
          icon: const Icon(Icons.add),
          label: const Text('Collect Registration Fee'),
        ),
      ],
    );
  }
}

class _RenewalFeesTab extends StatelessWidget {
  final Map<String, dynamic> data;
  final NumberFormat money;
  final VoidCallback onCollect;
  final bool busy;

  const _RenewalFeesTab({required this.data, required this.money, required this.onCollect, required this.busy});

  @override
  Widget build(BuildContext context) {
    final renewalTotal = (data['renewal_fees_total'] as num?)?.toDouble() ?? 0;
    final renewalCount = (data['renewal_fees_count'] as num?)?.toInt() ?? 0;

    return ListView(
      padding: const EdgeInsets.all(AppConstants.marginEdge),
      children: [
        _SummaryCard(
          title: 'Renewal Fees',
          value: money.format(renewalTotal),
          icon: Icons.restart_alt,
        ),
        const SizedBox(height: 8),
        Text('$renewalCount transactions', style: const TextStyle(color: Color(0xFF64748B))),
        const SizedBox(height: 16),
        if (renewalCount == 0)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Center(child: Text('No renewal fees transactions found.')),
            ),
          ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: busy ? null : onCollect,
          icon: const Icon(Icons.add),
          label: const Text('Collect Renewal Fee'),
        ),
      ],
    );
  }
}

class _PenaltyFeesTab extends StatelessWidget {
  final Map<String, dynamic> data;
  final NumberFormat money;
  final VoidCallback onCollect;
  final bool busy;

  const _PenaltyFeesTab({required this.data, required this.money, required this.onCollect, required this.busy});

  @override
  Widget build(BuildContext context) {
    final penaltyTotal = (data['penalty_fees_total'] as num?)?.toDouble() ?? 0;
    final penaltyCount = (data['penalty_fees_count'] as num?)?.toInt() ?? 0;

    return ListView(
      padding: const EdgeInsets.all(AppConstants.marginEdge),
      children: [
        _SummaryCard(
          title: 'Penalty Fees',
          value: money.format(penaltyTotal),
          icon: Icons.warning_amber,
        ),
        const SizedBox(height: 8),
        Text('$penaltyCount transactions', style: const TextStyle(color: Color(0xFF64748B))),
        const SizedBox(height: 16),
        if (penaltyCount == 0)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Center(child: Text('No penalty fees transactions found.')),
            ),
          ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: busy ? null : onCollect,
          icon: const Icon(Icons.add),
          label: const Text('Collect Penalty Fee'),
        ),
      ],
    );
  }
}

class _ArrearsAccountTab extends StatelessWidget {
  final Map<String, dynamic> data;
  final NumberFormat money;
  final bool busy;

  const _ArrearsAccountTab({required this.data, required this.money, required this.busy});

  @override
  Widget build(BuildContext context) {
    final arrearsTotal = (data['arrears_total'] as num?)?.toDouble() ?? 0;
    final arrearsCount = (data['arrears_count'] as num?)?.toInt() ?? 0;

    return ListView(
      padding: const EdgeInsets.all(AppConstants.marginEdge),
      children: [
        _SummaryCard(
          title: 'Arrears Account',
          value: money.format(arrearsTotal),
          icon: Icons.account_balance,
        ),
        const SizedBox(height: 8),
        Text('$arrearsCount outstanding items', style: const TextStyle(color: Color(0xFF64748B))),
        const SizedBox(height: 16),
        if (arrearsCount == 0)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Center(child: Text('No outstanding arrears.')),
            ),
          ),
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
    final suspenseCount = (data['suspense_pending_count'] as num?)?.toInt() ?? 0;
    final suspenseAmount = (data['suspense_pending_amount'] as num?)?.toDouble() ?? 0;

    return ListView(
      padding: const EdgeInsets.all(AppConstants.marginEdge),
      children: [
        _SummaryCard(
          title: 'Suspense Account',
          value: money.format(suspenseAmount),
          icon: Icons.pending_actions,
        ),
        const SizedBox(height: 8),
        Text('$suspenseCount items awaiting review', style: const TextStyle(color: Color(0xFF64748B))),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: () => context.go('/admin/suspense-queue'),
          icon: const Icon(Icons.open_in_new),
          label: const Text('Open Suspense Queue'),
        ),
      ],
    );
  }
}
