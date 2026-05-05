import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/live_data_service.dart';
import '../auth/auth_controller.dart';
import 'member_shell.dart';

class CasesScreen extends ConsumerStatefulWidget {
  const CasesScreen({super.key});

  @override
  ConsumerState<CasesScreen> createState() => _CasesScreenState();
}

class _CasesScreenState extends ConsumerState<CasesScreen> {
  final _service = LiveDataService();
  late Future<List<MemberCaseSnapshot>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<MemberCaseSnapshot>> _load() {
    final auth = ref.read(authControllerProvider);
    if ((auth.memberId ?? '').isEmpty || (auth.appToken ?? '').isEmpty) {
      throw Exception('Session missing member identity. Please log in again.');
    }
    return _service.fetchMemberCases(
      memberId: auth.memberId!,
      appToken: auth.appToken!,
    );
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(
        locale: 'en_KE', symbol: 'KES ', decimalDigits: 2);

    return MemberShell(
      title: 'My Cases',
      subtitle: 'Obligations',
      currentIndex: 1,
      actions: [
        IconButton(
            onPressed: () => setState(() => _future = _load()),
            icon: const Icon(Icons.refresh)),
      ],
      body: FutureBuilder<List<MemberCaseSnapshot>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text(snapshot.error.toString()));
          }

          final cases = snapshot.data ?? const <MemberCaseSnapshot>[];
          if (cases.isEmpty) {
            return const Center(child: Text('No active cases found.'));
          }

          final paidCount = cases.where((c) => c.paid).length;
          final pendingCount = cases.length - paidCount;

          return ListView(
            padding: const EdgeInsets.all(AppConstants.marginEdge),
            children: [
              Row(
                children: [
                  Expanded(
                      child: _SummaryBox(
                          label: 'Total', value: '${cases.length}')),
                  const SizedBox(width: 10),
                  Expanded(
                      child: _SummaryBox(label: 'Paid', value: '$paidCount')),
                  const SizedBox(width: 10),
                  Expanded(
                      child: _SummaryBox(
                          label: 'Pending', value: '$pendingCount')),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                    color: const Color(0xFFE7EDF7),
                    borderRadius: BorderRadius.circular(10)),
                child: const Row(
                  children: [
                    Expanded(
                        flex: 3,
                        child: Text('Case',
                            style: TextStyle(fontWeight: FontWeight.w700))),
                    Expanded(
                        flex: 2,
                        child: Text('Required',
                            style: TextStyle(fontWeight: FontWeight.w700))),
                    Expanded(
                        flex: 2,
                        child: Text('Status',
                            textAlign: TextAlign.right,
                            style: TextStyle(fontWeight: FontWeight.w700))),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              ...cases.map((c) => Container(
                    margin: const EdgeInsets.only(bottom: 6),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFDCE3EE)),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                            flex: 3,
                            child: Text(
                                '#${c.caseNumber}  ${c.caseType.toUpperCase()}')),
                        Expanded(
                            flex: 2,
                            child: Text(money.format(c.contributionPerMember))),
                        Expanded(
                          flex: 2,
                          child: Text(
                            c.paid ? 'PAID' : 'PENDING',
                            textAlign: TextAlign.right,
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              color: c.paid
                                  ? const Color(0xFF0A7C2F)
                                  : const Color(0xFFB34700),
                            ),
                          ),
                        ),
                      ],
                    ),
                  )),
            ],
          );
        },
      ),
    );
  }
}

class _SummaryBox extends StatelessWidget {
  final String label;
  final String value;
  const _SummaryBox({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFDCE3EE)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.labelSmall),
          const SizedBox(height: 3),
          Text(value,
              style:
                  const TextStyle(fontWeight: FontWeight.w800, fontSize: 20)),
        ],
      ),
    );
  }
}
