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

class _AdminCaseDetailsScreenState
    extends ConsumerState<AdminCaseDetailsScreen> {
  final _service = LiveDataService();
  late Future<Map<String, dynamic>> _future;
  static const int _txPageSize = 15;
  int _txPage = 1;
  String _paymentFilter = 'unpaid';

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Map<String, dynamic>> _load() async {
    final token = ref.read(authControllerProvider).appToken ?? '';
    if (token.isEmpty) throw Exception('Missing session token');
    _txPage = 1;
    return _service.fetchAdminCaseDetails(
        appToken: token, caseId: widget.caseId);
  }

  Future<void> _showPaymentFilters() async {
    var paymentFilter = _paymentFilter;
    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Filter member payments',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: paymentFilter,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Payment status',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'all', child: Text('All members')),
                  DropdownMenuItem(value: 'paid', child: Text('Paid in full')),
                  DropdownMenuItem(
                      value: 'unpaid', child: Text('Unpaid or partial')),
                ],
                onChanged: (value) =>
                    setSheetState(() => paymentFilter = value ?? 'unpaid'),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  TextButton(
                    onPressed: () {
                      setState(() => _paymentFilter = 'unpaid');
                      Navigator.of(sheetContext).pop();
                    },
                    child: const Text('Reset'),
                  ),
                  const Spacer(),
                  FilledButton(
                    onPressed: () {
                      setState(() => _paymentFilter = paymentFilter);
                      Navigator.of(sheetContext).pop();
                    },
                    child: const Text('Apply filters'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(locale: 'en_KE', symbol: 'KES ');
    final dateFmt = DateFormat('MMM dd, yyyy');
    return AdminShell(
      title: 'Case Details',
      route: '/admin/cases',
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
          final c =
              (payload['case'] as Map?)?.cast<String, dynamic>() ?? const {};
          final txAny = payload['transactions'];
          final tx = (txAny is List)
              ? txAny
                  .whereType<Map>()
                  .map((e) => e.cast<String, dynamic>())
                  .toList()
              : const <Map<String, dynamic>>[];
          final expectedAmount = _toDouble(c['expected_amount']);
          final actualAmount = _toDouble(c['actual_amount']);
          final contributionPerMember = _toDouble(c['contribution_amount']);
          final txPages = tx.isEmpty ? 1 : ((tx.length - 1) ~/ _txPageSize) + 1;
          final currentTxPage = _txPage.clamp(1, txPages);
          final txStart = (currentTxPage - 1) * _txPageSize;
          final txEnd = (txStart + _txPageSize).clamp(0, tx.length);
          final txPageItems = tx.sublist(txStart, txEnd);
          final paymentRows = (payload['payment_status'] as List?)
                  ?.whereType<Map>()
                  .map((row) => row.cast<String, dynamic>())
                  .toList() ??
              const <Map<String, dynamic>>[];
          final paidMembers = paymentRows
              .where((row) => row['payment_compliance'] == 'paid')
              .toList();
          final unpaidMembers = paymentRows
              .where((row) => row['payment_compliance'] != 'paid')
              .toList();
          final visibleMembers = switch (_paymentFilter) {
            'all' => paymentRows,
            'paid' => paidMembers,
            _ => unpaidMembers,
          };
          tx.fold<double>(
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
              const SizedBox(height: 8),
              Row(
                children: [
                  _StatusBadge(status: c['status'] ?? '-'),
                ],
              ),
              const SizedBox(height: 12),
              _InfoRow(label: 'Start Date', value: c['start_date'] ?? '-'),
              _InfoRow(
                label: 'End Date',
                value: c['end_date'] ?? 'Ongoing',
              ),
              _InfoRow(
                label: 'Contribution per member',
                value: money.format(contributionPerMember),
              ),
              const SizedBox(height: 16),
              Text(
                'Progress: ${money.format(actualAmount)} / ${money.format(expectedAmount)}',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 4),
              LinearProgressIndicator(
                value: expectedAmount > 0
                    ? (actualAmount / expectedAmount).clamp(0, 1)
                    : 0,
                backgroundColor:
                    Theme.of(context).disabledColor.withValues(alpha: 0.2),
              ),
              const Divider(height: 24),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Member payments (${visibleMembers.length})',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                  Badge(
                    isLabelVisible: _paymentFilter != 'unpaid',
                    child: IconButton.filledTonal(
                      onPressed: _showPaymentFilters,
                      tooltip: 'Filters',
                      icon: const Icon(Icons.tune),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (visibleMembers.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Text(_paymentFilter == 'paid'
                      ? 'No members have fully paid this case.'
                      : 'No member payments match this filter.'),
                )
              else
                ...visibleMembers.indexed.expand((entry) {
                  final (index, member) = entry;
                  final isPaid = member['payment_compliance'] == 'paid';
                  return [
                    ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title:
                          Text('${member['member_name'] ?? 'Unknown member'}'),
                      subtitle: Text(
                        '#${member['member_number'] ?? '-'} • ${isPaid ? 'Paid in full' : (member['payment_compliance'] == 'partial' ? 'Partial payment' : 'Unpaid')} • Paid ${money.format(_toDouble(member['net_paid']))} of ${money.format(_toDouble(member['expected_amount']))}',
                      ),
                      trailing: isPaid
                          ? const Icon(Icons.check_circle, color: Colors.green)
                          : Text(
                              'Due ${money.format(_toDouble(member['outstanding_amount']))}',
                              style: const TextStyle(
                                color: Colors.red,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                    ),
                    if (index < visibleMembers.length - 1)
                      const Divider(height: 1),
                  ];
                }),
              const Divider(height: 24),
              const SizedBox(height: 8),
              Text(
                'Transactions (${tx.length})',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              ...txPageItems.indexed.expand((entry) {
                final (index, t) = entry;
                return [
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text('${t['transaction_type'] ?? '-'}'),
                    subtitle: Text(
                      '${dateFmt.format(DateTime.parse(t['date'] ?? DateTime.now().toIso8601String()))} • ${t['status'] ?? '-'} • ${t['member_name'] ?? '-'}',
                    ),
                    trailing: Text(
                      money.format(_toDouble(t['amount']).abs()),
                      style: TextStyle(
                        color: _toDouble(t['amount']) >= 0
                            ? Colors.green
                            : Colors.red,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  if (index < txPageItems.length - 1) const Divider(height: 1),
                ];
              }),
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

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    Color bgColor;
    switch (status.toUpperCase()) {
      case 'ACTIVE':
        bgColor = Colors.green;
        break;
      case 'PENDING':
        bgColor = Colors.orange;
        break;
      case 'COMPLETED':
        bgColor = Colors.blue;
        break;
      case 'CANCELLED':
        bgColor = Colors.red;
        break;
      default:
        bgColor = Theme.of(context).disabledColor;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: bgColor),
      ),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(
          color: bgColor,
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 140,
            child: Text(
              '$label:',
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}
