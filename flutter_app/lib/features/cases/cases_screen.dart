import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'case_details_screen.dart';
import 'cases_controller.dart';

class CasesScreen extends ConsumerWidget {
  const CasesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(casesControllerProvider);
    return state.when(
      data: (items) => RefreshIndicator(
        onRefresh: () => ref.refresh(casesControllerProvider.future),
        child: ListView.builder(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
          itemCount: items.length + 1,
          itemBuilder: (context, i) {
            if (i == 0) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  'Cases',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
              );
            }

            final c = items[i - 1];
            final paid = c['paid'] == true;
            final expected = (c['expected_amount'] as num?)?.toDouble() ?? 0;
            final actual = (c['actual_amount'] as num?)?.toDouble() ?? 0;

            return Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: InkWell(
                borderRadius: BorderRadius.circular(26),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => CaseDetailsScreen(caseId: '${c['id']}')),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${c['case_number'] ?? '-'}',
                              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: paid ? const Color(0xFFE4F4DE) : const Color(0xFFFFEFE2),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              paid ? 'Paid' : 'Unpaid',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: paid ? const Color(0xFF3E8034) : const Color(0xFFB9662A),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text('${c['case_type'] ?? ''}', style: const TextStyle(color: Colors.black54)),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _AmountTile(
                              label: 'Expected',
                              amount: NumberFormat('#,##0.00').format(expected),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: _AmountTile(
                              label: 'Actual',
                              amount: NumberFormat('#,##0.00').format(actual),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Cases error: $e')),
    );
  }
}

class _AmountTile extends StatelessWidget {
  const _AmountTile({required this.label, required this.amount});

  final String label;
  final String amount;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF5F4F1),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: Colors.black54)),
          const SizedBox(height: 3),
          Text('KES $amount', style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
