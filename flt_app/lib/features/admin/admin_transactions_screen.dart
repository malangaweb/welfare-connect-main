import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/live_data_service.dart';
import '../../core/widgets/async_error_view.dart';
import '../auth/auth_controller.dart';
import 'admin_shell.dart';

class AdminTransactionsScreen extends ConsumerStatefulWidget {
  const AdminTransactionsScreen({super.key});

  @override
  ConsumerState<AdminTransactionsScreen> createState() =>
      _AdminTransactionsScreenState();
}

class _AdminTransactionsScreenState
    extends ConsumerState<AdminTransactionsScreen> {
  final _service = LiveDataService();
  final _searchCtrl = TextEditingController();
  static const _pageSize = 20;
  int _page = 1;
  bool _hasMore = false;
  String _search = '';
  String _typeFilter = 'all';
  String _statusFilter = 'all';
  final Set<String> _selected = <String>{};
  bool _bulkBusy = false;
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _future = _loadPage();
  }

  Future<List<Map<String, dynamic>>> _loadPage() async {
    final rows = await _service
        .fetchAdminTransactions(
          page: _page,
          pageSize: _pageSize,
          search: _search,
        )
        .timeout(const Duration(seconds: 20));
    _hasMore = rows.length == _pageSize;
    return rows;
  }

  Future<void> _refresh() async {
    setState(() => _future = _loadPage());
    await _future;
  }

  void _toggleSelectAll(List<Map<String, dynamic>> rows) {
    final ids = rows
        .where((tx) => '${tx['status'] ?? ''}'.toLowerCase() != 'reversed')
        .map((tx) => '${tx['id'] ?? ''}')
        .where((id) => id.isNotEmpty)
        .toSet();
    setState(() {
      if (ids.isNotEmpty && ids.every(_selected.contains)) {
        _selected.removeAll(ids);
      } else {
        _selected.addAll(ids);
      }
    });
  }

  void _toggleTransactionSelection(String id) {
    if (id.isEmpty) return;
    setState(() {
      if (!_selected.add(id)) _selected.remove(id);
    });
  }

  Future<void> _reverseTransaction(Map<String, dynamic> tx) async {
    final reasonCtrl = TextEditingController();
    final txId = (tx['id'] ?? '').toString();
    if (txId.isEmpty) return;

    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Reverse Transaction'),
        content: TextField(
          controller: reasonCtrl,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Reason',
            hintText: 'Provide reversal reason',
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Reverse')),
        ],
      ),
    );

    if (ok != true || reasonCtrl.text.trim().isEmpty) return;

    try {
      final adminId = ref.read(authControllerProvider).user?.id;
      await _service.reverseTransaction(
        transactionId: txId,
        reason: reasonCtrl.text.trim(),
        adminUserId: adminId,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Transaction reversed successfully.')),
      );
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Reversal failed: $e')),
      );
    }
  }

  Future<void> _editTransaction(Map<String, dynamic> tx) async {
    final txId = (tx['id'] ?? '').toString();
    if (txId.isEmpty) return;

    final descCtrl =
        TextEditingController(text: tx['description']?.toString() ?? '');
    final caseIdCtrl =
        TextEditingController(text: tx['case_id']?.toString() ?? '');

    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Edit Transaction'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: descCtrl,
              decoration: const InputDecoration(
                labelText: 'Description',
                hintText: 'Enter transaction description',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: caseIdCtrl,
              decoration: const InputDecoration(
                labelText: 'Link to Case (optional)',
                hintText: 'Enter case ID or leave empty',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Save')),
        ],
      ),
    );

    if (ok != true) return;

    try {
      await _service.updateTransactionDescription(
        transactionId: txId,
        description: descCtrl.text.trim(),
        caseId: caseIdCtrl.text.trim().isEmpty ? null : caseIdCtrl.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Transaction updated successfully.')),
      );
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Update failed: $e')),
      );
    }
  }

  Future<void> _bulkReverse() async {
    if (_selected.isEmpty || _bulkBusy) return;
    final reasonCtrl = TextEditingController(text: 'Bulk reversal');
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Bulk Reverse'),
        content: TextField(
          controller: reasonCtrl,
          maxLines: 3,
          decoration: const InputDecoration(labelText: 'Reason'),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Run')),
        ],
      ),
    );
    if (ok != true || reasonCtrl.text.trim().isEmpty) return;

    setState(() => _bulkBusy = true);
    int success = 0;
    int failed = 0;
    final adminId = ref.read(authControllerProvider).user?.id;
    final currentRows = await _future;
    for (final tx in currentRows) {
      final id = '${tx['id'] ?? ''}';
      final reversed = '${tx['status']}'.toLowerCase() == 'reversed';
      if (!_selected.contains(id) || reversed) continue;
      try {
        await _service.reverseTransaction(
          transactionId: id,
          reason: reasonCtrl.text.trim(),
          adminUserId: adminId,
        );
        success += 1;
      } catch (_) {
        failed += 1;
      }
    }
    if (!mounted) return;
    setState(() {
      _selected.clear();
      _bulkBusy = false;
      _future = _loadPage();
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
          content:
              Text('Bulk reverse done. Success: $success, Failed: $failed')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(
        locale: 'en_KE', symbol: 'KES ', decimalDigits: 2);
    return AdminShell(
      title: 'Transactions',
      route: '/admin/transactions',
      actions: [
        IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh)),
      ],
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return AsyncErrorView(
              error: snapshot.error,
              onRetry: _refresh,
            );
          }
          final rows = snapshot.data ?? const [];
          final filteredRows = rows.where((r) {
            final type = '${r['transaction_type'] ?? ''}'.toLowerCase();
            final status = '${r['status'] ?? ''}'.toLowerCase();
            if (_typeFilter != 'all' && type != _typeFilter) return false;
            if (_statusFilter != 'all' && status != _statusFilter) return false;
            return true;
          }).toList();
          final selectableRows = filteredRows
              .where(
                  (tx) => '${tx['status'] ?? ''}'.toLowerCase() != 'reversed')
              .toList();
          final allSelected = selectableRows.isNotEmpty &&
              selectableRows
                  .every((tx) => _selected.contains('${tx['id'] ?? ''}'));
          return ListView(
            padding: const EdgeInsets.all(AppConstants.marginEdge),
            children: [
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _searchCtrl,
                      decoration: InputDecoration(
                        hintText: 'Search description, type, status, method',
                        prefixIcon: const Icon(Icons.search),
                        suffixIcon: _search.isEmpty
                            ? null
                            : IconButton(
                                icon: const Icon(Icons.clear),
                                onPressed: () {
                                  _searchCtrl.clear();
                                  setState(() {
                                    _search = '';
                                    _page = 1;
                                    _selected.clear();
                                    _future = _loadPage();
                                  });
                                },
                              ),
                      ),
                      onSubmitted: (value) {
                        setState(() {
                          _search = value.trim();
                          _page = 1;
                          _selected.clear();
                          _future = _loadPage();
                        });
                      },
                    ),
                  ),
                  const SizedBox(width: 6),
                  Badge(
                    isLabelVisible:
                        _typeFilter != 'all' || _statusFilter != 'all',
                    child: PopupMenuButton<String>(
                      tooltip: 'Transaction filters',
                      icon: const Icon(Icons.tune),
                      onSelected: (value) {
                        final parts = value.split(':');
                        setState(() {
                          if (parts.first == 'type' && parts.length == 2) {
                            _typeFilter = parts[1];
                          } else if (parts.first == 'status' &&
                              parts.length == 2) {
                            _statusFilter = parts[1];
                          } else if (value == 'reset') {
                            _typeFilter = 'all';
                            _statusFilter = 'all';
                          }
                          _selected.clear();
                        });
                      },
                      itemBuilder: (context) => [
                        const PopupMenuItem<String>(
                            enabled: false, child: Text('Type')),
                        ...[
                          ('all', 'All Types'),
                          ('contribution', 'Contribution'),
                          ('contribution_refund', 'Contribution Refund'),
                          ('disbursement', 'Disbursement'),
                          ('registration', 'Registration Fee'),
                          ('renewal', 'Renewal Fee'),
                          ('penalty', 'Penalty'),
                          ('arrears', 'Arrears'),
                          ('wallet_funding', 'Wallet Funding'),
                        ].map((option) => CheckedPopupMenuItem<String>(
                              value: 'type:${option.$1}',
                              checked: _typeFilter == option.$1,
                              child: Text(option.$2),
                            )),
                        const PopupMenuDivider(),
                        const PopupMenuItem<String>(
                            enabled: false, child: Text('Status')),
                        ...[
                          ('all', 'All Status'),
                          ('completed', 'Completed'),
                          ('pending', 'Pending'),
                          ('reversed', 'Reversed'),
                        ].map((option) => CheckedPopupMenuItem<String>(
                              value: 'status:${option.$1}',
                              checked: _statusFilter == option.$1,
                              child: Text(option.$2),
                            )),
                        const PopupMenuDivider(),
                        const PopupMenuItem<String>(
                            value: 'reset', child: Text('Reset filters')),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              InkWell(
                onTap: selectableRows.isEmpty
                    ? null
                    : () => _toggleSelectAll(selectableRows),
                child: Text(
                  allSelected ? 'Deselect all' : 'Select all',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.primary,
                    decoration: TextDecoration.underline,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(height: 4),
              if (_selected.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Expanded(child: Text('${_selected.length} selected')),
                      InkWell(
                        onTap: () => setState(_selected.clear),
                        child: Text(
                          'Clear',
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.primary,
                            decoration: TextDecoration.underline,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      InkWell(
                        onTap: _bulkBusy ? null : _bulkReverse,
                        child: Text(
                          'Reverse',
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.primary,
                            decoration: TextDecoration.underline,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 6),
              if (filteredRows.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(bottom: 10),
                  child: Text(
                    'No transactions match current filters.',
                    style: TextStyle(color: Color(0xFF64748B)),
                  ),
                ),
              if (filteredRows.isNotEmpty)
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    showCheckboxColumn: false,
                    headingRowHeight: 44,
                    dataRowMinHeight: 40,
                    dataRowMaxHeight: 44,
                    columns: const [
                      DataColumn(label: Text('Transaction')),
                      DataColumn(label: Text('Amount'), numeric: true),
                      DataColumn(label: Text('Method')),
                      DataColumn(label: Text('Status')),
                      DataColumn(label: Text('Actions')),
                    ],
                    rows: filteredRows.map((tx) {
                      final date = DateTime.tryParse('${tx['created_at']}');
                      final amount = (tx['amount'] as num?)?.toDouble() ??
                          double.tryParse('${tx['amount']}') ??
                          0;
                      final status = '${tx['status'] ?? '-'}';
                      final reversed = status.toLowerCase() == 'reversed';
                      final id = '${tx['id'] ?? ''}';
                      return DataRow(
                        selected: _selected.contains(id),
                        onSelectChanged: reversed
                            ? null
                            : (_) => _toggleTransactionSelection(id),
                        cells: [
                          DataCell(
                            SizedBox(
                              width: 250,
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${tx['description'] ?? tx['transaction_type'] ?? '-'}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w600),
                                  ),
                                  Text(
                                    '${tx['transaction_type'] ?? '-'} • ${date == null ? '-' : DateFormat('MMM d, yyyy • h:mm a').format(date.toLocal())}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style:
                                        Theme.of(context).textTheme.bodySmall,
                                  ),
                                ],
                              ),
                            ),
                          ),
                          DataCell(Text(money.format(amount.abs()))),
                          DataCell(Text('${tx['payment_method'] ?? '-'}')),
                          DataCell(Text(status.toUpperCase())),
                          DataCell(
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconButton(
                                  tooltip: 'Edit transaction',
                                  visualDensity: VisualDensity.compact,
                                  onPressed: () => _editTransaction(tx),
                                  icon: const Icon(Icons.edit_outlined),
                                ),
                                if (!reversed)
                                  IconButton(
                                    tooltip: 'Reverse transaction',
                                    visualDensity: VisualDensity.compact,
                                    onPressed: () => _reverseTransaction(tx),
                                    icon: const Icon(Icons.undo),
                                  ),
                              ],
                            ),
                          ),
                        ],
                      );
                    }).toList(),
                  ),
                ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${filteredRows.length} shown • Page $_page',
                      style: const TextStyle(color: Color(0xFF64748B)),
                    ),
                  ),
                  OutlinedButton(
                    onPressed: _page > 1
                        ? () {
                            setState(() {
                              _page -= 1;
                              _selected.clear();
                              _future = _loadPage();
                            });
                          }
                        : null,
                    child: const Text('Prev'),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton(
                    onPressed: _hasMore
                        ? () {
                            setState(() {
                              _page += 1;
                              _selected.clear();
                              _future = _loadPage();
                            });
                          }
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
}
