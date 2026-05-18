import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/services/live_data_service.dart';
import '../auth/auth_controller.dart';
import 'admin_shell.dart';

class AdminCaseDetailsScreen extends ConsumerStatefulWidget {
  final String caseId;
  const AdminCaseDetailsScreen({super.key, required this.caseId});

  @override
  ConsumerState<AdminCaseDetailsScreen> createState() =>
      _AdminCaseDetailsScreenState();
}

class _AdminCaseDetailsScreenState extends ConsumerState<AdminCaseDetailsScreen> {
  final _service = LiveDataService();
  late Future<Map<String, dynamic>> _future;
  static const int _txPageSize = 15;
  int _txPage = 1;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Map<String, dynamic>> _load() async {
    final token = ref.read(authControllerProvider).appToken ?? '';
    if (token.isEmpty) throw Exception('Missing session token');
    _txPage = 1;
    return _service.fetchAdminCaseDetails(appToken: token, caseId: widget.caseId);
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(locale: 'en_KE', symbol: 'KES ');
    return AdminShell(
      title: 'Case Details',
      currentIndex: 2,
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text(snapshot.error.toString()));
          }
          final payload = snapshot.data ?? const {};
          final c = (payload['case'] as Map?)?.cast<String, dynamic>() ?? const {};
          final txAny = payload['transactions'];
          final tx = (txAny is List)
              ? txAny.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList()
              : const <Map<String, dynamic>>[];
          final expectedAmount = _toDouble(c['expected_amount']);
          final actualAmount = _toDouble(c['actual_amount']);
          final txPages = tx.isEmpty ? 1 : ((tx.length - 1) ~/ _txPageSize) + 1;
          final currentTxPage = _txPage.clamp(1, txPages);
          final txStart = (currentTxPage - 1) * _txPageSize;
          final txEnd = (txStart + _txPageSize).clamp(0, tx.length);
          final txPageItems = tx.sublist(txStart, txEnd);
          final totalContributions = tx.fold<double>(
            0,
            (sum, t) => sum + _toDouble(t['amount']).abs(),
          );
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                '#${c['case_number'] ?? '-'} • ${(c['case_type'] ?? '').toString().toUpperCase()}',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 4),
              Text('Expected: ${money.format(expectedAmount)}'),
              Text('Actual: ${money.format(actualAmount)}'),
              Text('Contributions total: ${money.format(totalContributions)}'),
              const Divider(height: 24),
              const SizedBox(height: 8),
              Text(
                'Contributions (${tx.length})',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              ...txPageItems.map((t) => ListTile(
                    dense: true,
                    title: Text('${t['transaction_type'] ?? '-'}'),
                    subtitle: Text('${t['status'] ?? '-'}'),
                    trailing: Text(money.format(_toDouble(t['amount']).abs())),
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

  double _toDouble(dynamic value) {
    if (value == null) return 0;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? 0;
  }
}
