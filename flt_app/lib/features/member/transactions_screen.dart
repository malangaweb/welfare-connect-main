import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/live_data_service.dart';
import '../auth/auth_controller.dart';
import 'member_shell.dart';

class MemberTransactionsScreen extends ConsumerStatefulWidget {
  const MemberTransactionsScreen({super.key});

  @override
  ConsumerState<MemberTransactionsScreen> createState() =>
      _MemberTransactionsScreenState();
}

class _MemberTransactionsScreenState
    extends ConsumerState<MemberTransactionsScreen> {
  final _service = LiveDataService();
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() {
    final auth = ref.read(authControllerProvider);
    if ((auth.memberId ?? '').isEmpty || (auth.appToken ?? '').isEmpty) {
      throw Exception('Session missing member identity. Please log in again.');
    }
    return _service.fetchMemberTransactions(
      memberId: auth.memberId!,
      appToken: auth.appToken!,
      pageSize: 200,
    );
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(
        locale: 'en_KE', symbol: 'KES ', decimalDigits: 2);

    return MemberShell(
      title: 'Transactions',
      subtitle: 'Ledger view',
      currentIndex: 2,
      actions: [
        IconButton(
            onPressed: () => setState(() => _future = _load()),
            icon: const Icon(Icons.refresh)),
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

          final items = snapshot.data ?? const <Map<String, dynamic>>[];
          if (items.isEmpty) {
            return const Center(child: Text('No transactions found.'));
          }

          return ListView(
            padding: const EdgeInsets.all(AppConstants.marginEdge),
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFFE7EDF7),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Row(
                  children: [
                    Expanded(
                        flex: 4,
                        child: Text('Description',
                            style: TextStyle(fontWeight: FontWeight.w700))),
                    Expanded(
                        flex: 3,
                        child: Text('Date',
                            style: TextStyle(fontWeight: FontWeight.w700))),
                    Expanded(
                        flex: 2,
                        child: Text('Amount',
                            textAlign: TextAlign.right,
                            style: TextStyle(fontWeight: FontWeight.w700))),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              ...items.map((tx) {
                final createdAt = DateTime.tryParse('${tx['created_at']}');
                final amount = (tx['amount'] as num?)?.toDouble() ??
                    double.tryParse('${tx['amount']}') ??
                    0;
                final type = '${tx['transaction_type'] ?? 'transaction'}'
                    .replaceAll('_', ' ');
                final description = '${tx['description'] ?? ''}'.trim();

                return Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFDCE3EE)),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                          flex: 4,
                          child: Text(description.isEmpty ? type : description,
                              maxLines: 2, overflow: TextOverflow.ellipsis)),
                      Expanded(
                        flex: 3,
                        child: Text(
                            createdAt == null
                                ? '-'
                                : DateFormat('MMM d, yyyy')
                                    .format(createdAt.toLocal()),
                            style: const TextStyle(color: Color(0xFF5E6B7A))),
                      ),
                      Expanded(
                        flex: 2,
                        child: Text(money.format(amount.abs()),
                            textAlign: TextAlign.right,
                            style:
                                const TextStyle(fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                );
              }),
            ],
          );
        },
      ),
    );
  }
}
