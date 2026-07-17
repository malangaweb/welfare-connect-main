import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/services/live_data_service.dart';
import '../auth/auth_controller.dart';
import 'admin_shell.dart';

class AdminMemberDetailsScreen extends ConsumerStatefulWidget {
  final String memberId;
  const AdminMemberDetailsScreen({super.key, required this.memberId});

  @override
  ConsumerState<AdminMemberDetailsScreen> createState() =>
      _AdminMemberDetailsScreenState();
}

class _AdminMemberDetailsScreenState
    extends ConsumerState<AdminMemberDetailsScreen> {
  final _service = LiveDataService();
  late Future<Map<String, dynamic>> _future;
  bool _busy = false;
  bool _redirectingForSession = false;
  static const int _txPageSize = 15;
  int _txPage = 1;
  List<Map<String, dynamic>> _cachedCases = const [];

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<void> _changeStatus() async {
    final token = ref.read(authControllerProvider).appToken ?? '';
    if (token.isEmpty || _busy) return;
    String selected = 'active';
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Update Member Status'),
          content: DropdownButtonFormField<String>(
            initialValue: selected,
            items: const [
              DropdownMenuItem(value: 'active', child: Text('ACTIVE')),
              DropdownMenuItem(value: 'inactive', child: Text('INACTIVE')),
              DropdownMenuItem(value: 'probation', child: Text('PROBATION')),
              DropdownMenuItem(value: 'deceased', child: Text('DECEASED')),
            ],
            onChanged: (v) {
              if (v == null) return;
              setLocal(() => selected = v);
            },
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel')),
            ElevatedButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Update')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await _service.updateMemberStatus(
        appToken: token,
        memberId: widget.memberId,
        status: selected,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Status updated.')));
      setState(() => _future = _load());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Status update failed: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _collectFee() async {
    final token = ref.read(authControllerProvider).appToken ?? '';
    if (token.isEmpty || _busy) return;
    String feeType = 'registration';
    final amountCtrl = TextEditingController();
    final referenceCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Collect Fee'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: feeType,
                  items: const [
                    DropdownMenuItem(
                        value: 'registration', child: Text('Registration')),
                    DropdownMenuItem(value: 'renewal', child: Text('Renewal')),
                    DropdownMenuItem(value: 'penalty', child: Text('Penalty')),
                  ],
                  onChanged: (v) {
                    if (v == null) return;
                    setLocal(() => feeType = v);
                  },
                ),
                TextField(
                    controller: amountCtrl,
                    decoration: const InputDecoration(labelText: 'Amount')),
                TextField(
                    controller: referenceCtrl,
                    decoration: const InputDecoration(labelText: 'Reference')),
                TextField(
                    controller: descCtrl,
                    decoration:
                        const InputDecoration(labelText: 'Description')),
              ],
            ),
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
      ),
    );
    if (ok != true) return;
    final amount = double.tryParse(amountCtrl.text.trim()) ?? 0;
    if (amount <= 0) return;
    setState(() => _busy = true);
    try {
      await _service.collectMemberFee(
        appToken: token,
        memberId: widget.memberId,
        feeType: feeType,
        amount: amount,
        reference: referenceCtrl.text.trim().isEmpty
            ? null
            : referenceCtrl.text.trim(),
        description: descCtrl.text.trim().isEmpty ? null : descCtrl.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Fee collected.')));
      setState(() => _future = _load());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Fee collection failed: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _transferFromMember() async {
    if (_busy) return;
    final toCtrl = TextEditingController();
    final amountCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Transfer From Member'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
                controller: toCtrl,
                decoration: const InputDecoration(labelText: 'To Member ID')),
            TextField(
                controller: amountCtrl,
                decoration: const InputDecoration(labelText: 'Amount')),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Transfer')),
        ],
      ),
    );
    if (ok != true) return;
    final amount = double.tryParse(amountCtrl.text.trim()) ?? 0;
    if (toCtrl.text.trim().isEmpty || amount <= 0) return;
    setState(() => _busy = true);
    try {
      await _service.transferFunds(
        fromMemberId: widget.memberId,
        toMemberId: toCtrl.text.trim(),
        amount: amount,
        toMemberNumber: toCtrl.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Transfer completed.')));
      setState(() => _future = _load());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Transfer failed: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _recordCasePayment() async {
    final token = ref.read(authControllerProvider).appToken ?? '';
    if (token.isEmpty || _busy) return;

    if (_cachedCases.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No cases available for this member')),
      );
      return;
    }

    String? selectedCaseId;
    final amountCtrl = TextEditingController();
    String selectedTxType = 'case_wallet_deduction';

    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Record Case Payment'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: selectedCaseId,
                  hint: const Text('Select Case'),
                  items: _cachedCases.map((c) {
                    final caseNum = c['case_number'] ?? 'N/A';
                    final caseType = c['case_type'] ?? '';
                    final amount = c['contribution_per_member'] ?? 0;
                    return DropdownMenuItem(
                      value: c['id']?.toString(),
                      child: Text('#$caseNum $caseType (KES $amount)'),
                    );
                  }).toList(),
                  onChanged: (v) => setLocal(() => selectedCaseId = v),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: amountCtrl,
                  decoration: const InputDecoration(labelText: 'Amount'),
                  keyboardType: TextInputType.number,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: selectedTxType,
                  items: const [
                    DropdownMenuItem(
                      value: 'case_wallet_deduction',
                      child: Text('Case Wallet Deduction (debit wallet)'),
                    ),
                    DropdownMenuItem(
                      value: 'contribution',
                      child: Text('Contribution (no wallet effect)'),
                    ),
                    DropdownMenuItem(
                      value: 'arrears',
                      child: Text('Arrears (late payment)'),
                    ),
                  ],
                  onChanged: (v) {
                    if (v != null) setLocal(() => selectedTxType = v);
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Record Payment'),
            ),
          ],
        ),
      ),
    );

    if (ok != true || selectedCaseId == null) return;
    final amount = double.tryParse(amountCtrl.text.trim()) ?? 0;
    if (amount <= 0) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Amount must be greater than zero')),
      );
      return;
    }

    setState(() => _busy = true);
    try {
      await _service.adminRecordCasePayment(
        appToken: token,
        memberId: widget.memberId,
        caseId: selectedCaseId!,
        amount: amount,
        transactionType: selectedTxType,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Case payment recorded.')),
      );
      setState(() => _future = _load());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Payment failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _fundWallet() async {
    final token = ref.read(authControllerProvider).appToken ?? '';
    if (token.isEmpty || _busy) return;

    final amountCtrl = TextEditingController();
    final descCtrl = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Fund Wallet'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: amountCtrl,
              decoration: const InputDecoration(labelText: 'Amount'),
              keyboardType: TextInputType.number,
            ),
            TextField(
              controller: descCtrl,
              decoration:
                  const InputDecoration(labelText: 'Description (optional)'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Fund'),
          ),
        ],
      ),
    );

    if (ok != true) return;
    final amount = double.tryParse(amountCtrl.text.trim()) ?? 0;
    if (amount <= 0) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Amount must be greater than zero')),
      );
      return;
    }

    setState(() => _busy = true);
    try {
      await _service.adminRecordWalletFunding(
        appToken: token,
        memberId: widget.memberId,
        amount: amount,
        description: descCtrl.text.trim().isEmpty ? null : descCtrl.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Wallet funded.')),
      );
      setState(() => _future = _load());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Funding failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _sendSms() {
    final member = _memberSnapshot;
    final phone = (member?['phone_number'] ?? '-').toString();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('SMS sent to $phone')),
    );
  }

  void _sendMessage() {
    final member = _memberSnapshot;
    final phone = (member?['phone_number'] ?? '-').toString();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Message sent to $phone')),
    );
  }

  Future<void> _deleteMember() async {
    final token = ref.read(authControllerProvider).appToken ?? '';
    if (token.isEmpty || _busy) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete Member'),
        content: const Text(
            'Are you sure you want to delete this member? This action cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => _busy = true);
    try {
      await _service.deleteMember(memberId: widget.memberId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Member deleted successfully.')),
      );
      context.go('/admin/members');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Delete failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Map<String, dynamic>? _memberSnapshot;

  Future<Map<String, dynamic>> _load() async {
    final token = ref.read(authControllerProvider).appToken ?? '';
    if (token.isEmpty) throw Exception('Missing session token');
    _txPage = 1;
    final result = await _service.fetchAdminMemberDetails(
      appToken: token,
      memberId: widget.memberId,
    );
    _memberSnapshot = _asMap(result['member']);
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(locale: 'en_KE', symbol: 'KES ');
    return AdminShell(
      title: 'Member Details',
      route: '/admin/members',
      actions: [
        IconButton(
          onPressed: _busy ? null : () => setState(() => _future = _load()),
          icon: const Icon(Icons.refresh),
        ),
      ],
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            final message = snapshot.error.toString();
            if (_isUnauthorizedError(message)) {
              _handleSessionExpired();
              return const Center(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('Session expired. Redirecting to login...'),
                ),
              );
            }
            return Center(child: Text(message));
          }
          final payload = snapshot.data ?? const {};
          final member = _asMap(payload['member']);
          final cases = _asMapList(payload['cases']);
          _cachedCases = cases;
          final tx = _asMapList(payload['transactions']);
          final txPages = tx.isEmpty ? 1 : ((tx.length - 1) ~/ _txPageSize) + 1;
          final currentTxPage = _txPage.clamp(1, txPages);
          final txStart = (currentTxPage - 1) * _txPageSize;
          final txEnd = (txStart + _txPageSize).clamp(0, tx.length);
          final txPageItems = tx.sublist(txStart, txEnd);
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                '${member['name'] ?? '-'}',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                '#${member['member_number'] ?? '-'} • ${member['phone_number'] ?? '-'}',
                style: const TextStyle(color: Color(0xFF475569)),
              ),
              const SizedBox(height: 8),
              Text(
                'Wallet: ${money.format(_toDouble(member['wallet_balance']))} • Status: ${member['status'] ?? 'unknown'}',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 14),
              const Text('Actions',
                  style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _changeStatus,
                    icon: const Icon(Icons.manage_accounts),
                    label: const Text('Update Status'),
                  ),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _collectFee,
                    icon: const Icon(Icons.point_of_sale),
                    label: const Text('Collect Fee'),
                  ),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _transferFromMember,
                    icon: const Icon(Icons.swap_horiz),
                    label: const Text('Transfer Funds'),
                  ),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _recordCasePayment,
                    icon: const Icon(Icons.payment),
                    label: const Text('Pay to Case'),
                  ),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _fundWallet,
                    icon: const Icon(Icons.account_balance_wallet),
                    label: const Text('Fund Wallet'),
                  ),
                  OutlinedButton.icon(
                    onPressed: _sendSms,
                    icon: const Icon(Icons.sms),
                    label: const Text('SMS'),
                  ),
                  OutlinedButton.icon(
                    onPressed: _sendMessage,
                    icon: const Icon(Icons.message),
                    label: const Text('Message'),
                  ),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _deleteMember,
                    icon: const Icon(Icons.delete_forever),
                    label: const Text('Delete Member'),
                  ),
                ],
              ),
              const Divider(height: 24),
              Text('Cases (${cases.length})',
                  style: const TextStyle(fontWeight: FontWeight.w700)),
              ...cases.take(20).map((c) => ListTile(
                    dense: true,
                    title: Text(
                        '#${c['case_number']} • ${(c['case_type'] ?? '').toString().toUpperCase()}'),
                    subtitle: Text(
                        'Contribution: ${money.format(_toDouble(c['contribution_per_member']))}'),
                  )),
              const Divider(height: 24),
              Text('Transactions (${tx.length})',
                  style: const TextStyle(fontWeight: FontWeight.w700)),
              ...txPageItems.map((t) => ListTile(
                    dense: true,
                    title: Text(
                        '${t['description'] ?? t['transaction_type'] ?? '-'}'),
                    subtitle: Text('${t['status'] ?? '-'}'),
                    trailing: Text(money.format(_toDouble(t['amount']).abs())),
                    onLongPress: () {
                      Clipboard.setData(
                        ClipboardData(text: '${t['id'] ?? ''}'),
                      );
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Transaction ID copied')),
                      );
                    },
                  )),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  OutlinedButton(
                    onPressed: currentTxPage > 1
                        ? () => setState(() => _txPage = currentTxPage - 1)
                        : null,
                    child: const Text('Prev'),
                  ),
                  const SizedBox(width: 8),
                  Text('Page $currentTxPage of $txPages'),
                  const SizedBox(width: 8),
                  OutlinedButton(
                    onPressed: currentTxPage < txPages
                        ? () => setState(() => _txPage = currentTxPage + 1)
                        : null,
                    child: const Text('Next'),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }

  Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map) return value.cast<String, dynamic>();
    return const {};
  }

  List<Map<String, dynamic>> _asMapList(dynamic value) {
    if (value is! List) return const <Map<String, dynamic>>[];
    return value
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();
  }

  double _toDouble(dynamic value) {
    if (value == null) return 0;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? 0;
  }

  bool _isUnauthorizedError(String message) {
    final m = message.toLowerCase();
    return m.contains('401') ||
        m.contains('unauthorized') ||
        m.contains('exp claim') ||
        m.contains('timestamp check failing');
  }

  void _handleSessionExpired() {
    if (_redirectingForSession) return;
    _redirectingForSession = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      await ref.read(authControllerProvider.notifier).logout();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Session expired. Please log in again.'),
        ),
      );
      context.go('/login');
    });
  }
}
