import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/app_api_client.dart';

class CaseDetailsScreen extends ConsumerStatefulWidget {
  const CaseDetailsScreen({super.key, required this.caseId});
  final String caseId;

  @override
  ConsumerState<CaseDetailsScreen> createState() => _CaseDetailsScreenState();
}

class _CaseDetailsScreenState extends ConsumerState<CaseDetailsScreen> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = ref.read(appApiClientProvider).get("api-case-details", query: {"case_id": widget.caseId});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Case details")),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) return Center(child: Text("Error: ${snap.error}"));
          final c = (snap.data?["case"] as Map?)?.cast<String, dynamic>() ?? {};
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              ListTile(title: const Text("Case Number"), subtitle: Text("${c["case_number"] ?? "-"}")),
              ListTile(title: const Text("Case Type"), subtitle: Text("${c["case_type"] ?? "-"}")),
              ListTile(title: const Text("Expected"), subtitle: Text("${c["expected_amount"] ?? 0}")),
              ListTile(title: const Text("Actual"), subtitle: Text("${c["actual_amount"] ?? 0}")),
              ListTile(title: const Text("Paid"), subtitle: Text("${c["paid"] ?? false}")),
            ],
          );
        },
      ),
    );
  }
}
