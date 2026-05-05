import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/live_data_service.dart';
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
  static const _pageSize = 10;
  int _page = 1;
  bool _hasMore = false;
  String _search = '';
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
    final rows = await _service.fetchAdminTransactions(
      page: _page,
      pageSize: _pageSize,
      search: _search,
    );
    _hasMore = rows.length == _pageSize;
    return rows;
  }

  Future<void> _refresh() async {
    setState(() => _future = _loadPage());
    await _future;
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
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(context, true), child: const Text('Reverse')),
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

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(
        locale: 'en_KE', symbol: 'KES ', decimalDigits: 2);
    return AdminShell(
      title: 'Transactions',
      currentIndex: 3,
      actions: [
        IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh))
      ],
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text(snapshot.error.toString()));
          }
          final rows = snapshot.data ?? const [];
          return ListView(
            padding: const EdgeInsets.all(AppConstants.marginEdge),
            children: [
              Text(
                'Transaction Ledger',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Admin / Transactions',
                style: TextStyle(
                  color: Color(0xFF64748B),
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Page $_page',
                style: const TextStyle(color: Color(0xFF64748B)),
              ),
              const SizedBox(height: 10),
              TextField(
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
                              _future = _loadPage();
                            });
                          },
                        ),
                ),
                onSubmitted: (value) {
                  setState(() {
                    _search = value.trim();
                    _page = 1;
                    _future = _loadPage();
                  });
                },
              ),
              const SizedBox(height: 14),
              ...rows.map((r) {
                final date = DateTime.tryParse('${r['created_at']}');
                final amount = (r['amount'] as num?)?.toDouble() ??
                    double.tryParse('${r['amount']}') ??
                    0;
                final reversed = '${r['status']}'.toLowerCase() == 'reversed';
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: const BorderSide(color: Color(0xFFE2E8F0)),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${r['description'] ?? r['transaction_type'] ?? '-'}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 15,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                '${r['transaction_type'] ?? '-'} • ${date == null ? '-' : DateFormat('MMM d, yyyy • h:mm a').format(date.toLocal())}',
                                style: const TextStyle(color: Color(0xFF64748B)),
                              ),
                              const SizedBox(height: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(999),
                                  color: reversed
                                      ? const Color(0xFFFEE2E2)
                                      : const Color(0xFFDCFCE7),
                                ),
                                child: Text(
                                  '${r['status'] ?? '-'}'.toUpperCase(),
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: reversed
                                        ? const Color(0xFFB91C1C)
                                        : const Color(0xFF166534),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              money.format(amount.abs()),
                              style: const TextStyle(fontWeight: FontWeight.w700),
                            ),
                            if (!reversed)
                              TextButton(
                                onPressed: () => _reverseTransaction(r),
                                child: const Text('Reverse'),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              }),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  OutlinedButton(
                    onPressed: _page > 1
                        ? () {
                            setState(() {
                              _page -= 1;
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
