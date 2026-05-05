import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/live_data_service.dart';
import '../../core/theme/app_colors.dart';
import '../auth/auth_controller.dart';

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

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              color: AppColors.primary,
              child: Row(
                children: [
                  const Text('My Cases',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.w700)),
                  const Spacer(),
                  IconButton(
                    onPressed: () => setState(() => _future = _load()),
                    icon: const Icon(Icons.refresh, color: Colors.white),
                  ),
                ],
              ),
            ),
            Expanded(
              child: FutureBuilder<List<MemberCaseSnapshot>>(
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

                  return ListView.separated(
                    padding: const EdgeInsets.all(AppConstants.marginEdge),
                    itemCount: cases.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, i) {
                      final c = cases[i];
                      return Card(
                        child: ListTile(
                          title: Text('Case #${c.caseNumber}'),
                          subtitle: Text(
                              '${c.caseType} • Required: ${money.format(c.contributionPerMember)}'),
                          trailing: Chip(
                            label: Text(c.paid ? 'Paid' : 'Pending'),
                            backgroundColor: c.paid
                                ? Colors.green.shade100
                                : Colors.orange.shade100,
                          ),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
            BottomNavigationBar(
              currentIndex: 1,
              onTap: (index) {
                if (index == 0) context.go('/member/wallet');
                if (index == 1) context.go('/member/cases');
                if (index == 2) context.go('/member/payments');
              },
              items: const [
                BottomNavigationBarItem(
                    icon: Icon(Icons.account_balance_wallet), label: 'Wallet'),
                BottomNavigationBarItem(
                    icon: Icon(Icons.assignment), label: 'Cases'),
                BottomNavigationBarItem(
                    icon: Icon(Icons.payments), label: 'Payments'),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
