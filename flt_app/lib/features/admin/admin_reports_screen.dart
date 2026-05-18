import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/live_data_service.dart';
import '../auth/auth_controller.dart';
import 'admin_shell.dart';

class AdminReportsScreen extends ConsumerStatefulWidget {
  const AdminReportsScreen({super.key});

  @override
  ConsumerState<AdminReportsScreen> createState() => _AdminReportsScreenState();
}

class _AdminReportsScreenState extends ConsumerState<AdminReportsScreen> {
  final LiveDataService _service = LiveDataService();
  late Future<Map<String, dynamic>> _future;
  late Future<List<Map<String, dynamic>>> _txFuture;
  String _typeFilter = 'all';
  String _search = '';

  @override
  void initState() {
    super.initState();
    _future = _load();
    _txFuture = _service.fetchAdminTransactions(page: 1, pageSize: 500);
  }

  Future<Map<String, dynamic>> _load() async {
    final token = ref.read(authControllerProvider).appToken;
    if (token == null || token.isEmpty) {
      throw Exception('Missing session token');
    }
    return _service.fetchReportsSummary(appToken: token);
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(locale: 'en_KE', symbol: 'KES ');
    return AdminShell(
      title: 'Reports',
      currentIndex: 5,
      actions: [
        IconButton(
          onPressed: () => setState(() {
            _future = _load();
            _txFuture = _service.fetchAdminTransactions(page: 1, pageSize: 500);
          }),
          icon: const Icon(Icons.refresh),
        ),
      ],
      body: FutureBuilder<List<dynamic>>(
        future: Future.wait<dynamic>([_future, _txFuture]),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting || !snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Failed to load reports: ${snapshot.error}'));
          }
          final data = (snapshot.data![0] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
          final tx = (snapshot.data![1] as List?)?.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList() ?? const <Map<String, dynamic>>[];
          final filtered = tx.where((t) {
            final type = '${t['transaction_type'] ?? ''}'.toLowerCase();
            if (_typeFilter != 'all' && type != _typeFilter) return false;
            if (_search.isNotEmpty) {
              final hay = '${t['description'] ?? ''} ${t['status'] ?? ''} $type'.toLowerCase();
              if (!hay.contains(_search.toLowerCase())) return false;
            }
            return true;
          }).toList();
          final discipline =
              (data['discipline'] as Map?)?.cast<String, dynamic>() ?? const {};
          return ListView(
            padding: const EdgeInsets.all(AppConstants.marginEdge),
            children: [
              Text(
                'Reports & Insights',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Operational metrics, discipline status, and quick export.',
                style: TextStyle(
                  color: Color(0xFF64748B),
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Column(
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: _typeFilter,
                      decoration: const InputDecoration(labelText: 'Transaction Type', isDense: true),
                      items: const [
                        DropdownMenuItem(value: 'all', child: Text('All')),
                        DropdownMenuItem(value: 'wallet_funding', child: Text('Wallet funding')),
                        DropdownMenuItem(value: 'contribution', child: Text('Contribution')),
                        DropdownMenuItem(value: 'case_wallet_deduction', child: Text('Case deduction')),
                        DropdownMenuItem(value: 'arrears', child: Text('Arrears')),
                        DropdownMenuItem(value: 'penalty', child: Text('Penalty')),
                        DropdownMenuItem(value: 'disbursement', child: Text('Disbursement')),
                      ],
                      onChanged: (v) {
                        if (v == null) return;
                        setState(() => _typeFilter = v);
                      },
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      onChanged: (v) => setState(() => _search = v.trim()),
                      decoration: const InputDecoration(
                        isDense: true,
                        labelText: 'Search',
                        prefixIcon: Icon(Icons.search),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Align(
                      alignment: Alignment.centerRight,
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final messenger = ScaffoldMessenger.of(context);
                          final csv = _toCsv(filtered);
                          await Clipboard.setData(ClipboardData(text: csv));
                          if (!mounted) return;
                          messenger.showSnackBar(
                            SnackBar(content: Text('Excel-ready CSV copied (${filtered.length} rows).')),
                          );
                        },
                        icon: const Icon(Icons.file_download),
                        label: const Text('Export CSV (Excel)'),
                      ),
                    ),
                  ],
                ),
              ),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  _tile('Total Members', '${data['total_members'] ?? 0}', icon: Icons.group),
                  _tile('Active Members', '${data['active_members'] ?? 0}', icon: Icons.verified_user),
                  _tile('Total Cases', '${data['total_cases'] ?? 0}', icon: Icons.folder),
                  _tile('Active Cases', '${data['active_cases'] ?? 0}', icon: Icons.assignment_turned_in),
                  _tile('Transactions', '${data['total_transactions'] ?? 0}', icon: Icons.receipt_long),
                  _tile('Defaulters', '${data['defaulter_count'] ?? 0}', icon: Icons.warning_amber_rounded),
                  _tile('Monthly Collection', money.format(_toDouble(data['monthly_collection'])), icon: Icons.trending_up),
                  _tile('Suspense Pending', '${data['suspense_pending_count'] ?? 0}', icon: Icons.pending_actions),
                  _tile(
                    'Suspense Amount',
                    money.format(_toDouble(data['suspense_pending_amount'])),
                    icon: Icons.account_balance_wallet,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text('Filtered Transactions (${filtered.length})',
                  style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              if (filtered.isEmpty)
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: const Text(
                    'No transactions match current filters.',
                    style: TextStyle(color: Color(0xFF64748B)),
                  ),
                )
              else
                ...filtered.take(20).map((t) => Card(
                      elevation: 0,
                      margin: const EdgeInsets.only(bottom: 8),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: const BorderSide(color: Color(0xFFE2E8F0)),
                      ),
                      child: ListTile(
                        dense: true,
                        title: Text('${t['description'] ?? t['transaction_type'] ?? '-'}'),
                        subtitle: Text('${t['status'] ?? '-'}'.toUpperCase()),
                        trailing: Text(
                          money.format(_toDouble(t['amount']).abs()),
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                    )),
              const SizedBox(height: 16),
              Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Discipline Metrics',
                        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                      ),
                      const SizedBox(height: 12),
                      Text('Active: ${discipline['active_count'] ?? 0}'),
                      Text('Inactive: ${discipline['inactive_count'] ?? 0}'),
                      Text('Probation: ${discipline['probation_count'] ?? 0}'),
                      Text('Deceased: ${discipline['deceased_count'] ?? 0}'),
                      Text('Auto-inactive (month): ${discipline['monthly_auto_inactive'] ?? 0}'),
                      Text('Reinstatements (month): ${discipline['monthly_reinstatements'] ?? 0}'),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  String _toCsv(List<Map<String, dynamic>> rows) {
    final headers = [
      'id',
      'member_id',
      'amount',
      'transaction_type',
      'status',
      'payment_method',
      'description',
      'created_at',
    ];
    final lines = <String>[headers.join(',')];
    for (final r in rows) {
      final values = headers.map((h) {
        final raw = '${r[h] ?? ''}'.replaceAll('"', '""');
        return '"$raw"';
      }).join(',');
      lines.add(values);
    }
    return lines.join('\n');
  }

  Widget _tile(String label, String value, {required IconData icon}) {
    return SizedBox(
      width: 220,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFFEFF6FF),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, size: 18, color: const Color(0xFF1F3556)),
            ),
            const SizedBox(height: 10),
            Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
            const SizedBox(height: 4),
            Text(
              label,
              style: const TextStyle(
                color: Color(0xFF64748B),
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  double _toDouble(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0;
  }
}
