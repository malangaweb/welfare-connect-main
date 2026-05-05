import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/constants/app_constants.dart';
import '../../core/services/live_data_service.dart';
import 'admin_shell.dart';

class AdminCasesScreen extends StatefulWidget {
  const AdminCasesScreen({super.key});

  @override
  State<AdminCasesScreen> createState() => _AdminCasesScreenState();
}

class _AdminCasesScreenState extends State<AdminCasesScreen> {
  final _service = LiveDataService();
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = _service.fetchAdminCases();
  }

  Future<void> _refresh() async {
    setState(() => _future = _service.fetchAdminCases());
    await _future;
  }

  Future<void> _toggleCase(Map<String, dynamic> row) async {
    final caseId = (row['id'] ?? '').toString();
    if (caseId.isEmpty) return;

    try {
      if (row['is_finalized'] == true) {
        await _service.reopenCase(caseId: caseId);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Case reopened successfully.')),
        );
      } else {
        final amount = (row['actual_amount'] as num?)?.toDouble() ??
            (row['expected_amount'] as num?)?.toDouble() ??
            0;
        await _service.finalizeCase(caseId: caseId, actualAmount: amount);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Case finalized successfully.')),
        );
      }
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Action failed: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(
      locale: 'en_KE',
      symbol: 'KES ',
      decimalDigits: 2,
    );
    return AdminShell(
      title: 'Cases',
      currentIndex: 2,
      actions: [
        IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh))
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
          final rows = snapshot.data ?? const [];
          return ListView(
            padding: const EdgeInsets.all(AppConstants.marginEdge),
            children: [
              Text(
                'Case Management',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 14),
              ...rows.map((r) {
                final isFinalized = r['is_finalized'] == true;
                final isActive = r['is_active'] == true;
                return Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: const BorderSide(color: Color(0xFFE2E8F0)),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '#${r['case_number'] ?? '-'} • ${(r['case_type'] ?? '-').toString().toUpperCase()}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 15,
                                ),
                              ),
                              const SizedBox(height: 5),
                              Text(
                                'Contribution: ${money.format((r['contribution_per_member'] as num?)?.toDouble() ?? 0)}',
                                style: const TextStyle(
                                  color: Color(0xFF475569),
                                ),
                              ),
                              const SizedBox(height: 8),
                              _statusChip(
                                isFinalized
                                    ? 'Finalized'
                                    : (isActive ? 'Active' : 'Draft'),
                                isFinalized
                                    ? const Color(0xFFDCFCE7)
                                    : (isActive
                                        ? const Color(0xFFDBEAFE)
                                        : const Color(0xFFE2E8F0)),
                                isFinalized
                                    ? const Color(0xFF166534)
                                    : (isActive
                                        ? const Color(0xFF1D4ED8)
                                        : const Color(0xFF334155)),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        FilledButton.tonal(
                          onPressed: () => _toggleCase(r),
                          child: Text(isFinalized ? 'Reopen' : 'Finalize'),
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ],
          );
        },
      ),
    );
  }

  Widget _statusChip(String label, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: fg,
          fontWeight: FontWeight.w700,
          fontSize: 11,
        ),
      ),
    );
  }
}
