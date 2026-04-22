import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
          itemCount: items.length,
          itemBuilder: (context, i) {
            final c = items[i];
            return ListTile(
              title: Text("${c["case_number"] ?? "-"} - ${c["case_type"] ?? ""}"),
              subtitle: Text("Expected: ${c["expected_amount"] ?? 0}, Actual: ${c["actual_amount"] ?? 0}"),
              trailing: Text((c["paid"] == true) ? "Paid" : "Unpaid"),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => CaseDetailsScreen(caseId: "${c["id"]}")),
              ),
            );
          },
        ),
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text("Cases error: $e")),
    );
  }
}
