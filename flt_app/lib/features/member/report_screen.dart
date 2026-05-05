import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/live_data_service.dart';
import '../auth/auth_controller.dart';
import 'member_shell.dart';

class MemberReportScreen extends ConsumerStatefulWidget {
  const MemberReportScreen({super.key});

  @override
  ConsumerState<MemberReportScreen> createState() => _MemberReportScreenState();
}

class _MemberReportScreenState extends ConsumerState<MemberReportScreen> {
  final _service = LiveDataService();
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Map<String, dynamic>> _load() {
    final auth = ref.read(authControllerProvider);
    if ((auth.memberId ?? '').isEmpty || (auth.appToken ?? '').isEmpty) {
      throw Exception('Session missing member identity. Please log in again.');
    }
    return _service.buildMemberReport(
        memberId: auth.memberId!, appToken: auth.appToken!);
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(
        locale: 'en_KE', symbol: 'KES ', decimalDigits: 2);
    return MemberShell(
      title: 'My Report',
      subtitle: 'Personal financial snapshot',
      currentIndex: 2,
      actions: [
        IconButton(
            onPressed: () => setState(() => _future = _load()),
            icon: const Icon(Icons.refresh)),
      ],
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text(snapshot.error.toString()));
          }
          final data = snapshot.data ?? const {};
          return ListView(
            padding: const EdgeInsets.all(AppConstants.marginEdge),
            children: [
              _tile(
                  'Wallet Balance',
                  money.format(
                      (data['wallet_balance'] as num?)?.toDouble() ?? 0)),
              _tile('Total Transactions', '${data['total_transactions'] ?? 0}'),
              _tile(
                  'Total Credits',
                  money.format(
                      (data['total_credits'] as num?)?.toDouble() ?? 0)),
              _tile(
                  'Total Debits',
                  money
                      .format((data['total_debits'] as num?)?.toDouble() ?? 0)),
              _tile('Active Cases', '${data['active_cases'] ?? 0}'),
            ],
          );
        },
      ),
    );
  }

  Widget _tile(String label, String value) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFDCE3EE)),
      ),
      child: Row(
        children: [
          Expanded(
              child: Text(label,
                  style: const TextStyle(fontWeight: FontWeight.w700))),
          Expanded(child: Text(value, textAlign: TextAlign.right)),
        ],
      ),
    );
  }
}
