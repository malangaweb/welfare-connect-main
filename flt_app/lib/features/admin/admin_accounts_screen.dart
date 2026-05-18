import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/services/live_data_service.dart';
import '../auth/auth_controller.dart';
import 'admin_shell.dart';

class AdminAccountsScreen extends ConsumerStatefulWidget {
  const AdminAccountsScreen({super.key});

  @override
  ConsumerState<AdminAccountsScreen> createState() => _AdminAccountsScreenState();
}

class _AdminAccountsScreenState extends ConsumerState<AdminAccountsScreen> {
  final _service = LiveDataService();
  late Future<Map<String, dynamic>> _future;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Map<String, dynamic>> _load() async {
    final token = ref.read(authControllerProvider).appToken ?? '';
    if (token.isEmpty) throw Exception('Missing session token');
    return _service.fetchAccountsSummary(appToken: token);
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
      setState(() => _future = _load());
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

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(locale: 'en_KE', symbol: 'KES ');
    return AdminShell(
      title: 'Accounts',
      currentIndex: 3,
      actions: [
        IconButton(onPressed: _busy ? null : _openTransferDialog, icon: const Icon(Icons.swap_horiz)),
        IconButton(onPressed: _busy ? null : _openBulkDeductionDialog, icon: const Icon(Icons.playlist_add_check)),
      ],
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) return Center(child: Text('$snapshot'));
          final a = snapshot.data ?? const {};
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _tile('Active Members', '${a['active_members'] ?? 0}'),
              _tile('Total Members', '${a['total_members'] ?? 0}'),
              _tile('Wallet Balance Total', money.format((a['wallet_balance_total'] as num?)?.toDouble() ?? 0)),
              _tile('Contributions Total', money.format((a['contributions_total'] as num?)?.toDouble() ?? 0)),
              _tile('Wallet Funding Total', money.format((a['wallet_funding_total'] as num?)?.toDouble() ?? 0)),
              _tile('Refunds Total', money.format((a['refunds_total'] as num?)?.toDouble() ?? 0)),
              _tile('Suspense Pending Count', '${a['suspense_pending_count'] ?? 0}'),
              _tile('Suspense Pending Amount', money.format((a['suspense_pending_amount'] as num?)?.toDouble() ?? 0)),
            ],
          );
        },
      ),
    );
  }

  Widget _tile(String label, String value) {
    return Card(
      child: ListTile(
        title: Text(label),
        trailing: Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }
}

